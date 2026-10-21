/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  createContentProvider,
  createIModelContentConfiguration,
  resolveContentSources,
} from "@itwin/presentation-content";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { mapConcurrently } from "../Concurrency.js";
import { CAPTURE_FORMAT_VERSION, stableStringify } from "../Persistence.js";
import { QueryScope, runInQueryContext, summarizeCanceledQueries } from "../QueryScope.js";

import type { IModelDb } from "@itwin/core-backend";
import type { ContentItem, ContentTarget, PropertyField, ReadonlyContentDescriptor } from "@itwin/presentation-content";
import type { ECSchemaProvider, ECSqlQueryExecutor, InstanceKey, RelationshipPath } from "@itwin/presentation-shared";
import type {
  AllElementsDescriptorScenario,
  CaptureDiagnostics,
  CaptureEnvelope,
  SampledElementsScenario,
  Scenario,
} from "../Persistence.js";

const SAMPLED_ITEM_CONCURRENCY = 4;

export type CapturedNewValue = ContentItem["values"][string];

export interface CapturedRelatedValues {
  path: RelationshipPath;
  entries: Array<{ key: InstanceKey; relationshipKey?: InstanceKey; values: Record<string, CapturedNewValue> }>;
}

export interface CapturedNewItem {
  descriptor: ReadonlyContentDescriptor;
  primaryKey: InstanceKey;
  values: ContentItem["values"];
  related: CapturedRelatedValues[];
}

type NewCaptureEnvelope = Omit<CaptureEnvelope<"new">, "scenario">;

export type NewCapture = NewCaptureEnvelope &
  (
    | { scenario: AllElementsDescriptorScenario; descriptor: ReadonlyContentDescriptor }
    | { scenario: SampledElementsScenario; items: CapturedNewItem[] }
  );

function captureNewItem(item: ContentItem, descriptor: ReadonlyContentDescriptor): CapturedNewItem {
  const fields = Object.values(descriptor.fields);
  const relatedPaths = new Map<string, RelationshipPath>();
  for (const field of fields) {
    if (field.kind === "property" && field.pathFromTarget.length > 0) {
      relatedPaths.set(stableStringify(field.pathFromTarget), field.pathFromTarget as RelationshipPath);
    }
  }
  const related = [...relatedPaths.values()].map((path) => ({
    path,
    entries: item
      .getRelatedInstances({ pathFromTarget: path })
      .map((entry) => ({
        key: entry.key,
        relationshipKey: entry.relationshipKey,
        values: Object.fromEntries(
          fields
            .filter(
              (field): field is PropertyField =>
                field.kind === "property" && stableStringify(field.pathFromTarget) === stableStringify(path),
            )
            .map((field) => [field.id, entry.getValue(field)]),
        ),
      })),
  }));
  return { descriptor, primaryKey: item.primaryKey, values: item.values, related };
}

export async function captureNew(props: {
  imodel: IModelDb;
  signal: AbortSignal;
  scenario: Scenario;
  implementationFingerprint: string;
  imodelFingerprint: string;
  /** Receives the capture's ECSQL query report after all of its queries have settled, including when it fails. */
  onDiagnostics?: (diagnostics: CaptureDiagnostics) => void;
}): Promise<NewCapture> {
  const { imodel, onDiagnostics, ...captureProps } = props;
  const scope = new QueryScope(props.signal);
  const imodelAccess = { ...createECSchemaProvider(imodel), ...scope.wrap(createECSqlQueryExecutor(imodel)) };
  try {
    return await captureContent({ ...captureProps, imodelAccess });
  } catch (error) {
    // A failing pipeline may stop awaiting its other queries, so settle them before the caller closes the iModel.
    await scope.cancelAll(new Error("Canceled after an earlier failure in the same capture.", { cause: error }));
    throw error;
  } finally {
    const report = scope.getReport();
    if (report.totalQueries > 0) {
      onDiagnostics?.({ details: report, failureSummary: summarizeCanceledQueries(report) });
    }
  }
}

async function captureContent(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  signal: AbortSignal;
  scenario: Scenario;
  implementationFingerprint: string;
  imodelFingerprint: string;
}): Promise<NewCapture> {
  const { imodelAccess, signal, scenario } = props;
  const config = await runInQueryContext({ phase: "configuration" }, async () =>
    createIModelContentConfiguration({ imodelAccess }),
  );
  if (scenario.id === "sampled-elements") {
    const items = await mapConcurrently({
      items: scenario.keys,
      concurrency: SAMPLED_ITEM_CONCURRENCY,
      callback: async (key) => {
        const itemTargets: ContentTarget[] = [{ primaryClass: key.className, instanceIds: [key.id] }];
        const itemSources = await runInQueryContext({ phase: "resolve-sources", instanceKey: key }, async () =>
          resolveContentSources({ imodelAccess, targets: itemTargets, config }),
        );
        const itemProvider = createContentProvider({ imodelAccess, sources: itemSources, config });
        const itemDescriptor = await runInQueryContext({ phase: "descriptor", instanceKey: key }, async () =>
          itemProvider.getContentDescriptor(),
        );
        const capturedItems = await runInQueryContext({ phase: "items", instanceKey: key }, async () => {
          const result: CapturedNewItem[] = [];
          for await (const item of itemProvider.getItems()) {
            result.push(captureNewItem(item, itemDescriptor));
          }
          return result;
        });
        if (capturedItems.length !== 1) {
          throw new Error(
            `Expected one new-generation content item for '${key.className}:${key.id}', found ${capturedItems.length}.`,
          );
        }
        return capturedItems[0];
      },
      signal,
    });
    return {
      captureFormatVersion: CAPTURE_FORMAT_VERSION,
      implementation: "new",
      implementationFingerprint: props.implementationFingerprint,
      imodelFingerprint: props.imodelFingerprint,
      scenario,
      createdAt: new Date().toISOString(),
      items,
    };
  }

  const allElementTargets: ContentTarget[] = [{ primaryClass: "BisCore.GeometricElement3d" as const }];
  const allElementSources = await runInQueryContext({ phase: "resolve-sources" }, async () =>
    resolveContentSources({ imodelAccess, targets: allElementTargets, config }),
  );
  const allElementProvider = createContentProvider({ imodelAccess, sources: allElementSources, config });
  const allElementDescriptor = await runInQueryContext({ phase: "descriptor" }, async () =>
    allElementProvider.getContentDescriptor(),
  );
  return {
    captureFormatVersion: CAPTURE_FORMAT_VERSION,
    implementation: "new",
    implementationFingerprint: props.implementationFingerprint,
    imodelFingerprint: props.imodelFingerprint,
    scenario,
    createdAt: new Date().toISOString(),
    descriptor: allElementDescriptor,
  };
}

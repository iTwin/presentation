/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  dematerialize,
  filter,
  from,
  lastValueFrom,
  map,
  materialize,
  mergeMap,
  of,
  ReplaySubject,
  takeUntil,
  tap,
  toArray,
} from "rxjs";
import {
  createContentProvider,
  createIModelContentConfiguration,
  resolveContentSources,
} from "@itwin/presentation-content";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { CAPTURE_FORMAT_VERSION, stableStringify } from "../Persistence.js";

import type { IModelDb } from "@itwin/core-backend";
import type { ContentItem, ContentTarget, PropertyField, ReadonlyContentDescriptor } from "@itwin/presentation-content";
import type { InstanceKey, RelationshipPath } from "@itwin/presentation-shared";
import type {
  AllElementsDescriptorScenario,
  CaptureEnvelope,
  SampledElementsScenario,
  Scenario,
} from "../Persistence.js";

const SAMPLED_ITEM_CONCURRENCY = 4;

function createIModelAccess(imodel: IModelDb) {
  return { ...createECSchemaProvider(imodel), ...createECSqlQueryExecutor(imodel) };
}

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
  scenario: Scenario;
  implementationFingerprint: string;
  imodelFingerprint: string;
}): Promise<NewCapture> {
  const { imodel, scenario } = props;
  const imodelAccess = createIModelAccess(imodel);
  const config = await createIModelContentConfiguration({ imodelAccess });
  if (scenario.id === "sampled-elements") {
    const items = await mapConcurrently(scenario.keys, SAMPLED_ITEM_CONCURRENCY, async (key) => {
      const itemTargets: ContentTarget[] = [{ primaryClass: key.className, instanceIds: [key.id] }];
      const itemSources = await resolveContentSources({ imodelAccess, targets: itemTargets, config });
      const itemProvider = createContentProvider({ imodelAccess, sources: itemSources, config });
      const itemDescriptor = await itemProvider.getContentDescriptor();
      const capturedItems: CapturedNewItem[] = [];
      for await (const item of itemProvider.getItems()) {
        capturedItems.push(captureNewItem(item, itemDescriptor));
      }
      if (capturedItems.length !== 1) {
        throw new Error(
          `Expected one new-generation content item for '${key.className}:${key.id}', found ${capturedItems.length}.`,
        );
      }
      return capturedItems[0];
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
  const allElementSources = await resolveContentSources({ imodelAccess, targets: allElementTargets, config });
  const allElementProvider = createContentProvider({ imodelAccess, sources: allElementSources, config });
  const allElementDescriptor = await allElementProvider.getContentDescriptor();
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

/** Stops starting work on failure or abort, but drains running promises before rejecting. */
async function mapConcurrently<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  callback: (item: TItem) => Promise<TResult>,
  signal?: AbortSignal,
): Promise<TResult[]> {
  signal?.throwIfAborted();
  const stop = new ReplaySubject<void>(1);
  return lastValueFrom(
    from(items).pipe(
      mergeMap(
        (item, index) =>
          of(item).pipe(
            // Gate callbacks before mergeMap so stopping doesn't unsubscribe from running promises.
            takeUntil(stop),
            mergeMap(async (value) => {
              signal?.throwIfAborted();
              return callback(value);
            }),
            materialize(),
            filter((notification) => notification.kind !== "C"),
            tap((notification) => {
              if (notification.kind === "E") {
                stop.next();
              }
            }),
            map((notification) => ({ index, notification })),
          ),
        concurrency,
      ),
      toArray(),
      mergeMap((outcomes) => {
        signal?.throwIfAborted();
        const failure = outcomes.find(({ notification }) => notification.kind === "E");
        return from(failure ? [failure] : outcomes.sort((a, b) => a.index - b.index));
      }),
      map(({ notification }) => notification),
      dematerialize(),
      toArray(),
    ),
  );
}

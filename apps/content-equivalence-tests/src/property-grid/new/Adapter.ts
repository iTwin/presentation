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
// The test app's mapping is what's being compared, so it's used as-is rather than copied.
import { createPropertyData } from "../../../../test-app/frontend/src/components/content-properties-widget/TransformToPropertyRecord.js";
import { mapConcurrently } from "../../Concurrency.js";
import { QueryScope, runInQueryContext, summarizeCanceledQueries } from "../../QueryScope.js";
import { capturePropertyData, createPropertyGridCapture } from "../Capture.js";

import type { IModelDb } from "@itwin/core-backend";
import type { ContentConfiguration, ContentItem, ContentTarget } from "@itwin/presentation-content";
import type { ECSchemaProvider, ECSqlQueryExecutor, InstanceKey } from "@itwin/presentation-shared";
import type { CaptureDiagnostics, SampledElementsPropertyGridScenario } from "../../Persistence.js";
import type { CapturedPropertyGridItem, PropertyGridCapture } from "../Capture.js";

const SAMPLED_ITEM_CONCURRENCY = 4;

async function captureItem(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  config: ContentConfiguration;
  key: InstanceKey;
}): Promise<CapturedPropertyGridItem> {
  const { imodelAccess, config, key } = props;
  const targets: ContentTarget[] = [{ primaryClass: key.className, instanceIds: [key.id] }];
  const sources = await runInQueryContext({ phase: "resolve-sources", instanceKey: key }, async () =>
    resolveContentSources({ imodelAccess, targets, config }),
  );
  const provider = createContentProvider({ imodelAccess, sources, config });
  const descriptor = await runInQueryContext({ phase: "descriptor", instanceKey: key }, async () =>
    provider.getContentDescriptor(),
  );
  const items = await runInQueryContext({ phase: "items", instanceKey: key }, async () => {
    const result: ContentItem[] = [];
    for await (const item of provider.getItems()) {
      result.push(item);
    }
    return result;
  });
  if (items.length !== 1) {
    throw new Error(
      `Expected one new-generation content item for '${key.className}:${key.id}', found ${items.length}.`,
    );
  }
  const data = await runInQueryContext({ phase: "property-data", instanceKey: key }, async () =>
    createPropertyData({ descriptor, items }),
  );
  return { primaryKey: key, data: await capturePropertyData(data) };
}

/** Creates property grid data for each sampled element using the content package and the test app's mapping. */
export async function captureNewPropertyGrid(props: {
  imodel: IModelDb;
  signal: AbortSignal;
  scenario: SampledElementsPropertyGridScenario;
  implementationFingerprint: string;
  imodelFingerprint: string;
  /** Receives the capture's ECSQL query report after all of its queries have settled, including when it fails. */
  onDiagnostics?: (diagnostics: CaptureDiagnostics) => void;
}): Promise<PropertyGridCapture<"new">> {
  const { imodel, signal, scenario, onDiagnostics } = props;
  const scope = new QueryScope(signal);
  const imodelAccess = { ...createECSchemaProvider(imodel), ...scope.wrap(createECSqlQueryExecutor(imodel)) };
  const cancelReason = (error: unknown) =>
    new Error("Canceled after an earlier failure in the same capture.", { cause: error });
  try {
    const config = await runInQueryContext({ phase: "configuration" }, async () =>
      createIModelContentConfiguration({ imodelAccess }),
    );
    const items = await mapConcurrently({
      items: scenario.keys,
      concurrency: SAMPLED_ITEM_CONCURRENCY,
      callback: async (key) => {
        try {
          return await captureItem({ imodelAccess, config, key });
        } catch (error) {
          // Cancel queries of items still running.
          scope.abort(cancelReason(error));
          throw error;
        }
      },
      signal,
    });
    return createPropertyGridCapture({ ...props, implementation: "new", items });
  } catch (error) {
    // A failing pipeline may stop awaiting its other queries, so settle them before the caller closes the iModel.
    scope.abort(cancelReason(error));
    await scope.settle();
    throw error;
  } finally {
    const report = scope.getReport();
    if (report.totalQueries > 0) {
      onDiagnostics?.({ details: report, failureSummary: summarizeCanceledQueries(report) });
    }
  }
}

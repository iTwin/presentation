/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { SnapshotDb } from "@itwin/core-backend";
import { createIModelContentConfiguration } from "@itwin/presentation-content";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { Datasets } from "../util/Datasets.js";
import { run } from "../util/TestUtilities.js";

import type { ContentConfiguration, PropertyField, ReadonlyContentDescriptor } from "@itwin/presentation-content";
import type { ECSchemaProvider, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import type { Dataset, IModelName } from "../util/Datasets.js";
import type { RunOptions } from "../util/TestUtilities.js";

/**
 * Returns the property fields of the given descriptor, optionally only those of the given property. They're typed as
 * mutable, so they can be used in sorting and filtering options.
 */
export function getPropertyFields({
  descriptor,
  propertyName,
}: {
  descriptor: ReadonlyContentDescriptor;
  propertyName?: string;
}): PropertyField[] {
  return Object.values(descriptor.fields).filter(
    (field): field is PropertyField =>
      field.kind === "property" && (propertyName === undefined || field.propertyName === propertyName),
  );
}

/** Number of items the content provider loads per page. Tests that load only the first page read this many items. */
export const PAGE_SIZE = 1000;

/** Number of pages loaded by tests that iterate multiple pages, but not all items. */
export const BOUNDED_PAGE_COUNT = 5;

export interface ContentTestContext<TName extends IModelName = IModelName> {
  imodel: SnapshotDb;
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  /** The dataset that `imodel` was opened from. */
  dataset: Dataset<TName>;
  config: ContentConfiguration;
}

/**
 * Schema-provider states to compare content loading with. A fresh provider resets schema-provider caches on every
 * call, but not database or operating-system caches.
 */
export const SCHEMA_PROVIDER_SCENARIOS = [
  {
    name: "fresh schema provider",
    getIModelAccess: ({ imodel }: ContentTestContext): ContentTestContext["imodelAccess"] => ({
      ...createECSchemaProvider(imodel),
      ...createECSqlQueryExecutor(imodel),
    }),
  },
  { name: "reused schema provider", getIModelAccess: ({ imodelAccess }: ContentTestContext) => imodelAccess },
] as const;
export type SchemaProviderScenario = (typeof SCHEMA_PROVIDER_SCENARIOS)[number];

export function runContentTest<T, TName extends IModelName>(
  props: Omit<RunOptions<T>, "setup" | "cleanup"> & {
    imodelName: TName;
    setup(context: ContentTestContext<TName>): T | Promise<T>;
  },
) {
  run({
    ...props,
    setup: async () => {
      const dataset = Datasets.getDataset({ name: props.imodelName });
      const imodel = SnapshotDb.openFile(dataset.imodelPath);
      try {
        const imodelAccess = { ...createECSchemaProvider(imodel), ...createECSqlQueryExecutor(imodel) };
        const config = await createIModelContentConfiguration({ imodelAccess });
        return { imodel, context: await props.setup({ imodel, dataset, imodelAccess, config }) };
      } catch (error) {
        imodel.close();
        throw error;
      }
    },
    test: async ({ context }) => props.test(context),
    cleanup: ({ imodel }) => imodel.close(),
  });
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { getPropertyFields, runContentTest, SCHEMA_PROVIDER_SCENARIOS } from "./ContentTestUtilities.js";

import type { ContentTestContext, SchemaProviderScenario } from "./ContentTestUtilities.js";

describe("Content descriptor", () => {
  for (const schemaProvider of SCHEMA_PROVIDER_SCENARIOS) {
    // All 500 classes inherit the base class property, stressing merging it into a single field.
    runContentTest({
      testName: `500 concrete classes, ${schemaProvider.name}`,
      imodelName: "50k elements in 500 classes",
      setup: async (context) => setupDescriptorBuild({ context, schemaProvider }),
      test: async ({ build, dataset: { meta } }) => {
        const fields = getPropertyFields({ descriptor: await build(), propertyName: meta.schema.propertyName });
        expect(fields).toHaveLength(1);
        expect(fields[0].valueClassNames).toHaveLength(meta.classCount);
      },
    });

    // Display overrides for 50 of the 500 classes split the merged base class property field.
    runContentTest({
      testName: `500 concrete classes, 50 display modifiers, ${schemaProvider.name}`,
      imodelName: "50k elements in 500 classes with 50 content modifiers",
      setup: async (context) => setupDescriptorBuild({ context, schemaProvider }),
      test: async ({ build, dataset: { meta } }) => {
        const { schema, contentModifiers } = meta;
        const fields = getPropertyFields({ descriptor: await build(), propertyName: schema.propertyName });
        expect(fields).toHaveLength(contentModifiers.count + 1);
        expect(fields.reduce((count, field) => count + field.valueClassNames.length, 0)).toBe(meta.classCount);
        for (let i = 0; i < contentModifiers.count; ++i) {
          const field = fields.find((candidate) => candidate.label === `${contentModifiers.labelPrefix} ${i}`);
          expect(field?.valueClassNames).toEqual([`${schema.name}.${schema.classNamePrefix}_${i}`]);
          expect(field?.hidden).toBe(false);
        }
      },
    });
  }
});

/**
 * Resolves sources outside timing to isolate descriptor building. Returns the dataset and a function that builds the
 * descriptor using the given schema provider.
 */
async function setupDescriptorBuild<
  TName extends "50k elements in 500 classes" | "50k elements in 500 classes with 50 content modifiers",
>({ context, schemaProvider }: { context: ContentTestContext<TName>; schemaProvider: SchemaProviderScenario }) {
  const { imodelAccess, config, dataset } = context;
  const { schema } = dataset.meta;
  const sources = await resolveContentSources({
    imodelAccess,
    targets: [{ primaryClass: `${schema.name}.${schema.baseClassName}` }],
    config,
  });
  expect(sources[0].resolvedPrimaryClasses).toHaveLength(dataset.meta.classCount);
  // Recreate the provider on every call to measure building, not its cached descriptor.
  const build = async () =>
    createContentProvider({
      imodelAccess: schemaProvider.getIModelAccess(context),
      sources,
      config,
    }).getContentDescriptor();
  // Warm up database caches, as well as schema-provider caches when the provider is reused.
  await build();
  return { build, dataset };
}

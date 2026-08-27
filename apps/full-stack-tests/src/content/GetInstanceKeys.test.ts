/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContentProvider, resolveContentSources } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { createContentIModelAccess, getPropertyFieldsByName } from "./Utils.js";

import type { InstanceKey } from "@itwin/presentation-shared";

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) {
    result.push(value);
  }
  return result;
}

function expectKeys(actual: InstanceKey[], expected: InstanceKey[]) {
  expect(actual).toHaveLength(expected.length);
  expect(actual).toEqual(expect.arrayContaining(expected));
}

describe("Content", () => {
  describe("getInstanceKeys", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("gets matching keys across sources and returns concrete polymorphic classes", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const schema = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Score" typeName="int" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECProperty propertyName="Score" typeName="int" />
            </ECEntityClass>
            <ECEntityClass typeName="Base" modifier="Abstract" />
            <ECEntityClass typeName="Derived">
              <BaseClass>Base</BaseClass>
            </ECEntityClass>
          `,
        );
        const a1 = builder.insertInstance(schema.items.A.fullName, { score: 1 });
        const a2 = builder.insertInstance(schema.items.A.fullName, { score: 2 });
        const b = builder.insertInstance(schema.items.B.fullName, { score: 3 });
        const derived = builder.insertInstance(schema.items.Derived.fullName);
        return { schema, a1, a2, b, derived };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);

      const aSources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const aProvider = createContentProvider({ imodelAccess, sources: aSources });
      expectKeys(await collect(aProvider.getInstanceKeys()), [setup.a1, setup.a2]);

      const scoreField = getPropertyFieldsByName(await aProvider.getContentDescriptor(), "Score")[0];
      expectKeys(
        await collect(aProvider.getInstanceKeys({ filters: [{ field: scoreField, operator: "is-equal", value: 2 }] })),
        [setup.a2],
      );

      const separateSources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }, { primaryClass: setup.schema.items.B.fullName }],
      });
      expectKeys(await collect(createContentProvider({ imodelAccess, sources: separateSources }).getInstanceKeys()), [
        setup.a1,
        setup.a2,
        setup.b,
      ]);

      const polymorphicSources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Base.fullName }],
      });
      expectKeys(
        await collect(createContentProvider({ imodelAccess, sources: polymorphicSources }).getInstanceKeys()),
        [setup.derived],
      );
    });
  });
});

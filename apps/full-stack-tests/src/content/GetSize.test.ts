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

describe("Content", () => {
  describe("getSize", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("counts all sources and applies value filters", async () => {
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
          `,
        );
        builder.insertInstance(schema.items.A.fullName, { score: 1 });
        builder.insertInstance(schema.items.A.fullName, { score: 2 });
        builder.insertInstance(schema.items.A.fullName, { score: 2 });
        builder.insertInstance(schema.items.B.fullName, { score: 3 });
        builder.insertInstance(schema.items.B.fullName, { score: 4 });
        return { schema };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }, { primaryClass: setup.schema.items.B.fullName }],
      });

      const provider = createContentProvider({ imodelAccess, sources });
      await expect(provider.getSize()).resolves.toBe(5);

      const scoreField = getPropertyFieldsByName(await provider.getContentDescriptor(), "Score").find(
        (field) => field.propertyClassName === setup.schema.items.A.fullName,
      );
      if (!scoreField) {
        throw new Error("Expected Score property field for A");
      }
      await expect(
        provider.getSize({ filters: [{ field: scoreField, operator: "is-equal", value: 2 }] }),
      ).resolves.toBe(2);
    });
  });
});

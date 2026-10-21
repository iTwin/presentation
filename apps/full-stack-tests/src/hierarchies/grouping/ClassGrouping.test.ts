/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, it } from "vitest";
import { buildTestECDb } from "../../ECDbUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createProvider } from "../Utils.js";

import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";

describe("Hierarchies", () => {
  describe("Class grouping", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("creates different groups for different classes", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="B">
              <ECProperty propertyName="CodeValue" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="X">
              <BaseClass>B</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="Y">
              <BaseClass>B</BaseClass>
            </ECEntityClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "1" });
        const y2 = builder.insertInstance(s.items.Y.fullName, { codeValue: "2" });
        const x3 = builder.insertInstance(s.items.X.fullName, { codeValue: "3" });
        const y4 = builder.insertInstance(s.items.Y.fullName, { codeValue: "4" });
        return { schema: s, x1, y2, x3, y4 };
      });
      const { ecdb, schema, ...keys } = setup;

      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (!parentNode) {
            return [
              {
                fullClassName: schema.items.B.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                      grouping: { byClass: true },
                    })}
                    FROM (
                      SELECT ECClassId, ECInstanceId, CodeValue
                      FROM ${schema.items.X.fullName}
                      UNION ALL
                      SELECT ECClassId, ECInstanceId, CodeValue
                      FROM ${schema.items.Y.fullName}
                    ) AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createProvider({ ecdb, hierarchy }),
        expect: [
          NodeValidators.createForClassGroupingNode({
            className: schema.items.X.fullName,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x3], children: false }),
            ],
          }),
          NodeValidators.createForClassGroupingNode({
            className: schema.items.Y.fullName,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.y2], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.y4], children: false }),
            ],
          }),
        ],
      });
    });
  });
});

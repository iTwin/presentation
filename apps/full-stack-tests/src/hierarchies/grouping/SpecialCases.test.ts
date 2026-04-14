/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, it } from "vitest";
import { createNodesQueryClauseFactory, HierarchyNode } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
import { buildTestECDb } from "../../ECDbUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createIModelAccess, createProvider } from "../Utils.js";

import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";

describe("Hierarchies", () => {
  describe("Grouping special cases", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("groups children of hidden hierarchy levels", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="B" />
            <ECEntityClass typeName="X">
              <BaseClass>B</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="Y">
              <BaseClass>B</BaseClass>
            </ECEntityClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName);
        const x2 = builder.insertInstance(s.items.X.fullName);
        const y1 = builder.insertInstance(s.items.Y.fullName);
        const y2 = builder.insertInstance(s.items.Y.fullName);
        return { schema: s, x1, x2, y1, y2 };
      });
      const { ecdb: db, schema, ...keys } = setup;
      const imodelAccess = createIModelAccess(db);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
          classHierarchyInspector: imodelAccess,
        }),
      });
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "x",
                      hideNodeInHierarchy: true,
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                },
              },
            ];
          }
          if (
            HierarchyNode.isInstancesNode(parentNode) &&
            parentNode.key.instanceKeys.some((k) => k.className === schema.items.X.fullName)
          ) {
            return [
              {
                fullClassName: schema.items.Y.fullName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `'y: ' || CAST(this.ECInstanceId AS TEXT)` },
                      grouping: { byClass: true },
                    })}
                    FROM ${schema.items.Y.fullName} AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };
      await validateHierarchy({
        provider: createProvider({ ecdb: db, hierarchy }),
        expect: [
          NodeValidators.createForClassGroupingNode({
            label: "Y",
            className: schema.items.Y.fullName,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.y1], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.y2], children: false }),
            ],
          }),
        ],
      });
    });
  });
});

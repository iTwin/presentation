/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode, IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory } from "@itwin/presentation-hierarchies";
import { importSchema, withECDb } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createMetadataProvider, createProvider } from "../Utils";

describe("Stateless hierarchy builder", () => {
  describe("Grouping special cases", () => {
    before(async function () {
      await initialize();
    });

    after(async () => {
      await terminate();
    });

    it("groups children of hidden hierarchy levels", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
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
          const x1 = db.insertInstance(schema.items.X.fullName);
          const x2 = db.insertInstance(schema.items.X.fullName);
          const y1 = db.insertInstance(schema.items.Y.fullName);
          const y2 = db.insertInstance(schema.items.Y.fullName);
          return { schema, x1, x2, y1, y2 };
        },
        async (db, { schema, y1, y2 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(db));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
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
              if (HierarchyNode.isInstancesNode(parentNode) && parentNode.key.instanceKeys.some((k) => k.className === schema.items.X.fullName)) {
                return [
                  {
                    fullClassName: schema.items.Y.fullName,
                    query: {
                      ecsql: `
                        SELECT ${await selectQueryFactory.createSelectClause({
                          ecClassId: { selector: `this.ECClassId` },
                          ecInstanceId: { selector: `this.ECInstanceId` },
                          nodeLabel: "y",
                          grouping: {
                            byClass: true,
                          },
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
            provider: createProvider({ imodel: db, hierarchy }),
            expect: [
              NodeValidators.createForClassGroupingNode({
                label: "Y",
                className: schema.items.Y.fullName,
                children: [
                  NodeValidators.createForInstanceNode({ instanceKeys: [y1], children: false }),
                  NodeValidators.createForInstanceNode({ instanceKeys: [y2], children: false }),
                ],
              }),
            ],
          });
        },
      );
    });
  });
});

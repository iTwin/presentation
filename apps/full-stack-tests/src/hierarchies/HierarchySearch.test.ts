/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it, test } from "vitest";
import {
  createHierarchyProvider,
  createHierarchySearchHelper,
  createPredicateBasedHierarchyDefinition,
  HierarchyNode,
  HierarchyNodeIdentifier,
  HierarchyNodeKey,
  mergeProviders,
} from "@itwin/presentation-hierarchies";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { NodeValidators, validateHierarchy } from "./HierarchyValidation.js";
import { createIModelAccess, createProvider } from "./Utils.js";

import type {
  DefineHierarchyLevelProps,
  DefineInstanceNodeChildHierarchyLevelProps,
  GenericNodeKey,
  HierarchyDefinition,
  HierarchyProvider,
  HierarchySearchTree,
  IModelInstanceKey,
} from "@itwin/presentation-hierarchies";
import type { Props } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  describe("Hierarchy search", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    describe("generic nodes", () => {
      it("searches through generic nodes", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECNavigationProperty propertyName="Parent" relationshipName="XX" direction="backward" />
              </ECEntityClass>
              <ECRelationshipClass typeName="XX" strength="referencing" strengthDirection="forward" modifier="None">
                <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                  <Class class="X" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                  <Class class="X" />
                </Target>
              </ECRelationshipClass>
            `,
          );
          const rootX = builder.insertInstance(s.items.X.fullName, { label: "root x" });
          const childX1 = builder.insertInstance(s.items.X.fullName, { label: "x 1", "Parent.Id": rootX.id });
          const childX2 = builder.insertInstance(s.items.X.fullName, { label: "x 2", "Parent.Id": rootX.id });
          return { schema: s, rootX, childX1, childX2 };
        });
        const { ecdb, schema, ...keys } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root x",
                      })}
                      FROM ${schema.items.X.fullName} AS this
                      WHERE this.ECInstanceId = ${keys.rootX.id}
                    `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root x") {
              return [
                {
                  node: {
                    key: "custom",
                    label: "custom",
                    children: undefined,
                    extendedData: { parentIds: parentNode.key.instanceKeys.map((key) => key.id) },
                  },
                },
              ];
            }
            if (HierarchyNode.isGeneric(parentNode)) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Label` },
                      })}
                      FROM ${schema.items.X.fullName} AS this
                      WHERE this.Parent.Id IN (${parentNode.extendedData!.parentIds.join(",")})
                    `,
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              {
                identifier: keys.rootX,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { type: "generic", id: "custom" },
                    options: { autoExpand: true },
                    children: [{ identifier: keys.childX2 }],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootX],
              autoExpand: true,
              isSearchTarget: false,
              children: [
                NodeValidators.createForGenericNode({
                  key: "custom",
                  autoExpand: true,
                  isSearchTarget: false,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childX2],
                      isSearchTarget: true,
                      children: false,
                      autoExpand: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("searches generic nodes", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X" />
            `,
          );
          const rootX = builder.insertInstance(s.items.X.fullName);
          return { schema: s, rootX };
        });
        const { ecdb, schema, ...keys } = setup;

        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root x",
                      })}
                      FROM ${schema.items.X.fullName} AS this
                      WHERE this.ECInstanceId = ${keys.rootX.id}
                    `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root x") {
              return [
                { node: { key: "custom1", label: "custom1", children: undefined } },
                { node: { key: "custom2", label: "custom2", children: undefined } },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              {
                identifier: keys.rootX,
                options: { autoExpand: true },
                children: [{ identifier: { type: "generic", id: "custom2" } }],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootX],
              autoExpand: true,
              isSearchTarget: false,
              children: [
                NodeValidators.createForGenericNode({ key: "custom2", autoExpand: false, isSearchTarget: true }),
              ],
            }),
          ],
        });
      });

      it("searches generic nodes when targeting child and ancestor", async () => {
        using setup = await buildTestECDb();
        const { ecdb } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: { key: "custom1", label: "custom1" } }, { node: { key: "custom2", label: "custom2" } }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.label === "custom2") {
              return [
                { node: { key: "custom21", label: "custom21" } },
                { node: { key: "custom22", label: "custom22" } },
              ];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.label === "custom22") {
              return [
                { node: { key: "custom221", label: "custom221" } },
                { node: { key: "custom222", label: "custom222" } },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              {
                identifier: { type: "generic", id: "custom2" },
                isTarget: true,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { type: "generic", id: "custom22" },
                    options: { autoExpand: true },
                    children: [{ identifier: { type: "generic", id: "custom222" } }],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForGenericNode({
              key: "custom2",
              autoExpand: true,
              isSearchTarget: true,
              children: [
                NodeValidators.createForGenericNode({
                  key: "custom21",
                  autoExpand: false,
                  isSearchTarget: false,
                  children: false,
                }),
                NodeValidators.createForGenericNode({
                  key: "custom22",
                  autoExpand: true,
                  isSearchTarget: false,
                  children: [
                    NodeValidators.createForGenericNode({ key: "custom221", autoExpand: false, isSearchTarget: false }),
                    NodeValidators.createForGenericNode({ key: "custom222", autoExpand: false, isSearchTarget: true }),
                  ],
                }),
              ],
            }),
          ],
        });
      });
    });

    describe("instance nodes", () => {
      it("sets auto-expand flag up to specific grouping level", async function () {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "x 1" });
          const x21 = builder.insertInstance(s.items.X.fullName, { label: "x 2.1" });
          const x22 = builder.insertInstance(s.items.X.fullName, { label: "x 2.2" });
          const x3 = builder.insertInstance(s.items.X.fullName, { label: "x 3" });
          return { schema: s, x1, x21, x22, x3 };
        });
        const { ecdb, schema, ...keys } = setup;
        const createHierarchyLevelDefinition = async (
          createSelectClause: DefineHierarchyLevelProps["createSelectClause"],
          whereClause: (alias: string) => string,
        ) => {
          return [
            {
              fullClassName: schema.items.X.fullName,
              query: {
                ecsql: `
                  SELECT ${await createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.Label` },
                    grouping: { byClass: true, byLabel: true },
                  })}
                  FROM ${schema.items.X.fullName} AS this
                  ${whereClause("this")}
                `,
              },
            },
          ];
        };

        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId = ${keys.x1.id}`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "x 1") {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId IN (${keys.x21.id}, ${keys.x22.id})`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "x 2.1") {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId = ${keys.x3.id}`,
              );
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              {
                identifier: keys.x1,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: keys.x21,
                    options: { autoExpand: true },
                    children: [{ identifier: keys.x3, options: { autoExpand: { groupingLevel: 1 } } }],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              autoExpand: true,
              className: keys.x1.className,
              children: [
                NodeValidators.createForLabelGroupingNode({
                  autoExpand: true,
                  label: "x 1",
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.x1],
                      autoExpand: true,
                      children: [
                        NodeValidators.createForClassGroupingNode({
                          autoExpand: true,
                          className: keys.x21.className,
                          children: [
                            NodeValidators.createForLabelGroupingNode({
                              autoExpand: true,
                              label: "x 2.1",
                              children: [
                                NodeValidators.createForInstanceNode({
                                  instanceKeys: [keys.x21],
                                  autoExpand: true,
                                  children: [
                                    NodeValidators.createForClassGroupingNode({
                                      autoExpand: true,
                                      className: keys.x21.className,
                                      children: [
                                        NodeValidators.createForLabelGroupingNode({
                                          autoExpand: false,
                                          label: "x 3",
                                          children: [
                                            NodeValidators.createForInstanceNode({
                                              instanceKeys: [keys.x3],
                                              isSearchTarget: true,
                                              children: false,
                                              autoExpand: false,
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("searches through instance nodes that are in multiple paths", async function () {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "x 1" });
          const x2 = builder.insertInstance(s.items.X.fullName, { label: "x 2" });
          const x3 = builder.insertInstance(s.items.X.fullName, { label: "x 3" });
          const x4 = builder.insertInstance(s.items.X.fullName, { label: "x 4" });
          return { schema: s, x1, x2, x3, x4 };
        });
        const { ecdb, schema, ...keys } = setup;
        const createHierarchyLevelDefinition = async (
          createSelectClause: DefineHierarchyLevelProps["createSelectClause"],
          whereClause: (alias: string) => string,
        ) => {
          return [
            {
              fullClassName: schema.items.X.fullName,
              query: {
                ecsql: `
                  SELECT ${await createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.Label` },
                  })}
                  FROM ${schema.items.X.fullName} AS this
                  ${whereClause("this")}
                `,
              },
            },
          ];
        };

        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId IN (${keys.x1.id}, ${keys.x4.id})`,
              );
            }
            if (
              HierarchyNode.isInstancesNode(parentNode) &&
              parentNode.label === "x 1" &&
              parentNode.parentKeys.length === 0
            ) {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId IN (${keys.x2.id}, ${keys.x3.id})`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "x 4") {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId = ${keys.x1.id}`,
              );
            }
            if (
              HierarchyNode.isInstancesNode(parentNode) &&
              parentNode.label === "x 1" &&
              parentNode.parentKeys.length === 1
            ) {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId = ${keys.x2.id}`,
              );
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              { identifier: keys.x1, options: { autoExpand: true }, children: [{ identifier: keys.x3 }] },
              {
                identifier: keys.x4,
                options: { autoExpand: true },
                children: [{ identifier: keys.x1, options: { autoExpand: true }, children: [{ identifier: keys.x2 }] }],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.x1],
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.x3],
                  isSearchTarget: true,
                  children: false,
                  autoExpand: false,
                }),
              ],
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.x4],
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.x1],
                  autoExpand: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.x2],
                      isSearchTarget: true,
                      children: false,
                      autoExpand: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("searches instance nodes when targeting child and ancestor", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "x 1" });
          const x2 = builder.insertInstance(s.items.X.fullName, { label: "x 2" });
          const x21 = builder.insertInstance(s.items.X.fullName, { label: "x 21" });
          const x22 = builder.insertInstance(s.items.X.fullName, { label: "x 22" });
          const x221 = builder.insertInstance(s.items.X.fullName, { label: "x 221" });
          const x222 = builder.insertInstance(s.items.X.fullName, { label: "x 222" });
          return { schema: s, x1, x2, x21, x22, x221, x222 };
        });
        const { ecdb, schema, ...keys } = setup;
        const createHierarchyLevelDefinition = async (
          createSelectClause: DefineHierarchyLevelProps["createSelectClause"],
          whereClause: (alias: string) => string,
        ) => [
          {
            fullClassName: schema.items.X.fullName,
            query: {
              ecsql: `
                SELECT ${await createSelectClause({
                  ecClassId: { selector: `this.ECClassId` },
                  ecInstanceId: { selector: `this.ECInstanceId` },
                  nodeLabel: { selector: `this.Label` },
                })}
                FROM ${schema.items.X.fullName} AS this
                ${whereClause("this")}
              `,
            },
          },
        ];
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId IN (${keys.x1.id}, ${keys.x2.id})`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "x 2") {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId IN (${keys.x21.id}, ${keys.x22.id})`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "x 22") {
              return createHierarchyLevelDefinition(
                createSelectClause,
                (alias: string) => `WHERE ${alias}.ECInstanceId IN (${keys.x221.id}, ${keys.x222.id})`,
              );
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              {
                identifier: keys.x2,
                isTarget: true,
                options: { autoExpand: true },
                children: [
                  { identifier: keys.x22, options: { autoExpand: true }, children: [{ identifier: keys.x222 }] },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.x2],
              isSearchTarget: true,
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.x21],
                  isSearchTarget: false,
                  children: false,
                  autoExpand: false,
                }),
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.x22],
                  autoExpand: true,
                  isSearchTarget: false,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.x221],
                      isSearchTarget: false,
                      children: false,
                      autoExpand: false,
                    }),
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.x222],
                      isSearchTarget: true,
                      children: false,
                      autoExpand: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });
    });

    describe("when searching through hidden nodes", () => {
      it("searches through hidden generic nodes", async function () {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECNavigationProperty propertyName="Parent" relationshipName="XX" direction="backward" />
              </ECEntityClass>
              <ECRelationshipClass typeName="XX" strength="referencing" strengthDirection="forward" modifier="None">
                <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                  <Class class="X" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                  <Class class="X" />
                </Target>
              </ECRelationshipClass>
            `,
          );
          const rootX = builder.insertInstance(s.items.X.fullName, { label: "root x" });
          const childX2 = builder.insertInstance(s.items.X.fullName, { label: "x 2", "Parent.Id": rootX.id });
          return { schema: s, rootX, childX2 };
        });
        const { ecdb, schema, ...keys } = setup;

        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root x",
                      })}
                      FROM ${schema.items.X.fullName} AS this
                      WHERE this.ECInstanceId = ${keys.rootX.id}
                    `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root x") {
              return [
                {
                  node: {
                    key: "custom",
                    label: "custom",
                    children: undefined,
                    processingParams: { hideInHierarchy: true },
                    extendedData: { parentIds: parentNode.key.instanceKeys.map((key) => key.id) },
                  },
                },
              ];
            }
            if (HierarchyNode.isGeneric(parentNode)) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Label` },
                      })}
                      FROM ${schema.items.X.fullName} AS this
                      WHERE this.Parent.Id IN (${parentNode.extendedData!.parentIds.join(",")})
                    `,
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              {
                identifier: keys.rootX,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { type: "generic", id: "custom" },
                    options: { autoExpand: true },
                    children: [{ identifier: keys.childX2 }],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootX],
              autoExpand: true,
              isSearchTarget: false,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childX2],
                  isSearchTarget: true,
                  children: false,
                  autoExpand: false,
                }),
              ],
            }),
          ],
        });
      });
    });

    describe("when targeting hidden nodes", () => {
      it("doesn't return matching hidden generic nodes or their children", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="Y">
                <ECProperty propertyName="Label" typeName="string" />
                <ECNavigationProperty propertyName="Parent" relationshipName="XY" direction="backward" />
              </ECEntityClass>
              <ECRelationshipClass typeName="XY" strength="referencing" strengthDirection="forward" modifier="None">
                <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                  <Class class="X" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                  <Class class="Y" />
                </Target>
              </ECRelationshipClass>
            `,
          );
          const x = builder.insertInstance(s.items.X.fullName, { label: "root x" });
          const y1 = builder.insertInstance(s.items.Y.fullName, { label: "y 1", "Parent.Id": x.id });
          const y2 = builder.insertInstance(s.items.Y.fullName, { label: "y 2", "Parent.Id": x.id });
          return { schema: s, x, y1, y2 };
        });
        const { ecdb, schema, ...keys } = setup;

        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root x",
                      })}
                      FROM ${schema.items.X.fullName} AS this
                      WHERE this.ECInstanceId = ${keys.x.id}
                    `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root x") {
              return [
                {
                  node: {
                    key: "custom",
                    label: "custom",
                    children: undefined,
                    processingParams: { hideInHierarchy: true },
                    extendedData: { parentIds: parentNode.key.instanceKeys.map((key) => key.id) },
                  },
                },
              ];
            }
            if (HierarchyNode.isGeneric(parentNode)) {
              return [
                {
                  fullClassName: schema.items.Y.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Label` },
                      })}
                      FROM ${schema.items.Y.fullName} AS this
                      WHERE this.Parent.Id IN (${parentNode.extendedData!.parentIds.join(",")})
                    `,
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [{ identifier: keys.x, children: [{ identifier: { type: "generic", id: "custom" } }] }],
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x], isSearchTarget: false, children: false }),
          ],
        });
      });

      it("doesn't return matching hidden instance nodes", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECNavigationProperty propertyName="Parent" relationshipName="XX" direction="backward" />
              </ECEntityClass>
              <ECRelationshipClass typeName="XX" strength="referencing" strengthDirection="forward" modifier="None">
                <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                  <Class class="X" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                  <Class class="X" />
                </Target>
              </ECRelationshipClass>
            `,
          );
          const rootX = builder.insertInstance(s.items.X.fullName, { label: "root x" });
          const childX1 = builder.insertInstance(s.items.X.fullName, { label: "x 1", "Parent.Id": rootX.id });
          const childX2 = builder.insertInstance(s.items.X.fullName, { label: "x 2", "Parent.Id": childX1.id });
          const childX3 = builder.insertInstance(s.items.X.fullName, { label: "x 3", "Parent.Id": childX1.id });
          return { schema: s, rootX, childX1, childX2, childX3 };
        });
        const { ecdb, schema, ...keys } = setup;

        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "root x",
                    })}
                    FROM ${schema.items.X.fullName} AS this
                    WHERE this.ECInstanceId = ${keys.rootX.id}
                  `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root x") {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Label` },
                        hideNodeInHierarchy: true,
                      })}
                      FROM ${schema.items.X.fullName} AS this
                      WHERE this.Parent.Id IN (${parentNode.key.instanceKeys.map((key) => key.id).join(",")})
                    `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "x 1") {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Label` },
                      })}
                      FROM ${schema.items.X.fullName} AS this
                      WHERE this.Parent.Id IN (${parentNode.key.instanceKeys.map((key) => key.id).join(",")})
                    `,
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [{ identifier: keys.rootX, children: [{ identifier: keys.childX1 }] }],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootX],
              isSearchTarget: false,
              children: false,
            }),
          ],
        });
      });

      it("doesn't return hidden instance node when targeting both the node and its parent, when parent has visible children from other hierarchy level definitions", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X" />
              <ECEntityClass typeName="Y" />
              <ECEntityClass typeName="Z" />
            `,
          );
          const x = builder.insertInstance(s.items.X.fullName);
          const y = builder.insertInstance(s.items.Y.fullName);
          const z = builder.insertInstance(s.items.Z.fullName);
          return { schema: s, x, y, z };
        });
        const { ecdb, schema, ...keys } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                          SELECT ${await createSelectClause({
                            ecClassId: { selector: `this.ECClassId` },
                            ecInstanceId: { selector: `this.ECInstanceId` },
                            nodeLabel: "x",
                          })}
                          FROM ${schema.items.X.fullName} AS this
                        `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "x") {
              return [
                {
                  fullClassName: schema.items.Y.fullName,
                  query: {
                    ecsql: `
                          SELECT ${await createSelectClause({
                            ecClassId: { selector: `this.ECClassId` },
                            ecInstanceId: { selector: `this.ECInstanceId` },
                            nodeLabel: "y",
                            hideNodeInHierarchy: true,
                          })}
                          FROM ${schema.items.Y.fullName} AS this
                        `,
                  },
                },
                {
                  fullClassName: schema.items.Z.fullName,
                  query: {
                    ecsql: `
                          SELECT ${await createSelectClause({
                            ecClassId: { selector: `this.ECClassId` },
                            ecInstanceId: { selector: `this.ECInstanceId` },
                            nodeLabel: "z",
                          })}
                          FROM ${schema.items.Z.fullName} AS this
                        `,
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              { identifier: keys.x, isTarget: true, options: { autoExpand: true }, children: [{ identifier: keys.y }] },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.x],
              autoExpand: true,
              isSearchTarget: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.z],
                  autoExpand: false,
                  isSearchTarget: false,
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("doesn't return hidden instance node when targeting both the node and its parent, when parent has visible children from the same hierarchy level definition", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X" />
              <ECEntityClass typeName="Y">
                <ECProperty propertyName="IsHidden" typeName="boolean" />
              </ECEntityClass>
            `,
          );
          const x = builder.insertInstance(s.items.X.fullName);
          const y1 = builder.insertInstance(s.items.Y.fullName, { isHidden: true });
          const y2 = builder.insertInstance(s.items.Y.fullName, { isHidden: false });
          return { schema: s, x, y1, y2 };
        });
        const { ecdb, schema, ...keys } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                          SELECT ${await createSelectClause({
                            ecClassId: { selector: `this.ECClassId` },
                            ecInstanceId: { selector: `this.ECInstanceId` },
                            nodeLabel: "x",
                          })}
                          FROM ${schema.items.X.fullName} AS this
                        `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "x") {
              return [
                {
                  fullClassName: schema.items.Y.fullName,
                  query: {
                    ecsql: `
                          SELECT ${await createSelectClause({
                            ecClassId: { selector: `this.ECClassId` },
                            ecInstanceId: { selector: `this.ECInstanceId` },
                            nodeLabel: "y",
                            hideNodeInHierarchy: { selector: `this.IsHidden` },
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
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              {
                identifier: keys.x,
                isTarget: true,
                options: { autoExpand: true },
                children: [{ identifier: keys.y1 }],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.x],
              autoExpand: true,
              isSearchTarget: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.y2],
                  autoExpand: false,
                  isSearchTarget: false,
                  children: false,
                }),
              ],
            }),
          ],
        });
      });
    });

    describe("when targeting grouped instance nodes", () => {
      it("sets auto-expand flag for parent nodes before the target grouping node", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X" />
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName);
          const x2 = builder.insertInstance(s.items.X.fullName);
          return { schema: s, instances: [x1, x2] };
        });
        const { ecdb, schema, instances } = setup;

        const rootNodeKey: GenericNodeKey = { type: "generic", id: "root-node" };
        const hierarchy: HierarchyDefinition = {
          defineHierarchyLevel: async ({ createSelectClause, ...props }) => {
            if (!props.parentNode) {
              return [{ node: { key: rootNodeKey.id, label: "Root" } }];
            }

            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      ecClassId: { selector: "this.ECClassId" },
                      nodeLabel: { selector: "idToHex(this.ECInstanceId)" },
                      grouping: { byClass: true },
                    })}
                    FROM ${schema.items.X.fullName} this
                  `,
                },
              },
            ];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              {
                identifier: rootNodeKey,
                options: { autoExpand: true },
                children: instances.map((key) => ({ identifier: key })),
              },
            ],
          }),
          expect: [
            NodeValidators.createForGenericNode({
              key: rootNodeKey,
              autoExpand: true,
              children: [
                NodeValidators.createForClassGroupingNode({
                  className: instances[0].className,
                  autoExpand: false,
                  children: instances.map((key) => NodeValidators.createForInstanceNode({ instanceKeys: [key] })),
                }),
              ],
            }),
          ],
        });
      });

      it("sets auto-expand flag for all deeply-nested grouping nodes before the target grouping node", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECNavigationProperty propertyName="Parent" relationshipName="XX" direction="backward" />
              </ECEntityClass>
              <ECRelationshipClass typeName="XX" strength="referencing" strengthDirection="forward" modifier="None">
                <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                  <Class class="X" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                  <Class class="X" />
                </Target>
              </ECRelationshipClass>
            `,
          );
          const rootX = builder.insertInstance(s.items.X.fullName);
          const middleX = builder.insertInstance(s.items.X.fullName, { "Parent.Id": rootX.id });
          const childX = builder.insertInstance(s.items.X.fullName, { "Parent.Id": middleX.id });
          return { schema: s, rootX, middleX, childX };
        });
        const { ecdb, schema, ...keys } = setup;

        const rootNodeKey: GenericNodeKey = { type: "generic", id: "root-node" };
        const hierarchy: HierarchyDefinition = {
          defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
            if (!parentNode) {
              return [{ node: { key: rootNodeKey.id, label: "Root" } }];
            }
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      ecClassId: { selector: "this.ECClassId" },
                      nodeLabel: { selector: "idToHex(this.ECInstanceId)" },
                      grouping: { byClass: true },
                    })}
                    FROM ${schema.items.X.fullName} this
                    WHERE this.Parent.Id ${HierarchyNodeKey.isGeneric(parentNode.key) ? "IS NULL" : `= ${parentNode.key.instanceKeys[0].id}`}
                  `,
                },
              },
            ];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            search: [
              {
                identifier: rootNodeKey,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: keys.rootX,
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: keys.middleX,
                        options: { autoExpand: true },
                        children: [{ identifier: keys.childX }],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForGenericNode({
              key: rootNodeKey,
              autoExpand: true,
              children: [
                NodeValidators.createForClassGroupingNode({
                  autoExpand: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.rootX],
                      autoExpand: true,
                      children: [
                        NodeValidators.createForClassGroupingNode({
                          autoExpand: true,
                          children: [
                            NodeValidators.createForInstanceNode({
                              instanceKeys: [keys.middleX],
                              autoExpand: true,
                              children: [
                                NodeValidators.createForClassGroupingNode({
                                  autoExpand: false,
                                  children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.childX] })],
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      describe("nested grouping nodes of different types", async function () {
        const rootNodeKey: GenericNodeKey = { type: "generic", id: "root-node" };
        let hierarchy: HierarchyDefinition;
        let suiteSetup!: Awaited<ReturnType<typeof setupSuite>>;

        async function setupSuite(fullTestName: string) {
          return buildTestECDb(fullTestName, async (builder, testName) => {
            const s = await importSchema(
              testName,
              builder,
              `
                <ECEntityClass typeName="Circle">
                  <ECProperty propertyName="Color" typeName="string" />
                </ECEntityClass>
              `,
            );
            const circle = builder.insertInstance(s.items.Circle.fullName, { color: "Red" });
            return { schema: s, circle };
          });
        }

        test.beforeAll(async (_, suite) => {
          suiteSetup = await setupSuite(suite.fullTestName!);

          hierarchy = {
            defineHierarchyLevel: async ({ createSelectClause, ...props }) => {
              if (!props.parentNode) {
                return [{ node: { key: rootNodeKey.id, label: "Root" } }];
              }

              return [
                {
                  fullClassName: suiteSetup.schema.items.Circle.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        ecClassId: { selector: "this.ECClassId" },
                        nodeLabel: "Circle",
                        grouping: {
                          byClass: true,
                          byProperties: {
                            propertiesClassName: suiteSetup.schema.items.Circle.fullName,
                            propertyGroups: [{ propertyName: "Color", propertyClassAlias: "this" }],
                          },
                          byLabel: true,
                        },
                      })}
                      FROM ${suiteSetup.schema.items.Circle.fullName} this
                    `,
                  },
                },
              ];
            },
          };
        });

        test.afterAll(() => {
          suiteSetup[Symbol.dispose]();
        });

        it("sets auto-expand flag until the first grouping node", async () => {
          await validateHierarchy({
            provider: createProvider({
              ecdb: suiteSetup.ecdb,
              hierarchy,
              search: [
                {
                  identifier: rootNodeKey,
                  options: { autoExpand: true },
                  children: [{ identifier: suiteSetup.circle }],
                },
              ],
            }),
            expect: [
              NodeValidators.createForGenericNode({
                key: rootNodeKey,
                autoExpand: true,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: suiteSetup.schema.items.Circle.fullName,
                    autoExpand: false,
                    children: [
                      NodeValidators.createForPropertyValueGroupingNode({
                        label: "Red",
                        autoExpand: false,
                        children: [
                          NodeValidators.createForLabelGroupingNode({
                            label: "Circle",
                            autoExpand: false,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [suiteSetup.circle],
                                isSearchTarget: true,
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        });

        it("sets auto-expand flag until the second grouping node", async () => {
          await validateHierarchy({
            provider: createProvider({
              ecdb: suiteSetup.ecdb,
              hierarchy,
              search: [
                {
                  identifier: rootNodeKey,
                  options: { autoExpand: true },
                  children: [{ identifier: suiteSetup.circle, options: { autoExpand: { groupingLevel: 1 } } }],
                },
              ],
            }),
            expect: [
              NodeValidators.createForGenericNode({
                key: rootNodeKey,
                autoExpand: true,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: suiteSetup.schema.items.Circle.fullName,
                    autoExpand: true,
                    children: [
                      NodeValidators.createForPropertyValueGroupingNode({
                        label: "Red",
                        autoExpand: false,
                        children: [
                          NodeValidators.createForLabelGroupingNode({
                            label: "Circle",
                            autoExpand: false,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [suiteSetup.circle],
                                isSearchTarget: true,
                                searchOptions: { autoExpand: { groupingLevel: 1 } },
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        });

        it("sets auto-expand flag until the third grouping node", async () => {
          await validateHierarchy({
            provider: createProvider({
              ecdb: suiteSetup.ecdb,
              hierarchy,
              search: [
                {
                  identifier: rootNodeKey,
                  options: { autoExpand: true },
                  children: [{ identifier: suiteSetup.circle, options: { autoExpand: { groupingLevel: 2 } } }],
                },
              ],
            }),
            expect: [
              NodeValidators.createForGenericNode({
                key: rootNodeKey,
                autoExpand: true,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: suiteSetup.schema.items.Circle.fullName,
                    autoExpand: true,
                    children: [
                      NodeValidators.createForPropertyValueGroupingNode({
                        label: "Red",
                        autoExpand: true,
                        children: [
                          NodeValidators.createForLabelGroupingNode({
                            label: "Circle",
                            autoExpand: false,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [suiteSetup.circle],
                                isSearchTarget: true,
                                searchOptions: { autoExpand: { groupingLevel: 2 } },
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        });

        it("sets auto-expand flag until the instance node", async () => {
          await validateHierarchy({
            provider: createProvider({
              ecdb: suiteSetup.ecdb,
              hierarchy,
              search: [
                {
                  identifier: rootNodeKey,
                  options: { autoExpand: true },
                  children: [{ identifier: suiteSetup.circle, options: { autoExpand: true } }],
                },
              ],
            }),
            expect: [
              NodeValidators.createForGenericNode({
                key: rootNodeKey,
                autoExpand: true,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: suiteSetup.schema.items.Circle.fullName,
                    autoExpand: true,
                    children: [
                      NodeValidators.createForPropertyValueGroupingNode({
                        label: "Red",
                        autoExpand: true,
                        children: [
                          NodeValidators.createForLabelGroupingNode({
                            label: "Circle",
                            autoExpand: true,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [suiteSetup.circle],
                                isSearchTarget: true,
                                searchOptions: { autoExpand: true },
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        });
      });
    });

    describe("when searching merged hierarchy provider", () => {
      const SCHEMA_XML = `
        <ECEntityClass typeName="X">
          <ECProperty propertyName="Label" typeName="string" />
          <ECNavigationProperty propertyName="Parent" relationshipName="XX" direction="backward" />
        </ECEntityClass>
        <ECRelationshipClass typeName="XX" strength="referencing" strengthDirection="forward" modifier="None">
          <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
            <Class class="X" />
          </Source>
          <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
            <Class class="X" />
          </Target>
        </ECRelationshipClass>
      `;

      function createIModelAccessWithKey(ecdb: Parameters<typeof createIModelAccess>[0], imodelKey: string) {
        const access = createIModelAccess(ecdb);
        return { ...access, imodelKey };
      }

      it("searches root nodes of individual provider", async function () {
        using setup1 = await buildTestECDb(`${expect.getState().currentTestName!} 1`, async (builder, testName) => {
          const s = await importSchema(testName, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "A - x from ecdb 1" });
          return { schema: s, x1 };
        });
        using setup2 = await buildTestECDb(`${expect.getState().currentTestName!} 2`, async (builder, testName) => {
          const s = await importSchema(testName, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "B - x from ecdb 2" });
          return { schema: s, x1 };
        });

        const imodelAccess1 = createIModelAccessWithKey(setup1.ecdb, "ecdb-1");
        const instanceKey1: IModelInstanceKey = { ...setup1.x1, imodelKey: imodelAccess1.imodelKey };

        const imodelAccess2 = createIModelAccessWithKey(setup2.ecdb, "ecdb-2");
        const instanceKey2: IModelInstanceKey = { ...setup2.x1, imodelKey: imodelAccess2.imodelKey };

        const provider1 = createProvider({
          imodelAccess: imodelAccess1,
          hierarchy: {
            async defineHierarchyLevel({ parentNode, createSelectClause }) {
              if (!parentNode) {
                return [
                  {
                    fullClassName: instanceKey1.className,
                    query: {
                      ecsql: `
                        SELECT ${await createSelectClause({
                          ecClassId: { selector: `this.ECClassId` },
                          ecInstanceId: { selector: `this.ECInstanceId` },
                          nodeLabel: { selector: `this.Label` },
                        })}
                        FROM ${instanceKey1.className} AS this
                      `,
                    },
                  },
                ];
              }
              return [];
            },
          },
        });
        const provider2 = createProvider({
          imodelAccess: imodelAccess2,
          hierarchy: {
            async defineHierarchyLevel({ parentNode, createSelectClause }) {
              if (!parentNode) {
                return [
                  {
                    fullClassName: instanceKey2.className,
                    query: {
                      ecsql: `
                        SELECT ${await createSelectClause({
                          ecClassId: { selector: `this.ECClassId` },
                          ecInstanceId: { selector: `this.ECInstanceId` },
                          nodeLabel: { selector: `this.Label` },
                        })}
                        FROM ${instanceKey2.className} AS this
                      `,
                    },
                  },
                ];
              }
              return [];
            },
          },
        });
        const provider3 = createProvider({
          sourceName: "provider3",
          imodelAccess: imodelAccess2,
          hierarchy: {
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [{ node: { key: "gen", label: "Generic node 3" } }];
              }
              return [];
            },
          },
        });
        const provider4 = createHierarchyProvider(
          ({ hierarchyChanged }) =>
            new (class implements Pick<HierarchyProvider, "getNodes"> {
              private _search: HierarchySearchTree[] | undefined;
              public getNodes: HierarchyProvider["getNodes"] = ({ parentNode }) => {
                if (!parentNode) {
                  const myNode = {
                    key: { type: "generic", id: "gen", source: "custom-provider" } satisfies GenericNodeKey,
                    label: "Generic node 4",
                    parentKeys: [],
                    children: false,
                  };
                  if (!this._search) {
                    return createAsyncIterator([myNode]);
                  }
                  const nodeMatchesSearch = this._search.find(({ identifier }) => {
                    return (
                      HierarchyNodeIdentifier.isGenericNodeIdentifier(identifier) &&
                      identifier.source === "custom-provider" &&
                      identifier.id === myNode.key.id
                    );
                  });
                  if (nodeMatchesSearch) {
                    return createAsyncIterator([
                      {
                        ...myNode,
                        search: { isSearchTarget: nodeMatchesSearch.isTarget || !nodeMatchesSearch.children },
                      },
                    ]);
                  }
                }
                return createAsyncIterator([]);
              };
              public setHierarchySearch: HierarchyProvider["setHierarchySearch"] = (props) => {
                this._search = props?.paths;
                hierarchyChanged.raiseEvent({ searchChange: { newSearch: props } });
              };
            })(),
        );

        // ensure we have expected default hierarchy
        await validateHierarchy({
          provider: mergeProviders({ providers: [provider1, provider2, provider3, provider4] }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [instanceKey1] }),
            NodeValidators.createForInstanceNode({ instanceKeys: [instanceKey2] }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "provider3" } }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } }),
          ],
        });

        // ensure we get the same result when search paths contain all root nodes
        await validateHierarchy({
          provider: mergeAndSearchProviders({
            providers: [provider1, provider2, provider3, provider4],
            searchProps: {
              paths: [
                { identifier: instanceKey1 },
                { identifier: instanceKey2 },
                { identifier: { type: "generic", id: "gen", source: "provider3" } },
                { identifier: { type: "generic", id: "gen", source: "custom-provider" } },
              ],
            },
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [instanceKey1] }),
            NodeValidators.createForInstanceNode({ instanceKeys: [instanceKey2] }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "provider3" } }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } }),
          ],
        });

        // ensure we can search each root node individually
        await validateHierarchy({
          provider: mergeAndSearchProviders({
            providers: [provider1, provider2, provider3, provider4],
            searchProps: { paths: [{ identifier: instanceKey1 }] },
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [instanceKey1] })],
        });
        await validateHierarchy({
          provider: mergeAndSearchProviders({
            providers: [provider1, provider2, provider3, provider4],
            searchProps: { paths: [{ identifier: instanceKey2 }] },
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [instanceKey2] })],
        });
        await validateHierarchy({
          provider: mergeAndSearchProviders({
            providers: [provider1, provider2, provider3, provider4],
            searchProps: { paths: [{ identifier: { type: "generic", id: "gen", source: "provider3" } }] },
          }),
          expect: [NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "provider3" } })],
        });
        await validateHierarchy({
          provider: mergeAndSearchProviders({
            providers: [provider1, provider2, provider3, provider4],
            searchProps: { paths: [{ identifier: { type: "generic", id: "gen", source: "custom-provider" } }] },
          }),
          expect: [
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } }),
          ],
        });
      });

      it("searches through multiple providers", async function () {
        const schemaProps = { schemaName: "TestSchema", schemaAlias: "TestSchema", schemaVersion: "1.0.0" as const };
        const classNameX = `${schemaProps.schemaName}.X` as const;
        using setup1 = await buildTestECDb(`${expect.getState().currentTestName!} 1`, async (builder) => {
          const s = await importSchema(schemaProps, builder, SCHEMA_XML);
          const rootX = builder.insertInstance(s.items.X.fullName, { label: "root x" });
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "A x 1", "Parent.Id": rootX.id });
          const x2 = builder.insertInstance(s.items.X.fullName, { label: "A x 2", "Parent.Id": x1.id });
          return { schema: s, rootX, x1, x2 };
        });
        using setup2 = await buildTestECDb(`${expect.getState().currentTestName!} 2`, async (builder) => {
          const s = await importSchema(schemaProps, builder, SCHEMA_XML);
          const rootX = builder.insertInstance(s.items.X.fullName, { label: "root x" });
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "B x 1", "Parent.Id": rootX.id });
          const x2 = builder.insertInstance(s.items.X.fullName, { label: "B x 2", "Parent.Id": x1.id });
          return { schema: s, rootX, x1, x2 };
        });

        const imodelAccess1 = createIModelAccessWithKey(setup1.ecdb, "ecdb-1");
        const keys1 = {
          x0: { ...setup1.rootX, imodelKey: imodelAccess1.imodelKey } as IModelInstanceKey,
          x1: { ...setup1.x1, imodelKey: imodelAccess1.imodelKey } as IModelInstanceKey,
          x2: { ...setup1.x2, imodelKey: imodelAccess1.imodelKey } as IModelInstanceKey,
        };

        const imodelAccess2 = createIModelAccessWithKey(setup2.ecdb, "ecdb-2");
        const keys2 = {
          x0: { ...setup2.rootX, imodelKey: imodelAccess2.imodelKey } as IModelInstanceKey,
          x1: { ...setup2.x1, imodelKey: imodelAccess2.imodelKey } as IModelInstanceKey,
          x2: { ...setup2.x2, imodelKey: imodelAccess2.imodelKey } as IModelInstanceKey,
        };

        function createXHierarchyProvider(imodelAccess: ReturnType<typeof createIModelAccess>): HierarchyProvider {
          return createProvider({
            imodelAccess,
            hierarchy: createPredicateBasedHierarchyDefinition({
              classHierarchyInspector: imodelAccess,
              hierarchy: {
                rootNodes: async ({ createSelectClause }) => [
                  {
                    fullClassName: classNameX,
                    query: {
                      ecsql: `
                        SELECT ${await createSelectClause({
                          ecClassId: { selector: `this.ECClassId` },
                          ecInstanceId: { selector: `this.ECInstanceId` },
                          nodeLabel: { selector: `this.Label` },
                          hideNodeInHierarchy: true,
                        })}
                        FROM ${classNameX} AS this
                        WHERE this.Parent IS NULL
                      `,
                    },
                  },
                ],
                childNodes: [
                  {
                    parentInstancesNodePredicate: classNameX,
                    definitions: async ({
                      parentNodeInstanceIds,
                      createSelectClause,
                    }: DefineInstanceNodeChildHierarchyLevelProps) => [
                      {
                        fullClassName: classNameX,
                        query: {
                          ecsql: `
                            SELECT ${await createSelectClause({
                              ecClassId: { selector: `this.ECClassId` },
                              ecInstanceId: { selector: `this.ECInstanceId` },
                              nodeLabel: { selector: `this.Label` },
                            })}
                            FROM ${classNameX} AS this
                            WHERE this.Parent.Id IN (${parentNodeInstanceIds.join(",")})
                          `,
                        },
                      },
                    ],
                  },
                ],
              },
            }),
          });
        }
        const provider1 = createXHierarchyProvider(imodelAccess1);
        const provider2 = createXHierarchyProvider(imodelAccess2);
        // create generic node provider that creates a node for every X node of any source
        const provider3 = createHierarchyProvider(
          () =>
            new (class implements Pick<HierarchyProvider, "getNodes" | "setHierarchySearch"> {
              public getNodes: HierarchyProvider["getNodes"] = ({ parentNode }) => {
                if (
                  parentNode &&
                  HierarchyNode.isInstancesNode(parentNode) &&
                  parentNode.key.instanceKeys.some(({ className }) => className === classNameX)
                ) {
                  const myNode = {
                    key: { type: "generic", id: "gen", source: "custom-provider" } satisfies GenericNodeKey,
                    label: "Generic node",
                    parentKeys: [...parentNode.parentKeys, parentNode.key],
                    children: false,
                  };
                  const searchHelper = createHierarchySearchHelper(undefined, parentNode);
                  if (!searchHelper.hasSearch) {
                    return createAsyncIterator([myNode]);
                  }
                  const nodeMatchesSearch = searchHelper
                    .getChildNodeSearchIdentifiers()
                    ?.some((id) => HierarchyNodeIdentifier.equal(id, myNode.key));
                  if (nodeMatchesSearch) {
                    return createAsyncIterator([
                      { ...myNode, ...searchHelper.createChildNodeProps({ nodeKey: myNode.key }) },
                    ]);
                  }
                }
                return createAsyncIterator([]);
              };
              public setHierarchySearch: HierarchyProvider["setHierarchySearch"] = () => {
                // don't need to save this, because this provider doesn't return any root nodes and for
                // child nodes we take search paths from parent node
              };
            })(),
        );

        // ensure we have expected default hierarchy
        await validateHierarchy({
          provider: mergeProviders({ providers: [provider1, provider2, provider3] }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys1.x1],
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys1.x2],
                  children: [
                    NodeValidators.createForGenericNode({
                      key: { type: "generic", id: "gen", source: "custom-provider" },
                    }),
                  ],
                }),
                NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } }),
              ],
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys2.x1],
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys2.x2],
                  children: [
                    NodeValidators.createForGenericNode({
                      key: { type: "generic", id: "gen", source: "custom-provider" },
                    }),
                  ],
                }),
                NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } }),
              ],
            }),
          ],
        });

        // ensure we can search through different providers
        const rootXKey = { className: classNameX, id: setup1.rootX.id };
        await validateHierarchy({
          provider: mergeAndSearchProviders({
            providers: [provider1, provider2, provider3],
            searchProps: {
              paths: [
                {
                  identifier: rootXKey,
                  children: [
                    {
                      identifier: keys1.x1,
                      children: [
                        {
                          identifier: keys1.x2,
                          children: [{ identifier: { type: "generic", id: "gen", source: "custom-provider" } }],
                        },
                      ],
                    },
                    {
                      identifier: keys2.x1,
                      children: [{ identifier: { type: "generic", id: "gen", source: "custom-provider" } }],
                    },
                  ],
                },
              ],
            },
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys1.x1],
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys1.x2],
                  children: [NodeValidators.createForGenericNode({ key: "gen" })],
                }),
              ],
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys2.x1],
              children: [NodeValidators.createForGenericNode({ key: "gen" })],
            }),
          ],
        });
      });
    });
  });
});

function mergeAndSearchProviders({
  providers,
  searchProps,
}: {
  providers: HierarchyProvider[];
  searchProps: Props<HierarchyProvider["setHierarchySearch"]>;
}) {
  const mergedProvider = mergeProviders({ providers });
  mergedProvider.setHierarchySearch(searchProps);
  return mergedProvider;
}

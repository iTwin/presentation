/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory, insertSubject } from "presentation-test-utilities";
import { Subject } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { createNodesQueryClauseFactory, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";
import { ECSqlBinding, InstanceKey } from "@itwin/presentation-shared";
import { buildIModel, importSchema, withECDb } from "../IModelUtils";
import { initialize, terminate } from "../IntegrationTests";
import { NodeValidators, validateHierarchy } from "./HierarchyValidation";
import { createIModelAccess, createProvider } from "./Utils";

describe("Hierarchies", () => {
  describe("Hierarchy filtering", () => {
    let subjectClassName: string;

    before(async function () {
      await initialize();
      subjectClassName = Subject.classFullName.replace(":", ".");
    });

    after(async () => {
      await terminate();
    });

    describe("custom nodes", () => {
      it("filters through custom nodes", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2 };
        });

        const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root subject",
                      })}
                      FROM ${subjectClassName} AS this
                    `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
              return [
                {
                  node: {
                    key: "custom",
                    label: "custom",
                    children: undefined,
                    extendedData: {
                      parentSubjectIds: parentNode.key.instanceKeys.map((key) => key.id),
                    },
                  },
                },
              ];
            }
            if (HierarchyNode.isCustom(parentNode)) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.CodeValue` },
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.Parent.Id IN (${parentNode.extendedData!.parentSubjectIds.map(() => "?").join(",")})
                    `,
                    bindings: parentNode.extendedData!.parentSubjectIds.map((id: Id64String): ECSqlBinding => ({ type: "id", value: id })),
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            filteredNodePaths: [{ path: [keys.rootSubject, { key: "custom" }, keys.childSubject2], options: { autoExpand: true } }],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              autoExpand: true,
              isFilterTarget: false,
              children: [
                NodeValidators.createForCustomNode({
                  key: "custom",
                  autoExpand: true,
                  isFilterTarget: false,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject2],
                      isFilterTarget: true,
                      children: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("filters custom nodes", async function () {
        const { imodel, ...keys } = await buildIModel(this, async () => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          return { rootSubject };
        });

        const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root subject",
                      })}
                      FROM ${subjectClassName} AS this
                    `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
              return [
                {
                  node: {
                    key: "custom1",
                    label: "custom1",
                    children: undefined,
                  },
                },
                {
                  node: {
                    key: "custom2",
                    label: "custom2",
                    children: undefined,
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy, filteredNodePaths: [{ path: [keys.rootSubject, { key: "custom2" }], options: { autoExpand: true } }] }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              autoExpand: true,
              isFilterTarget: false,
              children: [
                NodeValidators.createForCustomNode({
                  key: "custom2",
                  autoExpand: false,
                  isFilterTarget: true,
                }),
              ],
            }),
          ],
        });
      });
    });

    describe("when filtering through hidden nodes", () => {
      it("filters through hidden custom nodes", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2 };
        });

        const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root subject",
                      })}
                      FROM ${subjectClassName} AS this
                    `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
              return [
                {
                  node: {
                    key: "custom",
                    label: "custom",
                    children: undefined,
                    processingParams: {
                      hideInHierarchy: true,
                    },
                    extendedData: {
                      parentSubjectIds: parentNode.key.instanceKeys.map((key) => key.id),
                    },
                  },
                },
              ];
            }
            if (HierarchyNode.isCustom(parentNode)) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.CodeValue` },
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.Parent.Id IN (${parentNode.extendedData!.parentSubjectIds.map(() => "?").join(",")})
                    `,
                    bindings: parentNode.extendedData!.parentSubjectIds.map((id: Id64String): ECSqlBinding => ({ type: "id", value: id })),
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            filteredNodePaths: [{ path: [keys.rootSubject, { key: "custom" }, keys.childSubject2], options: { autoExpand: true } }],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              autoExpand: true,
              isFilterTarget: false,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childSubject2],
                  isFilterTarget: true,
                  children: false,
                }),
              ],
            }),
          ],
        });
      });
    });

    describe("when targeting hidden nodes", () => {
      it("doesn't return matching hidden custom nodes or their children", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2 };
        });

        const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root subject",
                      })}
                      FROM ${subjectClassName} AS this
                    `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
              return [
                {
                  node: {
                    key: "custom",
                    label: "custom",
                    children: undefined,
                    processingParams: {
                      hideInHierarchy: true,
                    },
                    extendedData: {
                      parentSubjectIds: parentNode.key.instanceKeys.map((key) => key.id),
                    },
                  },
                },
              ];
            }
            if (HierarchyNode.isCustom(parentNode)) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.CodeValue` },
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.Parent.Id IN (${parentNode.extendedData!.parentSubjectIds.map(() => "?").join(",")})
                    `,
                    bindings: parentNode.extendedData!.parentSubjectIds.map((id: Id64String): ECSqlBinding => ({ type: "id", value: id })),
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy, filteredNodePaths: [[keys.rootSubject, { key: "custom" }]] }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              isFilterTarget: false,
              children: false,
            }),
          ],
        });
      });

      it("doesn't return matching hidden instance nodes", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: childSubject1.id });
          const childSubject3 = insertSubject({ builder, codeValue: "test subject 3", parentId: childSubject1.id });
          return { rootSubject, childSubject1, childSubject2, childSubject3 };
        });

        const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "root subject",
                    })}
                    FROM ${subjectClassName} AS this
                  `,
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.CodeValue` },
                        hideNodeInHierarchy: true,
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.Parent.Id IN (${parentNode.key.instanceKeys.map(() => "?").join(",")})
                    `,
                    bindings: parentNode.key.instanceKeys.map((key): ECSqlBinding => ({ type: "id", value: key.id })),
                  },
                },
              ];
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "test subject 1") {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.CodeValue` },
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.Parent.Id IN (${parentNode.key.instanceKeys.map(() => "?").join(",")})
                    `,
                    bindings: parentNode.key.instanceKeys.map((key): ECSqlBinding => ({ type: "id", value: key.id })),
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy, filteredNodePaths: [[keys.rootSubject, keys.childSubject1]] }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              isFilterTarget: false,
              children: false,
            }),
          ],
        });
      });

      it("doesn't return hidden instance node when targeting both the node and its parent, when parent has visible children from other hierarchy level definitions", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
              this,
              db,
              `
                <ECEntityClass typeName="X" />
                <ECEntityClass typeName="Y" />
                <ECEntityClass typeName="Z" />
              `,
            );
            const x = db.insertInstance(schema.items.X.fullName);
            const y = db.insertInstance(schema.items.Y.fullName);
            const z = db.insertInstance(schema.items.Z.fullName);
            return { schema, x, y, z };
          },
          async (imodel, { schema, x, y, z }) => {
            const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
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
                          SELECT ${await selectQueryFactory.createSelectClause({
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
                          SELECT ${await selectQueryFactory.createSelectClause({
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
                imodel,
                hierarchy,
                filteredNodePaths: [
                  { path: [x], options: { autoExpand: true } },
                  { path: [x, y], options: { autoExpand: true } },
                ],
              }),
              expect: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [x],
                  autoExpand: true,
                  isFilterTarget: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [z],
                      autoExpand: false,
                      isFilterTarget: false,
                      children: false,
                    }),
                  ],
                }),
              ],
            });
          },
        );
      });

      it("doesn't return hidden instance node when targeting both the node and its parent, when parent has visible children from the same hierarchy level definition", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
              this,
              db,
              `
                <ECEntityClass typeName="X" />
                <ECEntityClass typeName="Y">
                  <ECProperty propertyName="IsHidden" typeName="boolean" />
                </ECEntityClass>
              `,
            );
            const x = db.insertInstance(schema.items.X.fullName);
            const y1 = db.insertInstance(schema.items.Y.fullName, { isHidden: true });
            const y2 = db.insertInstance(schema.items.Y.fullName, { isHidden: false });
            return { schema, x, y1, y2 };
          },
          async (imodel, { schema, x, y1, y2 }) => {
            const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
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
                          SELECT ${await selectQueryFactory.createSelectClause({
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
                imodel,
                hierarchy,
                filteredNodePaths: [
                  { path: [x], options: { autoExpand: true } },
                  { path: [x, y1], options: { autoExpand: true } },
                ],
              }),
              expect: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [x],
                  autoExpand: true,
                  isFilterTarget: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [y2],
                      autoExpand: false,
                      isFilterTarget: false,
                      children: false,
                    }),
                  ],
                }),
              ],
            });
          },
        );
      });
    });

    describe("when targeting grouped instance nodes", () => {
      it("sets auto-expand flag for parent nodes before the target grouping node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const elements = [
            insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id }),
            insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id }),
          ];
          return { rootSubject, model, category, elements };
        });

        const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
        const rootNodeKey = "root-node";
        const hierarchy: HierarchyDefinition = {
          defineHierarchyLevel: async (props) => {
            if (!props.parentNode) {
              return [{ node: { key: rootNodeKey, label: "Root" } }];
            }

            return [
              {
                fullClassName: "BisCore.PhysicalElement",
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      ecClassId: { selector: "this.ECClassId" },
                      nodeLabel: { selector: "idToHex(this.ECInstanceId)" },
                      grouping: { byClass: true },
                    })}
                    FROM BisCore.PhysicalElement this
                  `,
                },
              },
            ];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            filteredNodePaths: keys.elements.map((elementKey) => ({
              path: [{ key: rootNodeKey }, elementKey],
              options: {
                autoExpand: {
                  key: { type: "class-grouping", className: keys.elements[0].className },
                  depth: 1,
                },
              },
            })),
          }),
          expect: [
            NodeValidators.createForCustomNode({
              key: rootNodeKey,
              autoExpand: true,
              children: [
                NodeValidators.createForClassGroupingNode({
                  className: keys.elements[0].className,
                  autoExpand: false,
                  children: keys.elements.map((key) => NodeValidators.createForInstanceNode({ instanceKeys: [key] })),
                }),
              ],
            }),
          ],
        });
      });

      it("sets auto-expand flag for all deeply-nested grouping nodes before the target grouping node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const rootElement = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id });
          const middleElement = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, parentId: rootElement.id });
          const childElement = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, parentId: middleElement.id });
          return { rootSubject, model, category, rootElement, middleElement, childElement };
        });

        const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
        const rootNodeKey = "root-node";
        const hierarchy: HierarchyDefinition = {
          defineHierarchyLevel: async ({ parentNode }) => {
            if (!parentNode) {
              return [{ node: { key: rootNodeKey, label: "Root" } }];
            }

            return [
              {
                fullClassName: "BisCore.PhysicalElement",
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      ecClassId: { selector: "this.ECClassId" },
                      nodeLabel: { selector: "idToHex(this.ECInstanceId)" },
                      grouping: { byClass: true },
                    })}
                    FROM BisCore.PhysicalElement this
                    WHERE this.Parent.Id ${typeof parentNode.key === "string" ? "IS NULL" : "= ?"}
                  `,
                  bindings: typeof parentNode.key === "string" ? undefined : [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
                },
              },
            ];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            filteredNodePaths: [
              {
                path: [{ key: rootNodeKey }, keys.rootElement, keys.middleElement, keys.childElement],
                options: {
                  autoExpand: {
                    key: { type: "class-grouping", className: keys.childElement.className },
                    depth: 5, // root node + (grouping node and instance node for root and middle elements),
                  },
                },
              },
            ],
          }),
          expect: [
            NodeValidators.createForCustomNode({
              key: rootNodeKey,
              autoExpand: true,
              children: [
                NodeValidators.createForClassGroupingNode({
                  autoExpand: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.rootElement],
                      autoExpand: true,
                      children: [
                        NodeValidators.createForClassGroupingNode({
                          autoExpand: true,
                          children: [
                            NodeValidators.createForInstanceNode({
                              instanceKeys: [keys.middleElement],
                              autoExpand: true,
                              children: [
                                NodeValidators.createForClassGroupingNode({
                                  autoExpand: false,
                                  children: [
                                    NodeValidators.createForInstanceNode({
                                      instanceKeys: [keys.childElement],
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

      it("sets auto-expand flag for target grouping node if another target is a child element", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const elements = [
            insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id }),
            insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id }),
          ];
          return { rootSubject, model, category, elements };
        });

        const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
        const rootNodeKey = "root-node";
        const hierarchy: HierarchyDefinition = {
          defineHierarchyLevel: async (props) => {
            if (!props.parentNode) {
              return [{ node: { key: rootNodeKey, label: "Root" } }];
            }

            return [
              {
                fullClassName: "BisCore.PhysicalElement",
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      ecClassId: { selector: "this.ECClassId" },
                      nodeLabel: { selector: "idToHex(this.ECInstanceId)" },
                      grouping: { byClass: true },
                    })}
                    FROM BisCore.PhysicalElement this
                  `,
                },
              },
            ];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            filteredNodePaths: [
              { path: [{ key: rootNodeKey }, keys.elements[0]], options: { autoExpand: true } },
              ...keys.elements.map((elementKey) => ({
                path: [{ key: rootNodeKey }, elementKey],
                options: {
                  autoExpand: {
                    key: { type: "class-grouping" as const, className: elementKey.className },
                    depth: 1,
                  },
                },
              })),
            ],
          }),
          expect: [
            NodeValidators.createForCustomNode({
              key: rootNodeKey,
              autoExpand: true,
              children: [
                NodeValidators.createForClassGroupingNode({
                  className: keys.elements[0].className,
                  autoExpand: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.elements[0]],
                      isFilterTarget: true,
                    }),
                    NodeValidators.createForInstanceNode({
                      isFilterTarget: true,
                      instanceKeys: [keys.elements[1]],
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      describe("nested grouping nodes of different types", async function () {
        const rootNodeKey = "root-node";
        let hierarchy: HierarchyDefinition;
        let imodel: IModelConnection;
        let elementKey: InstanceKey;
        let circleClassName: string;

        before(async function () {
          const result = await buildIModel(this, async (builder) => {
            const schema = await importSchema(
              this,
              builder,
              `
                <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
                <ECEntityClass typeName="Circle">
                  <BaseClass>bis:PhysicalElement</BaseClass>
                  <ECProperty propertyName="Color" typeName="string" />
                </ECEntityClass>
              `,
            );
            const category = insertSpatialCategory({ builder, codeValue: "category" });
            const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
            circleClassName = schema.items.Circle.fullName;
            elementKey = insertPhysicalElement({
              builder,
              modelId: model.id,
              categoryId: category.id,
              classFullName: circleClassName,
              ["Color"]: "Red",
            });
          });
          imodel = result.imodel;

          const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess: createIModelAccess(imodel) });
          hierarchy = {
            defineHierarchyLevel: async (props) => {
              if (!props.parentNode) {
                return [{ node: { key: rootNodeKey, label: "Root" } }];
              }

              return [
                {
                  fullClassName: circleClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        ecClassId: { selector: "this.ECClassId" },
                        nodeLabel: "Circle",
                        grouping: {
                          byClass: true,
                          byProperties: {
                            propertiesClassName: circleClassName,
                            propertyGroups: [
                              {
                                propertyName: "Color",
                                propertyClassAlias: "this",
                              },
                            ],
                          },
                          byLabel: true,
                        },
                      })}
                      FROM ${circleClassName} this
                    `,
                  },
                },
              ];
            },
          };
        });

        it("sets auto-expand flag until class grouping node", async () => {
          const autoExpandOptions = {
            key: { type: "class-grouping", className: circleClassName },
            depth: 1,
          } as const;
          await validateHierarchy({
            provider: createProvider({
              imodel,
              hierarchy,
              filteredNodePaths: [
                {
                  path: [{ key: rootNodeKey }, elementKey],
                  options: { autoExpand: autoExpandOptions },
                },
              ],
            }),
            expect: [
              NodeValidators.createForCustomNode({
                key: rootNodeKey,
                autoExpand: true,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: circleClassName,
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
                                instanceKeys: [elementKey],
                                isFilterTarget: !!autoExpandOptions,
                                filterTargetOptions: { autoExpand: autoExpandOptions },
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

        it("sets auto-expand flag until property grouping node", async () => {
          const autoExpandOptions = {
            key: { type: "property-grouping:value", propertyClassName: circleClassName, propertyName: "Color", formattedPropertyValue: "Red" },
            depth: 2,
          } as const;
          await validateHierarchy({
            provider: createProvider({
              imodel,
              hierarchy,
              filteredNodePaths: [
                {
                  path: [{ key: rootNodeKey }, elementKey],
                  options: { autoExpand: autoExpandOptions },
                },
              ],
            }),
            expect: [
              NodeValidators.createForCustomNode({
                key: rootNodeKey,
                autoExpand: true,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: circleClassName,
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
                                instanceKeys: [elementKey],
                                isFilterTarget: true,
                                filterTargetOptions: { autoExpand: autoExpandOptions },
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

        it("sets auto-expand flag until label grouping node", async () => {
          const autoExpandOptions = {
            key: { type: "label-grouping", label: "Circle" },
            depth: 3,
          } as const;
          await validateHierarchy({
            provider: createProvider({
              imodel,
              hierarchy,
              filteredNodePaths: [
                {
                  path: [{ key: rootNodeKey }, elementKey],
                  options: { autoExpand: autoExpandOptions },
                },
              ],
            }),
            expect: [
              NodeValidators.createForCustomNode({
                key: rootNodeKey,
                autoExpand: true,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: circleClassName,
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
                                instanceKeys: [elementKey],
                                isFilterTarget: true,
                                filterTargetOptions: { autoExpand: autoExpandOptions },
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

        it("sets auto-expand flag until element instance node", async () => {
          await validateHierarchy({
            provider: createProvider({
              imodel,
              hierarchy,
              filteredNodePaths: [
                {
                  path: [{ key: rootNodeKey }, elementKey],
                  options: { autoExpand: true },
                },
              ],
            }),
            expect: [
              NodeValidators.createForCustomNode({
                key: rootNodeKey,
                autoExpand: true,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: circleClassName,
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
                                instanceKeys: [elementKey],
                                isFilterTarget: true,
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
  });
});

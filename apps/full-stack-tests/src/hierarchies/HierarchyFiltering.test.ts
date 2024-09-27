/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  createAsyncIterator,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
  insertSubject,
} from "presentation-test-utilities";
import { Subject } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import {
  createNodesQueryClauseFactory,
  createPredicateBasedHierarchyDefinition,
  DefineInstanceNodeChildHierarchyLevelProps,
  GenericNodeKey,
  HierarchyDefinition,
  HierarchyNode,
  HierarchyNodeIdentifier,
  HierarchyNodeKey,
  HierarchyProvider,
  mergeProviders,
} from "@itwin/presentation-hierarchies";
import { HierarchyFilteringPath } from "@itwin/presentation-hierarchies/lib/cjs/hierarchies/HierarchyFiltering";
import { createBisInstanceLabelSelectClauseFactory, ECSqlBinding, InstanceKey } from "@itwin/presentation-shared";
import { createFileNameFromString } from "@itwin/presentation-testing/lib/cjs/presentation-testing/InternalUtils";
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
        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
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
            if (HierarchyNode.isGeneric(parentNode)) {
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
            filteredNodePaths: [{ path: [keys.rootSubject, { type: "generic", id: "custom" }, keys.childSubject2], options: { autoExpand: true } }],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              autoExpand: true,
              isFilterTarget: false,
              children: [
                NodeValidators.createForGenericNode({
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

        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
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
          provider: createProvider({
            imodel,
            hierarchy,
            filteredNodePaths: [{ path: [keys.rootSubject, { type: "generic", id: "custom2" }], options: { autoExpand: true } }],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              autoExpand: true,
              isFilterTarget: false,
              children: [
                NodeValidators.createForGenericNode({
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

        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
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
            if (HierarchyNode.isGeneric(parentNode)) {
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
            filteredNodePaths: [{ path: [keys.rootSubject, { type: "generic", id: "custom" }, keys.childSubject2], options: { autoExpand: true } }],
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

        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
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
            if (HierarchyNode.isGeneric(parentNode)) {
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
          provider: createProvider({ imodel, hierarchy, filteredNodePaths: [[keys.rootSubject, { type: "generic", id: "custom" }]] }),
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

        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
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
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
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
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
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

        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        const rootNodeKey: GenericNodeKey = { type: "generic", id: "root-node" };
        const hierarchy: HierarchyDefinition = {
          defineHierarchyLevel: async (props) => {
            if (!props.parentNode) {
              return [{ node: { key: rootNodeKey.id, label: "Root" } }];
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
              path: [rootNodeKey, elementKey],
              options: {
                autoExpand: {
                  key: { type: "class-grouping", className: keys.elements[0].className },
                  depth: 1,
                },
              },
            })),
          }),
          expect: [
            NodeValidators.createForGenericNode({
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

        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        const rootNodeKey: GenericNodeKey = { type: "generic", id: "root-node" };
        const hierarchy: HierarchyDefinition = {
          defineHierarchyLevel: async ({ parentNode }) => {
            if (!parentNode) {
              return [{ node: { key: rootNodeKey.id, label: "Root" } }];
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
                    WHERE this.Parent.Id ${HierarchyNodeKey.isGeneric(parentNode.key) ? "IS NULL" : "= ?"}
                  `,
                  bindings: HierarchyNodeKey.isGeneric(parentNode.key) ? undefined : [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
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
                path: [rootNodeKey, keys.rootElement, keys.middleElement, keys.childElement],
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
            NodeValidators.createForGenericNode({
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

        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        const rootNodeKey: GenericNodeKey = { type: "generic", id: "root-node" };
        const hierarchy: HierarchyDefinition = {
          defineHierarchyLevel: async (props) => {
            if (!props.parentNode) {
              return [{ node: { key: rootNodeKey.id, label: "Root" } }];
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
              { path: [rootNodeKey, keys.elements[0]], options: { autoExpand: true } },
              ...keys.elements.map((elementKey) => ({
                path: [rootNodeKey, elementKey],
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
            NodeValidators.createForGenericNode({
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
        const rootNodeKey: GenericNodeKey = { type: "generic", id: "root-node" };
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

          const imodelAccess = createIModelAccess(imodel);
          const selectQueryFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
          });
          hierarchy = {
            defineHierarchyLevel: async (props) => {
              if (!props.parentNode) {
                return [{ node: { key: rootNodeKey.id, label: "Root" } }];
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
                  path: [rootNodeKey, elementKey],
                  options: { autoExpand: autoExpandOptions },
                },
              ],
            }),
            expect: [
              NodeValidators.createForGenericNode({
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
                  path: [rootNodeKey, elementKey],
                  options: { autoExpand: autoExpandOptions },
                },
              ],
            }),
            expect: [
              NodeValidators.createForGenericNode({
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
                  path: [rootNodeKey, elementKey],
                  options: { autoExpand: autoExpandOptions },
                },
              ],
            }),
            expect: [
              NodeValidators.createForGenericNode({
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
                  path: [rootNodeKey, elementKey],
                  options: { autoExpand: true },
                },
              ],
            }),
            expect: [
              NodeValidators.createForGenericNode({
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

    describe("when filtering merged hierarchy provider", () => {
      it("filters root nodes of individual provider", async function () {
        const { imodel: imodel1, ...keys1 } = await buildIModel(createFileNameFromString(`${this.test!.fullTitle()}-1`), async (builder) => {
          const testSubject = insertSubject({ builder, codeValue: "A subject", parentId: IModel.rootSubjectId });
          return { testSubject };
        });
        const { imodel: imodel2, ...keys2 } = await buildIModel(createFileNameFromString(`${this.test!.fullTitle()}-2`), async (builder) => {
          const testSubject = insertSubject({ builder, codeValue: "B subject", parentId: IModel.rootSubjectId });
          return { testSubject };
        });
        expect(keys1.testSubject).to.deep.eq(keys2.testSubject);

        const testSubjectKey1 = { ...keys1.testSubject, imodelKey: imodel1.key };
        const testSubjectKey2 = { ...keys1.testSubject, imodelKey: imodel2.key };

        const imodelAccess1 = createIModelAccess(imodel1);
        const provider1 = createProvider({
          imodelAccess: imodelAccess1,
          hierarchy: {
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [
                  {
                    fullClassName: subjectClassName,
                    query: {
                      ecsql: `
                        SELECT ${await createNodesQueryClauseFactory({
                          imodelAccess: imodelAccess1,
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess1 }),
                        }).createSelectClause({
                          ecClassId: { selector: `this.ECClassId` },
                          ecInstanceId: { selector: `this.ECInstanceId` },
                          nodeLabel: { selector: `this.CodeValue` },
                        })}
                        FROM ${subjectClassName} AS this
                        WHERE Parent IS NOT NULL
                      `,
                    },
                  },
                ];
              }
              return [];
            },
          },
        });
        const imodelAccess2 = createIModelAccess(imodel2);
        const provider2 = createProvider({
          imodelAccess: imodelAccess2,
          hierarchy: {
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [
                  {
                    fullClassName: subjectClassName,
                    query: {
                      ecsql: `
                        SELECT ${await createNodesQueryClauseFactory({
                          imodelAccess: imodelAccess2,
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess2 }),
                        }).createSelectClause({
                          ecClassId: { selector: `this.ECClassId` },
                          ecInstanceId: { selector: `this.ECInstanceId` },
                          nodeLabel: { selector: `this.CodeValue` },
                        })}
                        FROM ${subjectClassName} AS this
                        WHERE Parent IS NOT NULL
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
          imodel: imodel2,
          hierarchy: {
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [
                  {
                    node: {
                      key: "gen",
                      label: "Generic node 3",
                    },
                  },
                ];
              }
              return [];
            },
          },
        });
        const provider4 = new (class implements HierarchyProvider {
          private _filter: HierarchyFilteringPath[] | undefined;
          public getNodes: HierarchyProvider["getNodes"] = ({ parentNode }) => {
            if (!parentNode) {
              const myNode = {
                key: { type: "generic", id: "gen", source: "custom-provider" } satisfies GenericNodeKey,
                label: "Generic node 4",
                parentKeys: [],
                children: false,
              };
              const nodeMatchesFilter =
                !this._filter ||
                this._filter.some((fp) => {
                  const path = "options" in fp ? fp.path : fp;
                  return path.some((id) => {
                    return HierarchyNodeIdentifier.isGenericNodeIdentifier(id) && id.source === "custom-provider" && id.id === myNode.key.id;
                  });
                });
              if (nodeMatchesFilter) {
                return createAsyncIterator([myNode]);
              }
            }
            return createAsyncIterator([]);
          };
          public getNodeInstanceKeys: HierarchyProvider["getNodeInstanceKeys"] = () => {
            return createAsyncIterator([]);
          };
          public setFormatter: HierarchyProvider["setFormatter"] = () => {};
          public setHierarchyFilter: HierarchyProvider["setHierarchyFilter"] = (props) => {
            this._filter = props?.paths;
          };
        })();

        // ensure we have expected non-filtered hierarchy
        await validateHierarchy({
          provider: mergeProviders({ providers: [provider1, provider2, provider3, provider4] }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey1] }),
            NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey2] }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: imodel2.key } }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } }),
          ],
        });

        // ensure we get the same result when filter paths contain all root nodes
        await validateHierarchy({
          provider: mergeAndFilterProviders({
            providers: [provider1, provider2, provider3, provider4],
            filterProps: {
              paths: [
                [testSubjectKey1],
                [testSubjectKey2],
                [{ type: "generic", id: "gen", source: imodel2.key }],
                [{ type: "generic", id: "gen", source: "custom-provider" }],
              ],
            },
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey1] }),
            NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey2] }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: imodel2.key } }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } }),
          ],
        });

        // ensure we can filter each root node individually
        await validateHierarchy({
          provider: mergeAndFilterProviders({
            providers: [provider1, provider2, provider3, provider4],
            filterProps: {
              paths: [[testSubjectKey1]],
            },
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey1] })],
        });
        await validateHierarchy({
          provider: mergeAndFilterProviders({
            providers: [provider1, provider2, provider3, provider4],
            filterProps: {
              paths: [[testSubjectKey2]],
            },
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey2] })],
        });
        await validateHierarchy({
          provider: mergeAndFilterProviders({
            providers: [provider1, provider2, provider3, provider4],
            filterProps: {
              paths: [[{ type: "generic", id: "gen", source: imodel2.key }]],
            },
          }),
          expect: [NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: imodel2.key } })],
        });
        await validateHierarchy({
          provider: mergeAndFilterProviders({
            providers: [provider1, provider2, provider3, provider4],
            filterProps: {
              paths: [[{ type: "generic", id: "gen", source: "custom-provider" }]],
            },
          }),
          expect: [NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } })],
        });
      });

      it.skip("filters through multiple providers", async function () {
        const { imodel: imodel1, ...keys1 } = await buildIModel(createFileNameFromString(`${this.test!.fullTitle()}-1`), async (builder) => {
          const subject1 = insertSubject({ builder, codeValue: "A subject 1", parentId: IModel.rootSubjectId });
          const subject11 = insertSubject({ builder, codeValue: "A subject 1.1", parentId: subject1.id });
          return { subject1, subject11 };
        });
        const { imodel: imodel2, ...keys2 } = await buildIModel(createFileNameFromString(`${this.test!.fullTitle()}-2`), async (builder) => {
          const subject2 = insertSubject({ builder, codeValue: "B subject 2", parentId: IModel.rootSubjectId });
          const subject21 = insertSubject({ builder, codeValue: "B subject 2.1", parentId: subject2.id });
          return { subject2, subject21 };
        });

        const instanceKeys: (typeof keys1 & typeof keys2) & {} = {
          ...Object.entries(keys1).reduce<Record<keyof typeof keys1, InstanceKey>>((acc, [key, value]) => {
            (acc as any)[key as any] = { ...value, imodelKey: imodel1.key };
            return acc;
          }, {} as any),
          ...Object.entries(keys2).reduce<Record<keyof typeof keys2, InstanceKey>>((acc, [key, value]) => {
            (acc as any)[key as any] = { ...value, imodelKey: imodel2.key };
            return acc;
          }, {} as any),
        };

        function createSubjectsHierarchyProvider(imodelAccess: ReturnType<typeof createIModelAccess>): HierarchyProvider {
          return createProvider({
            imodelAccess,
            hierarchy: createPredicateBasedHierarchyDefinition({
              classHierarchyInspector: imodelAccess,
              hierarchy: {
                rootNodes: async () => [
                  {
                    fullClassName: subjectClassName,
                    query: {
                      ecsql: `
                        SELECT ${await createNodesQueryClauseFactory({
                          imodelAccess,
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                        }).createSelectClause({
                          ecClassId: { selector: `this.ECClassId` },
                          ecInstanceId: { selector: `this.ECInstanceId` },
                          nodeLabel: { selector: `this.CodeValue` },
                          hideNodeInHierarchy: true,
                        })}
                        FROM ${subjectClassName} AS this
                        WHERE Parent IS NULL
                      `,
                    },
                  },
                ],
                childNodes: [
                  {
                    parentInstancesNodePredicate: subjectClassName,
                    definitions: async ({ parentNode }: DefineInstanceNodeChildHierarchyLevelProps) => [
                      {
                        fullClassName: subjectClassName,
                        query: {
                          ecsql: `
                            SELECT ${await createNodesQueryClauseFactory({
                              imodelAccess,
                              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                            }).createSelectClause({
                              ecClassId: { selector: `this.ECClassId` },
                              ecInstanceId: { selector: `this.ECInstanceId` },
                              nodeLabel: { selector: `this.CodeValue` },
                            })}
                            FROM ${subjectClassName} AS this
                            WHERE Parent.Id = ${parentNode.key.instanceKeys[0].id}
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

        // create subject hierarchy providers for two iModels
        const provider1 = createSubjectsHierarchyProvider(createIModelAccess(imodel1));
        const provider2 = createSubjectsHierarchyProvider(createIModelAccess(imodel2));
        // create generic node provider that creates a node for every bis.Subject node of any iModel
        const provider3 = new (class implements HierarchyProvider {
          public getNodes: HierarchyProvider["getNodes"] = ({ parentNode }) => {
            if (
              parentNode &&
              HierarchyNode.isInstancesNode(parentNode) &&
              parentNode.key.instanceKeys.some(({ className }) => className === subjectClassName)
            ) {
              const myNode = {
                key: { type: "generic", id: "gen", source: "custom-provider" } satisfies GenericNodeKey,
                label: "Generic node",
                parentKeys: [...parentNode.parentKeys, parentNode.key],
                children: false,
              };
              const nodeMatchesFilter =
                !parentNode.filtering ||
                parentNode.filtering.hasFilterTargetAncestor ||
                parentNode.filtering.isFilterTarget ||
                parentNode.filtering.filteredChildrenIdentifierPaths?.some((fp) => {
                  const path = "options" in fp ? fp.path : fp;
                  return path.some((id) => {
                    return HierarchyNodeIdentifier.isGenericNodeIdentifier(id) && id.source === "custom-provider" && id.id === myNode.key.id;
                  });
                });
              if (nodeMatchesFilter) {
                return createAsyncIterator([myNode]);
              }
            }
            return createAsyncIterator([]);
          };
          public getNodeInstanceKeys: HierarchyProvider["getNodeInstanceKeys"] = () => createAsyncIterator([]);
          public setFormatter: HierarchyProvider["setFormatter"] = () => {};
          public setHierarchyFilter: HierarchyProvider["setHierarchyFilter"] = () => {
            // don't need to save this, because this provider doesn't return any root nodes and for
            // child nodes we take filter paths from parent node
          };
        })();

        // ensure we have expected non-filtered hierarchy
        await validateHierarchy({
          provider: mergeProviders({ providers: [provider1, provider2, provider3] }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [instanceKeys.subject1],
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [instanceKeys.subject11],
                  children: [NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } })],
                }),
                NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } }),
              ],
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [instanceKeys.subject2],
              children: [NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } })],
            }),
          ],
        });

        // ensure we can filter through different providers
        await validateHierarchy({
          provider: mergeAndFilterProviders({
            providers: [provider1, provider2, provider3],
            filterProps: {
              paths: [
                [instanceKeys.subject1, instanceKeys.subject11, { type: "generic", id: "gen", source: "custom-provider" }],
                [instanceKeys.subject2, { type: "generic", id: "gen", source: "custom-provider" }],
              ],
            },
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [instanceKeys.subject1],
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [instanceKeys.subject11],
                  children: [NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } })],
                }),
              ],
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [instanceKeys.subject2],
              children: [NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } })],
            }),
          ],
        });
      });
    });
  });
});

function mergeAndFilterProviders({
  providers,
  filterProps,
}: {
  providers: HierarchyProvider[];
  filterProps: Parameters<HierarchyProvider["setHierarchyFilter"]>[0];
}) {
  const mergedProvider = mergeProviders({ providers });
  mergedProvider.setHierarchyFilter(filterProps);
  return mergedProvider;
}

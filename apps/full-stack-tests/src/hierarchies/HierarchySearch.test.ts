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
import { IModel } from "@itwin/core-common";
import {
  createHierarchyProvider,
  createHierarchySearchHelper,
  createNodesQueryClauseFactory,
  createPredicateBasedHierarchyDefinition,
  HierarchyNode,
  HierarchyNodeIdentifier,
  HierarchyNodeKey,
  mergeProviders,
} from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, normalizeFullClassName } from "@itwin/presentation-shared";
import { createFileNameFromString } from "@itwin/presentation-testing";
import { withECDb } from "../ECDbUtils.js";
import { buildIModel } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { NodeValidators, validateHierarchy } from "./HierarchyValidation.js";
import { createIModelAccess, createProvider } from "./Utils.js";

import type { Id64String } from "@itwin/core-bentley";
import type { IModelConnection } from "@itwin/core-frontend";
import type {
  DefineInstanceNodeChildHierarchyLevelProps,
  GenericNodeKey,
  HierarchyDefinition,
  HierarchyProvider,
  HierarchySearchTree,
  IModelInstanceKey,
} from "@itwin/presentation-hierarchies";
import type { EC, ECSqlBinding, InstanceKey, Props } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  describe("Hierarchy search", () => {
    let subjectClassName: EC.FullClassName;

    before(async function () {
      await initialize();
      subjectClassName = normalizeFullClassName(Subject.classFullName);
    });

    after(async () => {
      await terminate();
    });

    describe("generic nodes", () => {
      it("searches through generic nodes", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2 };
        });
        const imodelAccess = createIModelAccess(imodel);
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
                    extendedData: { parentSubjectIds: parentNode.key.instanceKeys.map((key) => key.id) },
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
                    bindings: parentNode.extendedData!.parentSubjectIds.map(
                      (id: Id64String): ECSqlBinding => ({ type: "id", value: id }),
                    ),
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
            search: [
              {
                identifier: keys.rootSubject,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { type: "generic", id: "custom" },
                    options: { autoExpand: true },
                    children: [{ identifier: keys.childSubject2 }],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              autoExpand: true,
              isSearchTarget: false,
              children: [
                NodeValidators.createForGenericNode({
                  key: "custom",
                  autoExpand: true,
                  isSearchTarget: false,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject2],
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

      it("searches generic nodes", async function () {
        const { imodel, ...keys } = await buildIModel(this, async () => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          return { rootSubject };
        });

        const imodelAccess = createIModelAccess(imodel);
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
                { node: { key: "custom1", label: "custom1", children: undefined } },
                { node: { key: "custom2", label: "custom2", children: undefined } },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            search: [
              {
                identifier: keys.rootSubject,
                options: { autoExpand: true },
                children: [{ identifier: { type: "generic", id: "custom2" } }],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              autoExpand: true,
              isSearchTarget: false,
              children: [
                NodeValidators.createForGenericNode({ key: "custom2", autoExpand: false, isSearchTarget: true }),
              ],
            }),
          ],
        });
      });

      it("searches generic nodes when targeting child and ancestor", async function () {
        const { imodel } = await buildIModel(this, async () => {});
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
            imodel,
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
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject21 = insertSubject({ builder, codeValue: "test subject 2.1", parentId: rootSubject.id });
          const childSubject22 = insertSubject({ builder, codeValue: "test subject 2.2", parentId: rootSubject.id });
          const childSubject3 = insertSubject({ builder, codeValue: "test subject 3", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject21, childSubject22, childSubject3 };
        });
        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const createHierarchyLevelDefinition = async (whereClause: (alias: string) => string) => {
          return [
            {
              fullClassName: subjectClassName,
              query: {
                ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.CodeValue` },
                    grouping: { byClass: true, byLabel: true },
                  })}
                  FROM ${subjectClassName} AS this
                  ${whereClause("this")}
                `,
              },
            },
          ];
        };

        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return createHierarchyLevelDefinition(
                (alias: string) => `WHERE ${alias}.ECInstanceId = ${keys.childSubject1.id}`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "test subject 1") {
              return createHierarchyLevelDefinition(
                (alias: string) =>
                  `WHERE ${alias}.ECInstanceId IN (${keys.childSubject21.id}, ${keys.childSubject22.id})`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "test subject 2.1") {
              return createHierarchyLevelDefinition(
                (alias: string) => `WHERE ${alias}.ECInstanceId = ${keys.childSubject3.id}`,
              );
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            search: [
              {
                identifier: keys.childSubject1,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: keys.childSubject21,
                    options: { autoExpand: true },
                    children: [{ identifier: keys.childSubject3, options: { autoExpand: { groupingLevel: 1 } } }],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              autoExpand: true,
              className: keys.childSubject1.className,
              children: [
                NodeValidators.createForLabelGroupingNode({
                  autoExpand: true,
                  label: "test subject 1",
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject1],
                      autoExpand: true,
                      children: [
                        NodeValidators.createForClassGroupingNode({
                          autoExpand: true,
                          className: keys.childSubject21.className,
                          children: [
                            NodeValidators.createForLabelGroupingNode({
                              autoExpand: true,
                              label: "test subject 2.1",
                              children: [
                                NodeValidators.createForInstanceNode({
                                  instanceKeys: [keys.childSubject21],
                                  autoExpand: true,
                                  children: [
                                    NodeValidators.createForClassGroupingNode({
                                      autoExpand: true,
                                      className: keys.childSubject21.className,
                                      children: [
                                        NodeValidators.createForLabelGroupingNode({
                                          autoExpand: false,
                                          label: "test subject 3",
                                          children: [
                                            NodeValidators.createForInstanceNode({
                                              instanceKeys: [keys.childSubject3],
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
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
          const childSubject3 = insertSubject({ builder, codeValue: "test subject 3", parentId: rootSubject.id });
          const childSubject4 = insertSubject({ builder, codeValue: "test subject 4", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2, childSubject3, childSubject4 };
        });
        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const createHierarchyLevelDefinition = async (whereClause: (alias: string) => string) => {
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
                  ${whereClause("this")}
                `,
              },
            },
          ];
        };

        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return createHierarchyLevelDefinition(
                (alias: string) =>
                  `WHERE ${alias}.ECInstanceId IN (${keys.childSubject1.id}, ${keys.childSubject4.id})`,
              );
            }
            if (
              HierarchyNode.isInstancesNode(parentNode) &&
              parentNode.label === "test subject 1" &&
              parentNode.parentKeys.length === 0
            ) {
              return createHierarchyLevelDefinition(
                (alias: string) =>
                  `WHERE ${alias}.ECInstanceId IN (${keys.childSubject2.id}, ${keys.childSubject3.id})`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "test subject 4") {
              return createHierarchyLevelDefinition(
                (alias: string) => `WHERE ${alias}.ECInstanceId = ${keys.childSubject1.id}`,
              );
            }
            if (
              HierarchyNode.isInstancesNode(parentNode) &&
              parentNode.label === "test subject 1" &&
              parentNode.parentKeys.length === 1
            ) {
              return createHierarchyLevelDefinition(
                (alias: string) => `WHERE ${alias}.ECInstanceId = ${keys.childSubject2.id}`,
              );
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            search: [
              {
                identifier: keys.childSubject1,
                options: { autoExpand: true },
                children: [{ identifier: keys.childSubject3 }],
              },
              {
                identifier: keys.childSubject4,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: keys.childSubject1,
                    options: { autoExpand: true },
                    children: [{ identifier: keys.childSubject2 }],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childSubject3],
                  isSearchTarget: true,
                  children: false,
                  autoExpand: false,
                }),
              ],
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject4],
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childSubject1],
                  autoExpand: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject2],
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

      it("searches instance nodes when targeting child and ancestor", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
          const childSubject21 = insertSubject({ builder, codeValue: "test subject 21", parentId: rootSubject.id });
          const childSubject22 = insertSubject({ builder, codeValue: "test subject 22", parentId: rootSubject.id });
          const childSubject221 = insertSubject({ builder, codeValue: "test subject 221", parentId: rootSubject.id });
          const childSubject222 = insertSubject({ builder, codeValue: "test subject 222", parentId: rootSubject.id });
          return {
            rootSubject,
            childSubject1,
            childSubject2,
            childSubject21,
            childSubject22,
            childSubject221,
            childSubject222,
          };
        });
        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const createHierarchyLevelDefinition = async (whereClause: (alias: string) => string) => [
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
                ${whereClause("this")}
              `,
            },
          },
        ];
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return createHierarchyLevelDefinition(
                (alias: string) =>
                  `WHERE ${alias}.ECInstanceId IN (${keys.childSubject1.id}, ${keys.childSubject2.id})`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "test subject 2") {
              return createHierarchyLevelDefinition(
                (alias: string) =>
                  `WHERE ${alias}.ECInstanceId IN (${keys.childSubject21.id}, ${keys.childSubject22.id})`,
              );
            }
            if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "test subject 22") {
              return createHierarchyLevelDefinition(
                (alias: string) =>
                  `WHERE ${alias}.ECInstanceId IN (${keys.childSubject221.id}, ${keys.childSubject222.id})`,
              );
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            search: [
              {
                identifier: keys.childSubject2,
                isTarget: true,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: keys.childSubject22,
                    options: { autoExpand: true },
                    children: [{ identifier: keys.childSubject222 }],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject2],
              isSearchTarget: true,
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childSubject21],
                  isSearchTarget: false,
                  children: false,
                  autoExpand: false,
                }),
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childSubject22],
                  autoExpand: true,
                  isSearchTarget: false,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject221],
                      isSearchTarget: false,
                      children: false,
                      autoExpand: false,
                    }),
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject222],
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
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2 };
        });

        const imodelAccess = createIModelAccess(imodel);
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
                    processingParams: { hideInHierarchy: true },
                    extendedData: { parentSubjectIds: parentNode.key.instanceKeys.map((key) => key.id) },
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
                    bindings: parentNode.extendedData!.parentSubjectIds.map(
                      (id: Id64String): ECSqlBinding => ({ type: "id", value: id }),
                    ),
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
            search: [
              {
                identifier: keys.rootSubject,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: { type: "generic", id: "custom" },
                    options: { autoExpand: true },
                    children: [{ identifier: keys.childSubject2 }],
                  },
                ],
              },
            ],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              autoExpand: true,
              isSearchTarget: false,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childSubject2],
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
      it("doesn't return matching hidden generic nodes or their children", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2 };
        });

        const imodelAccess = createIModelAccess(imodel);
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
                    processingParams: { hideInHierarchy: true },
                    extendedData: { parentSubjectIds: parentNode.key.instanceKeys.map((key) => key.id) },
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
                    bindings: parentNode.extendedData!.parentSubjectIds.map(
                      (id: Id64String): ECSqlBinding => ({ type: "id", value: id }),
                    ),
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
            search: [{ identifier: keys.rootSubject, children: [{ identifier: { type: "generic", id: "custom" } }] }],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              isSearchTarget: false,
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
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
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
          provider: createProvider({
            imodel,
            hierarchy,
            search: [{ identifier: keys.rootSubject, children: [{ identifier: keys.childSubject1 }] }],
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              isSearchTarget: false,
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
                search: [
                  { identifier: x, isTarget: true, options: { autoExpand: true }, children: [{ identifier: y }] },
                ],
              }),
              expect: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [x],
                  autoExpand: true,
                  isSearchTarget: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [z],
                      autoExpand: false,
                      isSearchTarget: false,
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
                search: [
                  { identifier: x, isTarget: true, options: { autoExpand: true }, children: [{ identifier: y1 }] },
                ],
              }),
              expect: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [x],
                  autoExpand: true,
                  isSearchTarget: true,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [y2],
                      autoExpand: false,
                      isSearchTarget: false,
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
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
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
            search: [
              {
                identifier: rootNodeKey,
                options: { autoExpand: true },
                children: keys.elements.map((key) => ({ identifier: key })),
              },
            ],
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
          const middleElement = insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            parentId: rootElement.id,
          });
          const childElement = insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            parentId: middleElement.id,
          });
          return { rootSubject, model, category, rootElement, middleElement, childElement };
        });

        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
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
                  bindings: HierarchyNodeKey.isGeneric(parentNode.key)
                    ? undefined
                    : [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
                },
              },
            ];
          },
        };

        await validateHierarchy({
          provider: createProvider({
            imodel,
            hierarchy,
            search: [
              {
                identifier: rootNodeKey,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: keys.rootElement,
                    options: { autoExpand: true },
                    children: [
                      {
                        identifier: keys.middleElement,
                        options: { autoExpand: true },
                        children: [{ identifier: keys.childElement }],
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
                                    NodeValidators.createForInstanceNode({ instanceKeys: [keys.childElement] }),
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

      describe("nested grouping nodes of different types", async function () {
        const rootNodeKey: GenericNodeKey = { type: "generic", id: "root-node" };
        let hierarchy: HierarchyDefinition;
        let imodel: IModelConnection;
        let elementKey: InstanceKey;
        let circleClassName: EC.FullClassName;

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
            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
              classHierarchyInspector: imodelAccess,
            }),
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
                            propertyGroups: [{ propertyName: "Color", propertyClassAlias: "this" }],
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

        it("sets auto-expand flag until the first grouping node", async () => {
          await validateHierarchy({
            provider: createProvider({
              imodel,
              hierarchy,
              search: [
                { identifier: rootNodeKey, options: { autoExpand: true }, children: [{ identifier: elementKey }] },
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
              imodel,
              hierarchy,
              search: [
                {
                  identifier: rootNodeKey,
                  options: { autoExpand: true },
                  children: [{ identifier: elementKey, options: { autoExpand: { groupingLevel: 1 } } }],
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
              imodel,
              hierarchy,
              search: [
                {
                  identifier: rootNodeKey,
                  options: { autoExpand: true },
                  children: [{ identifier: elementKey, options: { autoExpand: { groupingLevel: 2 } } }],
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
              imodel,
              hierarchy,
              search: [
                {
                  identifier: rootNodeKey,
                  options: { autoExpand: true },
                  children: [{ identifier: elementKey, options: { autoExpand: true } }],
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
      it("searches root nodes of individual provider", async function () {
        const { imodel: imodel1, ...keys1 } = await buildIModel(
          createFileNameFromString(`${this.test!.fullTitle()}-1`),
          async (builder) => {
            const testSubject = insertSubject({ builder, codeValue: "A subject", parentId: IModel.rootSubjectId });
            return { testSubject };
          },
        );
        const { imodel: imodel2, ...keys2 } = await buildIModel(
          createFileNameFromString(`${this.test!.fullTitle()}-2`),
          async (builder) => {
            const testSubject = insertSubject({ builder, codeValue: "B subject", parentId: IModel.rootSubjectId });
            return { testSubject };
          },
        );
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
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
                            classHierarchyInspector: imodelAccess1,
                          }),
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
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
                            classHierarchyInspector: imodelAccess2,
                          }),
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
          sourceName: "provider3",
          imodel: imodel2,
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
            NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey1] }),
            NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey2] }),
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
                { identifier: testSubjectKey1 },
                { identifier: testSubjectKey2 },
                { identifier: { type: "generic", id: "gen", source: "provider3" } },
                { identifier: { type: "generic", id: "gen", source: "custom-provider" } },
              ],
            },
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey1] }),
            NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey2] }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "provider3" } }),
            NodeValidators.createForGenericNode({ key: { type: "generic", id: "gen", source: "custom-provider" } }),
          ],
        });

        // ensure we can search each root node individually
        await validateHierarchy({
          provider: mergeAndSearchProviders({
            providers: [provider1, provider2, provider3, provider4],
            searchProps: { paths: [{ identifier: testSubjectKey1 }] },
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey1] })],
        });
        await validateHierarchy({
          provider: mergeAndSearchProviders({
            providers: [provider1, provider2, provider3, provider4],
            searchProps: { paths: [{ identifier: testSubjectKey2 }] },
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [testSubjectKey2] })],
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
        const rootSubjectKey = { className: subjectClassName, id: IModel.rootSubjectId };
        const { imodel: imodel1, ...keys1 } = await buildIModel(
          createFileNameFromString(`${this.test!.fullTitle()}-1`),
          async (builder) => {
            const subject1 = insertSubject({ builder, codeValue: "A subject 1", parentId: rootSubjectKey.id });
            const subject2 = insertSubject({ builder, codeValue: "A subject 2", parentId: subject1.id });
            return { subject1, subject2 };
          },
        );
        const { imodel: imodel2, ...keys2 } = await buildIModel(
          createFileNameFromString(`${this.test!.fullTitle()}-2`),
          async (builder) => {
            const subject1 = insertSubject({ builder, codeValue: "B subject 1", parentId: rootSubjectKey.id });
            const subject2 = insertSubject({ builder, codeValue: "B subject 2", parentId: subject1.id });
            return { subject1, subject2 };
          },
        );

        function createSubjectsHierarchyProvider(
          imodelAccess: ReturnType<typeof createIModelAccess>,
        ): HierarchyProvider {
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
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
                            classHierarchyInspector: imodelAccess,
                          }),
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
                    definitions: async ({ parentNodeInstanceIds }: DefineInstanceNodeChildHierarchyLevelProps) => [
                      {
                        fullClassName: subjectClassName,
                        query: {
                          ecsql: `
                            SELECT ${await createNodesQueryClauseFactory({
                              imodelAccess,
                              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
                                classHierarchyInspector: imodelAccess,
                              }),
                            }).createSelectClause({
                              ecClassId: { selector: `this.ECClassId` },
                              ecInstanceId: { selector: `this.ECInstanceId` },
                              nodeLabel: { selector: `this.CodeValue` },
                            })}
                            FROM ${subjectClassName} AS this
                            WHERE Parent.Id IN (${parentNodeInstanceIds.join(",")})
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

        Object.values(keys1).forEach((value: IModelInstanceKey) => (value.imodelKey = imodel1.key));
        Object.values(keys2).forEach((value: IModelInstanceKey) => (value.imodelKey = imodel2.key));

        // create subject hierarchy providers for two iModels
        const provider1 = createSubjectsHierarchyProvider(createIModelAccess(imodel1));
        const provider2 = createSubjectsHierarchyProvider(createIModelAccess(imodel2));
        // create generic node provider that creates a node for every bis.Subject node of any iModel
        const provider3 = createHierarchyProvider(
          () =>
            new (class implements Pick<HierarchyProvider, "getNodes" | "setHierarchySearch"> {
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
              instanceKeys: [keys1.subject1],
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys1.subject2],
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
              instanceKeys: [keys2.subject1],
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys2.subject2],
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
        await validateHierarchy({
          provider: mergeAndSearchProviders({
            providers: [provider1, provider2, provider3],
            searchProps: {
              paths: [
                {
                  identifier: rootSubjectKey,
                  children: [
                    {
                      identifier: keys1.subject1,
                      children: [
                        {
                          identifier: keys1.subject2,
                          children: [{ identifier: { type: "generic", id: "gen", source: "custom-provider" } }],
                        },
                      ],
                    },
                    {
                      identifier: keys2.subject1,
                      children: [{ identifier: { type: "generic", id: "gen", source: "custom-provider" } }],
                    },
                  ],
                },
              ],
            },
          }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys1.subject1],
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys1.subject2],
                  children: [NodeValidators.createForGenericNode({ key: "gen" })],
                }),
              ],
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys2.subject1],
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

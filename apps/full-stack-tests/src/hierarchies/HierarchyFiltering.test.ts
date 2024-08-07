/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertSubject } from "presentation-test-utilities";
import { Subject } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { IModel } from "@itwin/core-common";
import { createNodesQueryClauseFactory, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";
import { ECSqlBinding } from "@itwin/presentation-shared";
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
  });
});

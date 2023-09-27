/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import {
  ECSqlBinding,
  HierarchyNode,
  HierarchyProvider,
  Id64String,
  IHierarchyLevelDefinitionsFactory,
  InstanceKeyPath,
  NodeSelectClauseFactory,
} from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertSubject } from "../IModelUtils";
import { initialize, terminate } from "../IntegrationTests";
import { NodeValidators, validateHierarchy } from "./HierarchyValidation";

describe("Stateless hierarchy builder", () => {
  describe.only("Filtering", () => {
    let selectClauseFactory: NodeSelectClauseFactory;

    before(async function () {
      await initialize();
      selectClauseFactory = new NodeSelectClauseFactory();
    });

    after(async () => {
      await terminate();
    });

    function createFilteredProvider(props: {
      imodel: IModelConnection;
      hierarchy: IHierarchyLevelDefinitionsFactory;
      filteredInstancePaths: InstanceKeyPath[];
    }) {
      const { imodel, hierarchy, filteredInstancePaths } = props;
      const schemas = new SchemaContext();
      schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
      const metadataProvider = createMetadataProvider(schemas);
      return new HierarchyProvider({
        metadataProvider,
        hierarchyDefinition: hierarchy,
        queryExecutor: createECSqlQueryExecutor(imodel),
        filtering: {
          paths: filteredInstancePaths,
        },
      });
    }

    it("filters through custom nodes", async function () {
      const { imodel, subjectClassName, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: Subject.classFullName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, label: "test subject 1", parentId: rootSubject.id });
        const childSubject2 = insertSubject({ builder, label: "test subject 2", parentId: rootSubject.id });
        return { subjectClassName: Subject.classFullName.replace(":", "."), rootSubject, childSubject1, childSubject2 };
      });

      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
          if (!parentNode) {
            return [
              {
                fullClassName: subjectClassName,
                query: {
                  ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
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
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
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
        provider: createFilteredProvider({ imodel, hierarchy, filteredInstancePaths: [[keys.rootSubject, keys.childSubject2]] }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForCustomNode({
                key: "custom",
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject2],
                    children: false,
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it("filters through hidden custom nodes", async function () {
      const { imodel, subjectClassName, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: Subject.classFullName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, label: "test subject 1", parentId: rootSubject.id });
        const childSubject2 = insertSubject({ builder, label: "test subject 2", parentId: rootSubject.id });
        return { subjectClassName: Subject.classFullName.replace(":", "."), rootSubject, childSubject1, childSubject2 };
      });

      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
          if (!parentNode) {
            return [
              {
                fullClassName: subjectClassName,
                query: {
                  ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
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
                  params: {
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
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
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
        provider: createFilteredProvider({ imodel, hierarchy, filteredInstancePaths: [[keys.rootSubject, keys.childSubject2]] }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject2],
                children: false,
              }),
            ],
          }),
        ],
      });
    });

    it("doesn't create custom node if all children are filtered-out", async function () {
      const { imodel, subjectClassName, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: Subject.classFullName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, label: "test subject 1", parentId: rootSubject.id });
        const childSubject2 = insertSubject({ builder, label: "test subject 2", parentId: rootSubject.id });
        return { subjectClassName: Subject.classFullName.replace(":", "."), rootSubject, childSubject1, childSubject2 };
      });

      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
          if (!parentNode) {
            return [
              {
                fullClassName: subjectClassName,
                query: {
                  ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
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
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
                    })}
                    FROM ${subjectClassName} AS this
                    WHERE this.Parent.Id IN (?)
                  `,
                  bindings: [{ type: "id", value: keys.childSubject1.id }],
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createFilteredProvider({ imodel, hierarchy, filteredInstancePaths: [[keys.rootSubject, keys.childSubject2]] }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: false,
          }),
        ],
      });
    });
  });
});

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
import { HierarchyNode, HierarchyProvider, IHierarchyLevelDefinitionsFactory, NodeSelectClauseFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertSubject } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";

describe("Stateless hierarchy builder", () => {
  describe("LabelGrouping", () => {
    let selectClauseFactory: NodeSelectClauseFactory;
    let subjectClassName: string;

    before(async function () {
      await initialize();
      subjectClassName = Subject.classFullName.replace(":", ".");
      selectClauseFactory = new NodeSelectClauseFactory();
    });

    after(async () => {
      await terminate();
    });

    function createProvider(props: { imodel: IModelConnection; hierarchy: IHierarchyLevelDefinitionsFactory }) {
      const { imodel, hierarchy } = props;
      const schemas = new SchemaContext();
      schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
      const metadataProvider = createMetadataProvider(schemas);
      return new HierarchyProvider({
        metadataProvider,
        hierarchyDefinition: hierarchy,
        queryExecutor: createECSqlQueryExecutor(imodel),
      });
    }

    const basicHierarchy: IHierarchyLevelDefinitionsFactory = {
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
                  WHERE this.ECInstanceId = (${IModel.rootSubjectId})
                `,
              },
            },
          ];
        } else if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
          return [
            {
              fullClassName: subjectClassName,
              query: {
                ecsql: `
                  SELECT ${await selectClauseFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.UserLabel` },
                    groupByLabel: true,
                  })}
                  FROM ${subjectClassName} AS this
                  WHERE this.Parent.Id = (${IModel.rootSubjectId})
                `,
              },
            },
          ];
        }
        return [];
      },
    };

    it("does not create groups of 1", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, codeValue: "1", parentId: rootSubject.id, userLabel: "test1" });
        const childSubject2 = insertSubject({ builder, codeValue: "2", parentId: rootSubject.id, userLabel: "test2" });
        return { rootSubject, childSubject1, childSubject2 };
      });

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: basicHierarchy }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject1],
                children: false,
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject2],
                children: false,
              }),
            ],
          }),
        ],
      });
    });

    it("does not group if all nodes have the same label", async function () {
      const labelGroupName = "test1";
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id, userLabel: labelGroupName });
        const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id, userLabel: labelGroupName });
        const childSubject3 = insertSubject({ builder, codeValue: "test subject 3", parentId: rootSubject.id, userLabel: labelGroupName });
        return { rootSubject, childSubject1, childSubject2, childSubject3 };
      });

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: basicHierarchy }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject1],
                children: false,
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject2],
                children: false,
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject3],
                children: false,
              }),
            ],
          }),
        ],
      });
    });

    it("creates groups only when multiple nodes share the same label", async function () {
      const labelGroupName = "test1";
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, codeValue: "1", parentId: rootSubject.id, userLabel: labelGroupName });
        const childSubject2 = insertSubject({ builder, codeValue: "2", parentId: rootSubject.id, userLabel: "test2" });
        const childSubject3 = insertSubject({ builder, codeValue: "3", parentId: rootSubject.id, userLabel: labelGroupName });
        return { rootSubject, childSubject1, childSubject2, childSubject3 };
      });

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: basicHierarchy }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForLabelGroupingNode({
                label: labelGroupName,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject1],
                    children: false,
                  }),
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject3],
                    children: false,
                  }),
                ],
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject2],
                children: false,
              }),
            ],
          }),
        ],
      });
    });

    it("creates different groups for different labels", async function () {
      const labelGroupName1 = "test1";
      const labelGroupName2 = "test2";
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, codeValue: "1", parentId: rootSubject.id, userLabel: labelGroupName1 });
        const childSubject2 = insertSubject({ builder, codeValue: "2", parentId: rootSubject.id, userLabel: labelGroupName2 });
        const childSubject3 = insertSubject({ builder, codeValue: "3", parentId: rootSubject.id, userLabel: labelGroupName1 });
        const childSubject4 = insertSubject({ builder, codeValue: "4", parentId: rootSubject.id, userLabel: labelGroupName2 });
        return { rootSubject, childSubject1, childSubject2, childSubject3, childSubject4 };
      });

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: basicHierarchy }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForLabelGroupingNode({
                label: labelGroupName1,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject1],
                    children: false,
                  }),
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject3],
                    children: false,
                  }),
                ],
              }),
              NodeValidators.createForLabelGroupingNode({
                label: labelGroupName2,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject2],
                    children: false,
                  }),
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject4],
                    children: false,
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

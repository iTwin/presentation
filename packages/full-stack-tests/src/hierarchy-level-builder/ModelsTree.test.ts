/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { PrimitiveValue } from "@itwin/appui-abstract";
import { InstanceKey, NodeKey, Ruleset } from "@itwin/presentation-common";
import { isPresentationTreeNodeItem, PresentationTreeDataProvider, PresentationTreeNodeItem } from "@itwin/presentation-components";
import { ModelsTreeQueryBuilder, TreeNode, TreeNodesProvider } from "@itwin/presentation-hierarchy-builder";
import { initialize, terminate } from "../IntegrationTests";
import { IModelConnection, SnapshotConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { assert, OrderedId64Iterable } from "@itwin/core-bentley";
import { DelayLoadedTreeNodeItem } from "@itwin/components-react";

describe("Models tree", async () => {
  before(async () => {
    await initialize();
  });

  after(async () => {
    await terminate();
  });

  it("produces the same hierarchy as native impl", async function () {
    const imodelPath = process.env.TEST_IMODEL_PATH;
    if (!imodelPath) {
      this.skip();
    }

    const imodel = await SnapshotConnection.openFile(imodelPath);
    const nativeProvider = createNativeProvider(imodel);
    const statelessProvider = createStatelessProvider(imodel);
    let nodesCreated = 0;

    function compareNodes({ nativeNode, statelessNode, ...props }: CompareNodesProps) {
      function createFailureMsg(what: string, compare?: { expected: any; actual: any }) {
        const msg = `Nodes don't match at ${createNativeAncestorsPath(props.nativeAncestors)}. ${what} are different.`;
        return compare ? `${msg} Expected: ${JSON.stringify(compare.expected)}. Actual: ${JSON.stringify(compare.actual)}` : msg;
      }
      expect((nativeNode.label.value as PrimitiveValue).displayValue).to.eq(statelessNode.label, createFailureMsg("Labels"));
      expect(!!nativeNode.hasChildren).to.eq(!!statelessNode.children, createFailureMsg("Children flag"));
      if (NodeKey.isClassGroupingNodeKey(nativeNode.key)) {
        expect(statelessNode.key.type === "class-grouping", createFailureMsg("Key types"));
        expect(nativeNode.key.className).to.eq((statelessNode.key as any).class.name, createFailureMsg("Key class names"));
      } else if (NodeKey.isInstancesNodeKey(nativeNode.key)) {
        expect(statelessNode.key.type === "instances", createFailureMsg("Key types"));
        expect([...nativeNode.key.instanceKeys].sort(compareInstanceKeys)).to.deep.eq(
          [...(statelessNode.key as any).instanceKeys].sort(compareInstanceKeys),
          "Instance keys",
        );
      }
    }
    async function compareHierarchies(props: CompareHierarchiesProps) {
      let nativeChildren: DelayLoadedTreeNodeItem[];
      try {
        nativeChildren = await nativeProvider.getNodes(props.nativeParent);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`Error creating children using native provider: ${e}. At: ${createNativeAncestorsPath(props.nativeAncestors)}`);
        throw e;
      }

      let statelessChildren: TreeNode[];
      try {
        statelessChildren = await statelessProvider.getNodes(props.statelessParent);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`Error creating children using stateless provider: ${e}. At: ${createNativeAncestorsPath(props.nativeAncestors)}`);
        throw e;
      }

      expect(nativeChildren.length).to.eq(statelessChildren.length, `Child nodes count don't match at ${createNativeAncestorsPath(props.nativeAncestors)}`);
      nodesCreated += nativeChildren.length;

      await Promise.all(
        nativeChildren.map(async (nc, i) => {
          assert(isPresentationTreeNodeItem(nc));
          const sc = statelessChildren[i];
          compareNodes({ nativeNode: nc, nativeAncestors: props.nativeAncestors, statelessNode: sc, statelessAncestors: props.statelessAncestors });
          if (nc.hasChildren) {
            await compareHierarchies({
              nativeParent: nc,
              nativeAncestors: [...props.nativeAncestors, nc],
              statelessParent: sc,
              statelessAncestors: [...props.statelessAncestors, sc],
            });
          }
        }),
      );
    }
    await compareHierarchies({ nativeParent: undefined, nativeAncestors: [], statelessParent: undefined, statelessAncestors: [] });
    // eslint-disable-next-line no-console
    console.log(`Total nodes created: ${nodesCreated}`);
  });
});

interface CompareHierarchiesProps {
  nativeParent: PresentationTreeNodeItem | undefined;
  nativeAncestors: PresentationTreeNodeItem[];
  statelessParent: TreeNode | undefined;
  statelessAncestors: TreeNode[];
}
interface CompareNodesProps {
  nativeNode: PresentationTreeNodeItem;
  nativeAncestors: PresentationTreeNodeItem[];
  statelessNode: TreeNode;
  statelessAncestors: TreeNode[];
}

function createNativeAncestorsPath(ancestors: PresentationTreeNodeItem[]) {
  return `[${ancestors.map((a) => (a.label.value as PrimitiveValue).displayValue ?? "").join(", ")}]`;
}

function createNativeProvider(imodel: IModelConnection) {
  return new PresentationTreeDataProvider({
    imodel,
    ruleset: MODELS_TREE_RULESET,
    pagingSize: 1000,
    hierarchyLevelSizeLimit: 1000,
  });
}

function createStatelessProvider(imodel: IModelConnection) {
  const schemas = new SchemaContext();
  schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
  return new TreeNodesProvider({
    schemas,
    queryBuilder: new ModelsTreeQueryBuilder(schemas),
    queryExecutor: imodel,
  });
}

const MODELS_TREE_RULESET: Ruleset = {
  id: "tree-widget-react/ModelsTree",
  requiredSchemas: [
    {
      name: "BisCore",
    },
  ],
  rules: [
    {
      ruleType: "RootNodes",
      autoExpand: true,
      specifications: [
        {
          specType: "InstanceNodesOfSpecificClasses",
          classes: [
            {
              schemaName: "BisCore",
              classNames: ["Subject"],
            },
          ],
          instanceFilter: `this.Parent = NULL`,
          groupByClass: false,
          groupByLabel: false,
        },
      ],
      customizationRules: [
        {
          ruleType: "ExtendedData",
          items: {
            isSubject: "true",
          },
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("Subject", "BisCore")`,
      specifications: [
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "SubjectOwnsSubjects",
              },
              direction: "Forward",
              targetClass: {
                schemaName: "BisCore",
                className: "Subject",
              },
            },
          ],
          instanceFilter: `json_extract(this.JsonProperties, "$.Subject.Job.Bridge") <> NULL OR ifnull(json_extract(this.JsonProperties, "$.Subject.Model.Type"), "") = "Hierarchy"`,
          hideNodesInHierarchy: true,
          groupByClass: false,
          groupByLabel: false,
        },
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "SubjectOwnsSubjects",
              },
              direction: "Forward",
              targetClass: {
                schemaName: "BisCore",
                className: "Subject",
              },
            },
          ],
          instanceFilter: `json_extract(this.JsonProperties, "$.Subject.Job.Bridge") = NULL AND ifnull(json_extract(this.JsonProperties, "$.Subject.Model.Type"), "") <> "Hierarchy"`,
          hideIfNoChildren: true,
          groupByClass: false,
          groupByLabel: false,
        },
      ],
      customizationRules: [
        {
          ruleType: "ExtendedData",
          items: {
            isSubject: "true",
          },
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("Subject", "BisCore")`,
      specifications: [
        {
          specType: "InstanceNodesOfSpecificClasses",
          classes: {
            schemaName: "BisCore",
            classNames: ["GeometricModel3d"],
            arePolymorphic: true,
          },
          relatedInstances: [
            {
              relationshipPath: {
                relationship: {
                  schemaName: "BisCore",
                  className: "ModelModelsElement",
                },
                direction: "Forward",
                targetClass: {
                  schemaName: "BisCore",
                  className: "InformationPartitionElement",
                },
              },
              alias: "partition",
              isRequired: true,
            },
          ],
          instanceFilter: `(parent.ECInstanceId = partition.Parent.Id OR json_extract(parent.JsonProperties, "$.Subject.Model.TargetPartition") = printf("0x%x", partition.ECInstanceId)) AND NOT this.IsPrivate AND json_extract(partition.JsonProperties, "$.PhysicalPartition.Model.Content") = NULL AND json_extract(partition.JsonProperties, "$.GraphicalPartition3d.Model.Content") = NULL AND this.HasRelatedInstance("BisCore:ModelContainsElements", "Forward", "BisCore:GeometricElement3d")`,
          hasChildren: "Always",
          hideIfNoChildren: true,
          groupByClass: false,
          groupByLabel: false,
        },
        {
          specType: "InstanceNodesOfSpecificClasses",
          classes: {
            schemaName: "BisCore",
            classNames: ["GeometricModel3d"],
            arePolymorphic: true,
          },
          relatedInstances: [
            {
              relationshipPath: {
                relationship: {
                  schemaName: "BisCore",
                  className: "ModelModelsElement",
                },
                direction: "Forward",
                targetClass: {
                  schemaName: "BisCore",
                  className: "InformationPartitionElement",
                },
              },
              alias: "partition",
              isRequired: true,
            },
          ],
          instanceFilter: `(parent.ECInstanceId = partition.Parent.Id OR json_extract(parent.JsonProperties, "$.Subject.Model.TargetPartition") = printf("0x%x", partition.ECInstanceId)) AND NOT this.IsPrivate AND (json_extract(partition.JsonProperties, "$.PhysicalPartition.Model.Content") <> NULL OR json_extract(partition.JsonProperties, "$.GraphicalPartition3d.Model.Content") <> NULL) AND this.HasRelatedInstance("BisCore:ModelContainsElements", "Forward", "BisCore:GeometricElement3d")`,
          hasChildren: "Always",
          hideNodesInHierarchy: true,
          groupByClass: false,
          groupByLabel: false,
        },
      ],
      customizationRules: [
        {
          ruleType: "ExtendedData",
          items: {
            isModel: "true",
          },
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("ISubModeledElement", "BisCore")`,
      specifications: [
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "ModelModelsElement",
              },
              direction: "Backward",
            },
          ],
          instanceFilter: `NOT this.IsPrivate AND this.HasRelatedInstance("BisCore:ModelContainsElements", "Forward", "BisCore:GeometricElement3d")`,
          hideNodesInHierarchy: true,
          groupByClass: false,
          groupByLabel: false,
        },
      ],
      customizationRules: [
        {
          ruleType: "ExtendedData",
          items: {
            isModel: "true",
          },
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("GeometricModel3d", "BisCore")`,
      specifications: [
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            [
              {
                relationship: {
                  schemaName: "BisCore",
                  className: "ModelContainsElements",
                },
                direction: "Forward",
                targetClass: { schemaName: "BisCore", className: "GeometricElement3d" },
              },
              {
                relationship: {
                  schemaName: "BisCore",
                  className: "GeometricElement3dIsInCategory",
                },
                direction: "Forward",
              },
            ],
          ],
          instanceFilter: `NOT this.IsPrivate`,
          suppressSimilarAncestorsCheck: true,
          hideIfNoChildren: true,
          groupByClass: false,
          groupByLabel: false,
        },
      ],
      customizationRules: [
        {
          ruleType: "ExtendedData",
          items: {
            isCategory: "true",
            modelId: "ParentNode.InstanceId",
          },
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("SpatialCategory", "BisCore")`,
      specifications: [
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "GeometricElement3dIsInCategory",
              },
              direction: "Backward",
              targetClass: { schemaName: "BisCore", className: "GeometricElement3d" },
            },
          ],
          instanceFilter: `this.Model.Id = parent.parent.ECInstanceId ANDALSO this.Parent = NULL`,
          groupByClass: true,
          groupByLabel: false,
        },
      ],
      customizationRules: [
        {
          ruleType: "ExtendedData",
          items: {
            modelId: "this.Model.Id",
            categoryId: "this.Category.Id",
          },
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("GeometricElement3d", "BisCore")`,
      specifications: [
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "ElementOwnsChildElements",
              },
              direction: "Forward",
              targetClass: { schemaName: "BisCore", className: "GeometricElement3d" },
            },
          ],
          groupByClass: true,
          groupByLabel: false,
        },
      ],
      customizationRules: [
        {
          ruleType: "ExtendedData",
          items: {
            modelId: "this.Model.Id",
            categoryId: "this.Category.Id",
          },
        },
      ],
    },
    {
      ruleType: "Grouping",
      class: {
        schemaName: "BisCore",
        className: "Subject",
      },
      groups: [
        {
          specType: "SameLabelInstance",
          applicationStage: "PostProcess",
        },
      ],
    },
    {
      ruleType: "Grouping",
      class: {
        schemaName: "BisCore",
        className: "SpatialCategory",
      },
      groups: [
        {
          specType: "SameLabelInstance",
          applicationStage: "PostProcess",
        },
      ],
    },
    {
      ruleType: "ImageIdOverride",
      condition: `ThisNode.IsInstanceNode ANDALSO ThisNode.IsOfClass("Subject", "BisCore")`,
      imageIdExpression: `IIF(this.Parent.Id = NULL, "icon-imodel-hollow-2", "icon-folder")`,
    },
    {
      ruleType: "ImageIdOverride",
      condition: `ThisNode.IsInstanceNode ANDALSO ThisNode.IsOfClass("Model", "BisCore")`,
      imageIdExpression: `"icon-model"`,
    },
    {
      ruleType: "ImageIdOverride",
      condition: `ThisNode.IsInstanceNode ANDALSO ThisNode.IsOfClass("Category", "BisCore")`,
      imageIdExpression: `"icon-layers"`,
    },
    {
      ruleType: "ImageIdOverride",
      condition: `ThisNode.IsInstanceNode ANDALSO ThisNode.IsOfClass("Element", "BisCore")`,
      imageIdExpression: `"icon-item"`,
    },
    {
      ruleType: "ImageIdOverride",
      condition: `ThisNode.IsClassGroupingNode`,
      imageIdExpression: `"icon-ec-class"`,
    },
    {
      ruleType: "Content",
      condition: `ContentDisplayType = "AssemblyElementsRequest"`,
      specifications: [
        {
          specType: "SelectedNodeInstances",
        },
        {
          specType: "ContentRelatedInstances",
          relationshipPaths: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "ElementOwnsChildElements",
              },
              direction: "Forward",
              count: "*",
            },
          ],
        },
      ],
    },
  ],
};

function compareInstanceKeys(lhs: InstanceKey, rhs: InstanceKey) {
  const classNameCmp = lhs.className.localeCompare(rhs.className);
  if (classNameCmp !== 0) {
    return classNameCmp;
  }
  return OrderedId64Iterable.compare(lhs.id, rhs.id);
}

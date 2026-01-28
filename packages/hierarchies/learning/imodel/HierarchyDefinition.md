# iModel hierarchy definition

A hierarchy definition is one of the core concepts in this package and describes the iModel-based hierarchy by defining what child nodes to return for a given parent node.

In this package that is achieved through the `HierarchyDefinition` interface, which has one required method - `defineHierarchyLevel`. The method's responsibility is to create a `HierarchyLevelDefinition` for a given parent node. A `HierarchyLevelDefinition` is actually just a set of `HierarchyNodesDefinition` objects, which either describe a single generic node, or an ECSQL query that returns a number of ECInstance nodes. When `HierarchyLevelDefinition` consists of more than 1 `HierarchyNodesDefinition`, the hierarchy level is combined from multiple sets of nodes. See [defining a hierarchy](#defining-a-hierarchy) section for more details.

In case of ECSQL queries for creating the hierarchy level, the definition may want to select some extra information and assign it to the nodes. For that purpose, there's an optional `HierarchyDefinition.parseNode` method, which lets the definition parse the query results and handle those extra columns. See [custom parsing](#custom-parsing) section for more details.

The library also allows hierarchy definitions to step into nodes processing chain through the optional `preProcessNode` and `postProcessNode` methods. These methods are called before and after the node is processed by a [hierarchy provider](./HierarchyProvider.md) respectively and allow hiding and customizing nodes. See [custom pre-processing](#custom-pre-processing) and [custom post-processing](#custom-post-processing) sections for more details.

Finally, in iTwin.js, the most common way to create hierarchies is based on EC data (schemas, classes, relationships) in iModels. To make consumers' life easier, the package provides an utility called `createPredicateBasedHierarchyDefinition`, which lets consumers define hierarchy levels based on parent node key's predicate. See [predicate-based hierarchy definition](#predicate-based-hierarchy-definition) section for more details.

## Defining a hierarchy

In its most simple form, a hierarchy definition may just have one `defineHierarchyLevel` function that defines a child hierarchy level for a given parent node:

<!-- [[include: [Presentation.Hierarchies.HierarchyDefinitions.Imports, Presentation.Hierarchies.HierarchyDefinitions.Simple], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, createPredicateBasedHierarchyDefinition, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";

const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel({ parentNode }) {
    // For root nodes, simply return one generic node
    if (!parentNode) {
      return [
        {
          node: {
            key: "physical-elements",
            label: "Physical elements",
          },
        },
      ];
    }
    // For the root node, return a query that selects all physical elements
    if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "physical-elements") {
      const queryClauseFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
      return [
        {
          fullClassName: "BisCore.PhysicalElement",
          query: {
            ecsql: `
              SELECT ${await queryClauseFactory.createSelectClause({
                ecClassId: { selector: "x.ECClassId" },
                ecInstanceId: { selector: "x.ECInstanceId" },
                nodeLabel: { selector: "x.UserLabel" },
              })}
              FROM BisCore.PhysicalElement x
            `,
          },
        },
      ];
    }
    // Otherwise, return an empty array to indicate that there are no children
    return [];
  },
};
```

<!-- END EXTRACTION -->

## Custom parsing

By default, it's expected that the nodes' SELECT clause is created using `NodesQueryClauseFactory.createSelectClause` and then specifying `parseNode` callback in the hierarchy definition is not necessary, as the default parser knows how parse ECSQL rows.

However, some hierarchy definitions may choose to write SELECT clause manually and then they need to provide a custom `parseNode` callback to parse the ECSQL result row into a `SourceInstanceHierarchyNode` object. Example:

<!-- [[include: [Presentation.Hierarchies.HierarchyDefinitions.Imports, Presentation.Hierarchies.HierarchyDefinitions.ParseNode], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, createPredicateBasedHierarchyDefinition, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";

const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel({ parentNode }) {
    // For root nodes, return all physical elements
    if (!parentNode) {
      return [
        {
          fullClassName: "BisCore.PhysicalElement",
          query: {
            // Define the query without using `NodesQueryClauseFactory` - we'll parse the results manually. But to create
            // an instances node we need at least a class name, instance id, and a label.
            ecsql: `
              SELECT
                ec_classname(ECClassId, 's.c') ClassName,
                ECInstanceId Id,
                UserLabel Label
              FROM
                BisCore.PhysicalElement
            `,
          },
        },
      ];
    }
    // Otherwise, return an empty array to indicate that there are no children
    return [];
  },
  parseNode({ row }) {
    // Parse the row into an instance node
    return {
      key: {
        type: "instances",
        instanceKeys: [{ className: row.ClassName, id: row.Id }],
      },
      label: row.Label,
    };
  },
};
```

<!-- END EXTRACTION -->

## Custom pre-processing

In some situations, the hierarchy definition may want to modify or remove some nodes from the hierarchy before the processing (hiding, grouping, sorting) is performed. This can be achieved by providing a custom `preProcessNode` callback.

For example, the following code snippet shows how to use the `preProcessNode` callback to modify and remove nodes based on external service response:

<!-- [[include: [Presentation.Hierarchies.HierarchyDefinitions.Imports, Presentation.Hierarchies.HierarchyDefinitions.PreProcessNode], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, createPredicateBasedHierarchyDefinition, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";

const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel({ parentNode }) {
    // For root nodes, return all physical elements
    if (!parentNode) {
      const queryClauseFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
      return [
        {
          fullClassName: "BisCore.PhysicalElement",
          query: {
            ecsql: `
              SELECT ${await queryClauseFactory.createSelectClause({
                ecClassId: { selector: "x.ECClassId" },
                ecInstanceId: { selector: "x.ECInstanceId" },
                nodeLabel: { selector: "x.UserLabel" },
              })}
              FROM BisCore.PhysicalElement x
            `,
          },
        },
      ];
    }
    // Otherwise, return an empty array to indicate that there are no children
    return [];
  },
  async preProcessNode({ node }) {
    // The pre-processor queries an external service to get an external ID for the node
    // and either adds it to the node's extended data or omits the node from the hierarchy
    // if the external ID is not found.
    const externalId = await externalService.getExternalId(node);
    if (externalId) {
      return { ...node, extendedData: { ...node.extendedData, externalId } };
    }
    return undefined;
  },
};
```

<!-- END EXTRACTION -->

## Custom post-processing

The post-processing step allows to modify the nodes in their final form - fully customized, grouped and with children determined. Also, since the step happens after grouping, it gives a chance to apply modifications to grouping nodes.

For example, the following code snippet shows how to use the `postProcessNode` callback to assign an icon property to a grouping node:

<!-- [[include: [Presentation.Hierarchies.HierarchyDefinitions.Imports, Presentation.Hierarchies.HierarchyDefinitions.PostProcessNode], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, createPredicateBasedHierarchyDefinition, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";

const hierarchyDefinition: HierarchyDefinition = {
  async defineHierarchyLevel({ parentNode }) {
    // For root nodes, return all physical elements grouped by class
    if (!parentNode) {
      const queryClauseFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
      return [
        {
          fullClassName: "BisCore.PhysicalElement",
          query: {
            ecsql: `
              SELECT ${await queryClauseFactory.createSelectClause({
                ecClassId: { selector: "x.ECClassId" },
                ecInstanceId: { selector: "x.ECInstanceId" },
                nodeLabel: { selector: "x.UserLabel" },
                grouping: {
                  byClass: true,
                },
                extendedData: {
                  // assign an iconId to all instance nodes
                  iconId: "icon-physical-element",
                },
              })}
              FROM BisCore.PhysicalElement x
            `,
          },
        },
      ];
    }
    // Otherwise, return an empty array to indicate that there are no children
    return [];
  },
  async postProcessNode({ node }) {
    // All instance nodes will have an iconId assigned in the query, but grouping nodes won't - do it here
    if (HierarchyNode.isClassGroupingNode(node)) {
      return { ...node, extendedData: { ...node.extendedData, iconId: "icon-class-group" } };
    }
    return node;
  },
};
```

<!-- END EXTRACTION -->

## Predicate-based hierarchy definition

The library delivers a `createPredicateBasedHierarchyDefinition` function which allows defining hierarchy in a declarative way - by defining hierarchy level definitions based on a parent node key's predicate.

For example, the following code snippet shows how to define a hierarchy, similar to the one defined at the top of this page, using the predicate-based hierarchy definition:

<!-- [[include: [Presentation.Hierarchies.HierarchyDefinitions.Imports, Presentation.Hierarchies.HierarchyDefinitions.PredicateBasedHierarchyDefinition], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createNodesQueryClauseFactory, createPredicateBasedHierarchyDefinition, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";

const queryClauseFactory = createNodesQueryClauseFactory({
  imodelAccess,
  instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
});
const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
  classHierarchyInspector: imodelAccess,
  hierarchy: {
    // For root nodes, simply return one generic node
    rootNodes: async () => [
      {
        node: {
          key: "physical-elements",
          label: "Physical elements",
        },
      },
    ],
    childNodes: [
      {
        // For the root node, return a query that selects all physical elements
        parentGenericNodePredicate: async (parentKey) => parentKey.id === "physical-elements",
        definitions: async () => [
          {
            fullClassName: "BisCore.PhysicalElement",
            query: {
              ecsql: `
              SELECT ${await queryClauseFactory.createSelectClause({
                ecClassId: { selector: "x.ECClassId" },
                ecInstanceId: { selector: "x.ECInstanceId" },
                nodeLabel: { selector: "x.UserLabel" },
              })}
              FROM BisCore.PhysicalElement x
            `,
            },
          },
        ],
      },
    ],
  },
});
```

<!-- END EXTRACTION -->

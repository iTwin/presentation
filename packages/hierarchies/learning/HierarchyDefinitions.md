# Hierarchy definitions

A hierarchy definition is one of the core concepts in this library and is responsible for defining the structure of a hierarchy.

In its most simple form, a hierarchy definition may only have one `defineHierarchyLevel` function that defines a child hierarchy level for a given parent node:

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

However, it also has 3 optional functions that may be implemented to provide additional functionality:

- `parseNode` takes a single ECSQL result row and returns a `SourceInstanceHierarchyNode` object. The [custom parsing section](#custom-parsing) provides more details on how to use this function.
- `preProcessNode` takes a single node before hiding/grouping/sorting is performed and gets a chance to modify it or return `undefined` to remove it from hierarchy altogether. The [custom pre-processing section](#custom-pre-processing) provides more details on how to use this function.
- `postProcessNode` takes a single node after hiding/grouping/sorting is performed and gets a chance to modify it. The [custom post-processing section](#custom-post-processing) provides more details on how to use this function.

More details about the hierarchy processing steps and their order are provided in the [hierarchy processing page](./HierarchyProcessing.md).

While consumers are free to create their own `HierarchyDefinition` implementations, the library delivers an implementation of a class-based hierarchy definition that allows for a more declarative approach to defining hierarchies. The [Class-based hierarchy definition section](#class-based-hierarchy-definition) provides more details on how to use this implementation.

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
  parseNode(row) {
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
  async preProcessNode(node) {
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
  async postProcessNode(node) {
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

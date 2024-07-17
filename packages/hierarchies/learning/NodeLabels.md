# Hierarchy node labels

A label could probably be considered the most important attribute of a hierarchy node. It's the first thing a user sees when they look at hierarchies, and it's the primary way they identify the node. Therefore, it's crucial to have a good label for each node, ideally unique within the hierarchy. The library provides full control over how the node's label is created and provides a few APIs to help in creating it.

The node labels are decided by [hierarchy definition](./HierarchyDefinitions.md), which defines nodes as either `CustomHierarchyNodeDefinition` or `InstanceNodesQueryDefinition` objects. Labels are assigned differently in the two cases, and the options are described below.

## Assigning custom node labels

In case of custom nodes, the hierarchy definition returns the node object directly, so it has full control over what label is used for the node. Note that the label may be either a `string` or a `ConcatenatedValue` - in case of the latter, it may consist of separately formatted pieces which are concatenated together during hierarchy processing. See [formatting node labels](./Formatting.md#formatting-node-labels) section for more details and an example.

## Assigning instance node labels

In case of instance nodes, the hierarchy definition returns a query object which is used to fetch the nodes. Generally, the SELECT clause of the query defines how to select the label from iModel, and, when the query is executed, the parser reads and assigns the label to the node. A custom parser may decide to use other means to get the label - see the [custom parsing](./HierarchyDefinitions.md#custom-parsing) section for more details. However, usually, consumers will want to use `NodesQueryClauseFactory.createSelectClause` to create the SELECT clause for the query, as it works with the default parser.

The `NodesQueryClauseFactory.createSelectClause` function has a required `nodeLabel` attribute whose type is either a string or an ECSQL selector object.

- The string option simply uses the same given string for all nodes returned by the query. This is not a recommended approach, unless the hierarchy definition author is sure the query returns only a single node.

- The ECSQL selector object generally looks like this: `{ selector: "class_alias.PropertyName" }`. This results in an ECSQL query like `SELECT class_alias.PropertyName FROM ...`, which suggests the selector has to be a valid ECSQL clause to add to a SELECT clause.

  While consumers are free to specify any ECSQL selector for their nodes, the library provides a few helper functions to make it easier to create the selector. The functions are delivered with the `@itwin/presentation-shared` package and are documented in its [README](https://github.com/iTwin/presentation/blob/master/packages/shared/README.md#instance-labels). The most commonly used one is the [BIS instance label select clause factory](https://github.com/iTwin/presentation/blob/master/packages/shared/README.md#createbisinstancelabelselectclausefactory), which knows how to create unique labels for [BIS](https://www.itwinjs.org/bis/guide/intro/overview/)-based instances. A quick example of it usage for hierarchies:

  <!-- [[include: [Presentation.Hierarchies.NodeLabels.Imports, Presentation.Hierarchies.NodeLabels.BisInstanceLabelSelectClauseFactory], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createHierarchyProvider, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
  import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

  const hierarchyDefinition: HierarchyDefinition = {
    async defineHierarchyLevel({ parentNode }) {
      // For root nodes, return a query that selects all physical elements
      if (!parentNode) {
        const queryClauseFactory = createNodesQueryClauseFactory({ imodelAccess });
        const labelSelectorsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
        return [
          {
            fullClassName: "BisCore.PhysicalElement",
            query: {
              ecsql: `
                SELECT ${await queryClauseFactory.createSelectClause({
                  ecClassId: { selector: "x.ECClassId" },
                  ecInstanceId: { selector: "x.ECInstanceId" },
                  nodeLabel: {
                    // Use BIS instance label select clause factory to create the label selector
                    selector: await labelSelectorsFactory.createSelectClause({
                      classAlias: "x",
                      className: "BisCore.PhysicalElement", // This is optional, but helps create a more optimal selector
                    }),
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
  };
  // The iModel contains 3 `Generic.PhysicalObject` elements with the following attributes:
  //
  // | Element Id | User Label | Code Value |
  // |------------|------------|------------|
  // | 0x14       | <NULL>     | A          |
  // | 0x15       | B          | <NULL>     |
  // | 0x16       | <NULL>     | <NULL>     |
  //
  expect(await collectHierarchy(createHierarchyProvider({ imodelAccess, hierarchyDefinition }))).to.deep.eq([
    {
      label: "A",
    },
    {
      label: "B [0-L]",
    },
    {
      label: "Physical Object [0-M]",
    },
  ]);
  ```

  <!-- END EXTRACTION -->

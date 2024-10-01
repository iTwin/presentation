# iModel hierarchy node labels

A label could probably be considered the most important attribute of a hierarchy node. It's the first thing a user sees when they look at hierarchies, and it's the primary way they identify the node. Therefore, it's crucial to have a good label for each node, ideally unique within the hierarchy. The library provides full control over how the node's label is created and provides a few APIs to help in creating it.

The node labels are decided by [hierarchy definition](./HierarchyDefinition.md), which defines nodes as either `GenericHierarchyNodeDefinition` or `InstanceNodesQueryDefinition` objects. Labels are assigned differently in the two cases, and the options are described below.

## Generic node labels

In case of generic nodes, the hierarchy definition returns the node object directly, so it has full control over what label is used for the node. The provider returns a node in the form of `SourceGenericHierarchyNode`, which has a `label` property of type `string | ConcatenatedValue`. The `ConcatenatedValue` type allows for a label to consist of multiple parts of different types, which are formatted individually and concatenated together during hierarchy processing:

<!-- [[include: [Presentation.Hierarchies.NodeLabels.Imports, Presentation.Hierarchies.NodeLabels.GenericHierarchyNodeDefinitionLabelFormattingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createIModelHierarchyProvider, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, ECSql } from "@itwin/presentation-shared";

const hierarchyProvider = createIModelHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        return [
          // The hierarchy definition returns a single node with a ConcatenatedValue-based label
          {
            node: {
              key: "root",
              label: [
                "Example | ",
                {
                  type: "Integer",
                  value: 123,
                },
                {
                  type: "String",
                  value: " | ",
                },
                {
                  type: "Point2d",
                  value: { x: 1, y: 2 },
                },
              ],
            },
          },
        ];
      }
      return [];
    },
  },
});

// Returns the node with formatted and concatenated label:
expect(await collectHierarchy(hierarchyProvider)).to.containSubset([{ label: "Example | 123 | (1.00, 2.00)" }]);
```

<!-- END EXTRACTION -->

## ECInstances-based node labels

In case of instance nodes, the hierarchy definition returns a query object which is used to fetch the nodes. Generally, the SELECT clause of the query defines how to select the label from iModel, and, when the query is executed, the parser reads and assigns the label to the node. A custom parser may decide to use other means to get the label - see the [custom parsing](./HierarchyDefinition.md#custom-parsing) section for more details. However, usually, consumers will want to use `NodesQueryClauseFactory.createSelectClause` to create the SELECT clause for the query, as it works with the default parser.

The `NodesQueryClauseFactory.createSelectClause` function has a required `nodeLabel` attribute whose type is either a string or an ECSQL selector object.

- The string option simply uses the same given string for all nodes returned by the query. This is not a recommended approach, unless the hierarchy definition author is sure the query returns only a single node.

- The ECSQL selector object generally looks like this: `{ selector: "class_alias.PropertyName" }`. This results in an ECSQL query like `SELECT class_alias.PropertyName FROM ...`, which suggests the selector has to be a valid ECSQL clause to add to a SELECT clause.

  While consumers are free to specify any ECSQL selector for their nodes, the library provides a few helper functions to make it easier to create the selector. The functions are delivered with the `@itwin/presentation-shared` package and are documented in its [README](https://github.com/iTwin/presentation/blob/master/packages/shared/README.md#instance-labels). The most commonly used one is the [BIS instance label select clause factory](https://github.com/iTwin/presentation/blob/master/packages/shared/README.md#createbisinstancelabelselectclausefactory), which knows how to create unique labels for [BIS](https://www.itwinjs.org/bis/guide/intro/overview/)-based instances. A quick example of its usage for hierarchies:

  <!-- [[include: [Presentation.Hierarchies.NodeLabels.Imports, Presentation.Hierarchies.NodeLabels.BisInstanceLabelSelectClauseFactory], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createIModelHierarchyProvider, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
  import { createBisInstanceLabelSelectClauseFactory, ECSql } from "@itwin/presentation-shared";

  const hierarchyDefinition: HierarchyDefinition = {
    async defineHierarchyLevel({ parentNode }) {
      // For root nodes, return a query that selects all physical elements
      if (!parentNode) {
        const labelSelectorsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
        const queryClauseFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: labelSelectorsFactory,
        });
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
  expect(await collectHierarchy(createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition }))).to.containSubset([
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

  In case a custom label selector is needed, the recommended way to create it using the the `ECSql.createConcatenatedValueJsonSelector` helper function. The below example shows how to create a selector that concatenates multiple pieces into a single label:

  <!-- [[include: [Presentation.Hierarchies.NodeLabels.Imports, Presentation.Hierarchies.NodeLabels.CustomLabelSelector], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createIModelHierarchyProvider, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
  import { createBisInstanceLabelSelectClauseFactory, ECSql } from "@itwin/presentation-shared";

  nodeLabel: {
    selector: ECSql.createConcatenatedValueJsonSelector([
      // Create a selector for `CodeValue` property value
      await ECSql.createPrimitivePropertyValueSelectorProps({
        schemaProvider: imodelAccess,
        propertyClassName: "BisCore.PhysicalElement",
        propertyClassAlias: "x",
        propertyName: "CodeValue",
      }),
      // Include a static string value
      { type: "String", value: " [" },
      // Create a selector for `ECInstanceId` property value in hex format
      { selector: `printf('0x%x', x.ECInstanceId)` },
      // Include a static string value
      { type: "String", value: "]" },
    ]),
  },
  ```

  <!-- END EXTRACTION -->

  Note that the above example doesn't cover all possible cases, for example when the `CodeValue` property is `NULL`.

## Grouping node labels

By a request of `HierarchyDefinition`, the hierarchy provider groups instance nodes by nesting them under a grouping node. In that case, label is formatted automatically based on the type of grouping:

- In case of class grouping, the label is the class' display label and needs no extra formatting.
- In case of label grouping, the label is taken from grouped nodes whose labels are already formatted.
- In case of property grouping, the label is built using formatted property values. The formatter used by `HierarchyProvider` is applied to each property value separately:

  <!-- [[include: [Presentation.Hierarchies.NodeLabels.Imports, Presentation.Hierarchies.NodeLabels.PropertyGroupsFormattingExample], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createIModelHierarchyProvider, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
  import { createBisInstanceLabelSelectClauseFactory, ECSql } from "@itwin/presentation-shared";

  const hierarchyProvider = createIModelHierarchyProvider({
    imodelAccess,
    hierarchyDefinition: {
      defineHierarchyLevel: async ({ parentNode }) => {
        if (!parentNode) {
          return [
            // The hierarchy definition returns nodes for `myPhysicalObjectClassName` element type, grouped by `DoubleProperty` property value
            {
              fullClassName: myPhysicalObjectClassName,
              query: {
                ecsql: `
                  SELECT ${await createNodesQueryClauseFactory({
                    imodelAccess,
                    instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                  }).createSelectClause({
                    ecClassId: { selector: "this.ECClassId" },
                    ecInstanceId: { selector: "this.ECInstanceId" },
                    nodeLabel: { selector: "this.UserLabel" },
                    grouping: {
                      byProperties: {
                        propertiesClassName: myPhysicalObjectClassName,
                        propertyGroups: [{ propertyClassAlias: "this", propertyName: "DoubleProperty" }],
                      },
                    },
                  })}
                  FROM ${myPhysicalObjectClassName} this
                `,
              },
            },
          ];
        }
        return [];
      },
    },
  });

  // The iModel has two elements of `myPhysicalObjectClassName` type, whose `DoubleProperty` values
  // are `123.450` and `123.454`. After passing through formatter, they both become equal to `123.45`,
  // so we get one property grouping node for the two nodes:
  expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
    {
      label: "123.45",
      children: [{ label: "Example element 1" }, { label: "Example element 2" }],
    },
  ]);
  ```

  <!-- END EXTRACTION -->

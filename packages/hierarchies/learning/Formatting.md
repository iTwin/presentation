# Formatting

Each node in a hierarchy must have a label that's displayed to the user. The label is generally based on a string and does not need extra formatting, but in certain situations, there may be a need for labels to include data that does need formatting. Examples:

- A date/time value needs to be formatted according to user's locale.
- A point3d or point2d value is a JSON object and needs to be formatted to string.
- A numeric property may need to be rounded to a certain number of decimal places and/or may need a thousands separator. In addition, if the property has a unit, it needs to be formatted according to unit's formatter spec.

To support these uses cases, the package allows passing a formatter to `HierarchyProvider` either through `setFormatter` function or as a `formatter` prop when calling `createHierarchyProvider`.

## Formatters

A formatter is a simple async function that takes a value along with its type and returns a formatted string:

<!-- [[include: [Presentation.Hierarchies.Formatting.BasicFormatterExample.Imports, Presentation.Hierarchies.Formatting.BasicFormatterExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createBisInstanceLabelSelectClauseFactory, createDefaultValueFormatter, IPrimitiveValueFormatter } from "@itwin/presentation-shared";

const defaultFormatter = createDefaultValueFormatter();
const myFormatter: IPrimitiveValueFormatter = async (value) => {
  if (value.type === "Boolean") {
    return value.value ? "yes!" : "no!";
  }
  return defaultFormatter(value);
};
expect(await myFormatter({ type: "Boolean", value: true })).to.eq("yes!");
expect(await myFormatter({ type: "Boolean", value: false })).to.eq("no!");
```

<!-- END EXTRACTION -->

In the above example, the formatter customizes boolean values' formatting and relies on the default formatter for other types. The default formatter is delivered through `@itwin/presentation-shared` package and knows how to format basic primitive types. To support units' formatting, a formatter needs access to ECSchemas and know the user's preferred unit system. `@itwin/presentation-core-interop` delivers one such formatter through the `createValueFormatter` factory function:

<!-- [[include: [Presentation.Hierarchies.Formatting.CoreInteropFormatterExample.Imports, Presentation.Hierarchies.Formatting.CoreInteropFormatterExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createValueFormatter } from "@itwin/presentation-core-interop";

const metricFormatter = createValueFormatter({ schemaContext, unitSystem: "metric" });
const imperialFormatter = createValueFormatter({ schemaContext, unitSystem: "imperial" });

// Define the raw value to be formatted
const value = 1.234;

// Define the KindOfQuantity to use for formatting:
// <KindOfQuantity
//   typeName="FlowRate"
//   displayLabel="Flow Rate"
//   persistenceUnit="u:CUB_M_PER_SEC"
//   relativeError="1e-05"
//   presentationUnits="f:DefaultRealU(4)[u:LITRE_PER_MIN];f:DefaultRealU(4)[u:GALLON_PER_MIN]"
// />
const koqName = `${mySchemaName}.FlowRate`;

// Not passing `koqName` formats the value without units using the default formatter:
expect(await metricFormatter({ type: "Double", value })).to.eq("1.23");

// Metric formatter formats the value in liters per minute:
expect(await metricFormatter({ type: "Double", value, koqName })).to.eq("74040.0 L/min");

// Imperial formatter formats the value in gallons per minute:
expect(await imperialFormatter({ type: "Double", value, koqName })).to.eq("19559.2988 gal/min");
```

<!-- END EXTRACTION -->

## Formatting node labels

Hierarchy nodes originate from one of the following places:

1. A `HierarchyDefinition` returns `ParsedCustomHierarchyNode` through `CustomHierarchyNodeDefinition` objects.
2. A `HierarchyDefinition` returns an `InstanceNodesQueryDefinition`, the query is run and its results are parsed into `ParsedInstanceHierarchyNode` objects.
3. By a request of `HierarchyDefinition`, the `HierarchyProvider` groups instance nodes by nesting them under a grouping node.

In case 1, the node's `label` property type is `string | ConcatenatedValue`. The `ConcatenatedValue` type allows for a label to consist of multiple parts of different types, each of which are formatted separately:

<!-- [[include: [Presentation.Hierarchies.Formatting.NodeLabelFormattingExamples.Imports, Presentation.Hierarchies.Formatting.CustomHierarchyNodeDefinitionLabelFormattingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createIModelHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { ECSql } from "@itwin/presentation-shared";

const hierarchyProvider = createIModelHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        return [
          // The hierarchy definition returns a single node with a ConcatenatedValue-based label
          {
            node: {
              key: "custom node",
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

In case 2, the node's label is described through an ECSQL query, where node's label selector is created using `ECSql.createConcatenatedValueJsonSelector` function. This function creates such an ECSQL clause, which parses into `ConcatenatedValue` object when the query results are read:

<!-- [[include: [Presentation.Hierarchies.Formatting.NodeLabelFormattingExamples.Imports, Presentation.Hierarchies.Formatting.InstanceNodesQueryDefinitionLabelFormattingExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createIModelHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { ECSql } from "@itwin/presentation-shared";

const hierarchyProvider = createIModelHierarchyProvider({
  imodelAccess,
  hierarchyDefinition: {
    defineHierarchyLevel: async ({ parentNode }) => {
      if (!parentNode) {
        return [
          // The hierarchy definition returns `BisCore.SpatialCategory` nodes
          {
            fullClassName: "BisCore.SpatialCategory",
            query: {
              ecsql: `
                SELECT ${await createNodesQueryClauseFactory({
                  imodelAccess,
                  instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                }).createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  // Generally, one of the `IInstanceLabelSelectClauseFactory` implementations, delivered with `@itwin/presentation-shared` package, should be used,
                  // but for demonstration purposes, a custom implementation is used here
                  nodeLabel: {
                    selector: ECSql.createConcatenatedValueJsonSelector([
                      // Create a selector for `CodeValue` property value
                      await ECSql.createPrimitivePropertyValueSelectorProps({
                        schemaProvider: imodelAccess,
                        propertyClassName: "BisCore.SpatialCategory",
                        propertyClassAlias: "this",
                        propertyName: "CodeValue",
                      }),
                      // Include a static string value
                      { type: "String", value: " [" },
                      // Create a selector for `ECInstanceId` property value in hex format
                      { selector: `printf('0x%x', this.ECInstanceId)` },
                      // Include a static string value
                      { type: "String", value: "]" },
                    ]),
                  },
                })}
                FROM BisCore.SpatialCategory this
              `,
            },
          },
        ];
      }
      return [];
    },
  },
});

// All returned nodes have their labels set in format "{CodeValue} [{ECInstanceId}]":
expect(await collectHierarchy(hierarchyProvider)).to.containSubset([{ label: "Example category [0x11]" }]);
```

<!-- END EXTRACTION -->

Finally, in case 3, the grouping node's label is formatted automatically based on the type of grouping:

- In case of class grouping, the label is the class' display label and needs no extra formatting.
- In case of label grouping, the label is taken from grouped nodes whose labels are already formatted.
- In case of property grouping, the label is built using formatted property values. The formatter used by `HierarchyProvider` is applied to each property value separately`.

  <!-- [[include: [Presentation.Hierarchies.Formatting.NodeLabelFormattingExamples.Imports, Presentation.Hierarchies.Formatting.PropertyGroupsFormattingExample], ts]] -->
  <!-- BEGIN EXTRACTION -->

  ```ts
  import { createIModelHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
  import { ECSql } from "@itwin/presentation-shared";

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

# Formatting

Each node in a hierarchy must have a label that's displayed to the user. The label is generally based on a string and does not need extra formatting, but in certain situations, there may be a need for labels to include data that does need formatting. Examples:

- A date/time value needs to be formatted according to user's locale.
- A point3d or point2d value is a JSON object and needs to be formatted to string.
- A numeric property may need to be rounded to a certain number of decimal places and/or may need a thousands separator. In addition, if the property has a unit, it needs to be formatted according to unit's formatter spec.

To support these uses cases, the package allows passing a formatter to `HierarchyProvider` through `setFormatter` function.

## Formatters

A formatter is a simple async function that takes a value along with its type and returns a formatted string:

<!-- [[include: [Presentation.Hierarchies.Formatting.BasicFormatterExample.Imports, Presentation.Hierarchies.Formatting.BasicFormatterExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "@itwin/presentation-shared";

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

## Formatting hierarchy node labels

The `HierarchyProvider` interface has `setFormatter` function and promises to return formatted hierarchy data. It's up to each implementation to make sure that promise is fulfilled. See [iModel hierarchy node labels](./imodel/HierarchyNodeLabels.md) learning page for details on how node labels are formatted in iModel-based hierarchy provider.

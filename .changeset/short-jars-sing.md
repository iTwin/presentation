---
"@itwin/presentation-shared": minor
---

**BREAKING:** Removed the option to specify value + ECProperty identifier when creating a `ConcatenatedValue`.

The change provides two benefits:

1. Access to schema is not required to format `ConcatenatedValue` parts as they already contain all the necessary metadata required for formatting the value. This is a step towards supporting multiple data sources, where schema information might be not available during formatting.
2. Previously, the property type information had to be extracted for every row in the result set, which was inefficient. Now, the type information is extracted only once, when creating an ECSql query.

Full list of changes:

- `ConcatenatedValuePart.isProperty` - removed, as the "property" type was removed from the type union.

- `ECSql.createConcatenatedValueJsonSelector` and `ECSql.createConcatenatedValueStringSelector` don't accept an option to specify value + ECProperty identifier as a selector argument anymore. Instead, the option that specifies value selector + type information should be used. The latter kind of selector can be created using the newly added `ECSql.createPrimitivePropertyValueSelectorProps` function (see below).

- Added `ECSql.createPrimitivePropertyValueSelectorProps` function to help create a selector that specifies a value selector + type information. See README for more details.

- The change allows formatting `ConcatenatedValue` parts without the need to access schema information, so `formatConcatenatedValue` function now doesn't require a `schemaProvider` prop.

Mitigation example:

*Before:*

```ts
const selector: ECSql.createConcatenatedValueJsonSelector([
  { type: "String", value: "[" },
  { propertyClassName: "MySchema.MyClass", propertyClassAlias: "this", propertyName: "PropX" },
  { type: "String", value: "]" },
]);
```

*After:*

```ts
const selector: ECSql.createConcatenatedValueJsonSelector([
  { type: "String", value: "[" },
  await ECSql.createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassName: "MySchema.MyClass", propertyClassAlias: "this", propertyName: "PropX" }),
  { type: "String", value: "]" },
]);
```

---
"@itwin/presentation-hierarchies": major
---

Use type-safe full class names.

The full class names used in this package were defined as `string`, although we always expect them to be in specific format - either `Schema:Class` or `Schema.Class`. In many cases we rely on this format when parsing the name for compare or other purposes, so type safety for the format is highly beneficial. This change makes full class names type-safe(ier) through [TypeScript's template literal types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html), so that we can be sure that they are always in correct format.

## Breaking changes

- `ClassGroupingNodeKey.className` is now of type `EC.FullClassName` instead of `string`.
- `NodesQueryClauseFactory.createSelectClause` prop `grouping.byBaseClasses.fullClassNames` is now of type `EC.FullClassName[]` instead of `string[]`.
- `NodesQueryClauseFactory.createSelectClause` prop `grouping.byProperties.propertiesClassName` is now of type `EC.FullClassName` instead of `string`.
- `HierarchyNodesDefinition.fullClassName` is now of type `EC.FullClassName` instead of `string`.
- `createPredicateBasedHierarchyDefinition` prop `hierarchies.childNodes[number].parentInstancesNodePredicate` now accepts `EC.FullClassName` instead of `string`.
- `NodesQueryClauseFactory.createFilterClauses` prop `contentClass.fullName` is now of type `EC.FullClassName` instead of `string`.
- `PropertyOtherValuesGroupingNodeKey.properties[number].className` is now of type `EC.FullClassName` instead of `string`.
- `PropertyValueGroupingNodeKey.propertyClassName` is now of type `EC.FullClassName` instead of `string`.
- `PropertyValueRangeGroupingNodeKey.propertyClassName` is now of type `EC.FullClassName` instead of `string`.

In many cases migration will be seamless, as long as the input string matches the expected format. In some cases (e.g. when assigning a string variable to one of the affected properties), you may need to use `normalizeFullClassName` from `@itwin/presentation-shared` to ensure the value is of the correct type:

```ts
const myClassName: string = "MySchema.MyClass";

// before
const myClassGroupingNodeKey: ClassGroupingNodeKey = {
  type: "class-grouping",
  className: myClassName,
};

// after
const myClassGroupingNodeKey: ClassGroupingNodeKey = {
  type: "class-grouping",
  // assigning `MySchema.MyClass` directly wouldn't require using `normalizeFullClassName` as the type would be correctly inferred, but if the class name is stored in a variable of type `string`, you need to use `normalizeFullClassName` to ensure it's of the correct type
  className: normalizeFullClassName(myClassName),
};
```

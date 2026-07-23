---
"@itwin/presentation-shared": major
---

Use type-safe full class names.

The full class names used in this package were defined as `string`, although we always expect them to be in specific format - either `Schema:Class` or `Schema.Class`. In many cases we rely on this format when parsing the name for compare or other purposes, so type safety for the format is highly beneficial. This change makes full class names type-safe(ier) through [TypeScript's template literal types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html), so that we can be sure that they are always in correct format.

## Additions

- Added 3 new types to the `EC` namespace:
  - `FullClassNameColonNotation` - matches the format `Schema:Class`,
  - `FullClassNameDotNotation` - matches the format `Schema.Class`,
  - `FullClassName` - union of the above two.

## Non-breaking changes

- Updated `normalizeFullClassName` to return `EC.FullClassNameDotNotation` instead of `string`. The returned value is still assignable to `string`, but it adds type safety for the expected format of the full class name.

## Breaking changes

- Changed `EC.CustomAttribute.className` to be of type `EC.FullClassNameDotNotation` instead of `string`.
- Changed `EC.CustomAttributeSet.get` argument to be of type `EC.FullClassNameDotNotation` instead of `string`.
- Changed `EC.SchemaItem.fullName` to be of type `EC.FullClassNameDotNotation` instead of `string`.
- Changed `createClassBasedInstanceLabelSelectClauseFactory` prop `clauses` to take objects with `{ className: EC.FullClassNameDotNotation }` arguments instead of `{ className: string }`.
- Changed `IInstanceLabelSelectClauseFactory.createSelectClause` prop `className` to be of type `EC.FullClassNameDotNotation` instead of `string`.
- Changed `ECSql.createPrimitivePropertyValueSelectorProps` prop `propertyClassName` to be of type `EC.FullClassNameDotNotation` instead of `string`.
- Changed `ECSql.createRelationshipPathJoinClause` prop `path` to take class names (`relationshipName`, `sourceClassName` and `targetClassName`) of type `EC.FullClassNameDotNotation` instead of `string`.
- Changed `ECClassHierarchyInspector.classDerivesFrom` arguments to be of type `EC.FullClassNameDotNotation` instead of `string`.
- Changed the second argument of `getClass` to be of type `EC.FullClassNameDotNotation` instead of `string`.
- Changed `InstanceKey.className` to be of type `EC.FullClassNameDotNotation` instead of `string`. The value is now always in dot notation, so consumers no longer need to call `normalizeFullClassName` on it.
- Changed `RelationshipPathStep` class-name properties (`sourceClassName`, `targetClassName` and `relationshipName`) to be of type `EC.FullClassNameDotNotation` instead of `string`.
- Changed `NavigationValueDescriptor.targetClassName` to be of type `EC.FullClassNameDotNotation` instead of `string`.
- Removed `compareFullClassNames`. With `EC.FullClassNameDotNotation` being used across the package, this function is no longer needed. Use `===` operator to compare full class names instead.

In many cases migration will be seamless, as long as the input string matches the expected format. In some cases (e.g. when assigning a string variable to one of the affected properties), you may need to use `normalizeFullClassName` to ensure the value is of the correct type:

```ts
const myClassName: string = "MySchema.MyClass";

// before
const myClass = getClass(schemaProvider, myClassName);

// after
const myClass = getClass(schemaProvider, normalizeFullClassName(myClassName));
```

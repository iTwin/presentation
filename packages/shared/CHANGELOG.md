# @itwin/presentation-shared

## 1.1.0

### Minor Changes

- [#740](https://github.com/iTwin/presentation/pull/740): Added an utility `julianToDateTime` function to convert julian date format to javascript's Date object.
- [#740](https://github.com/iTwin/presentation/pull/740): Define `type` and `exports` attributes in `package.json`.

  The change moves this package a step closer towards dropping CommonJS support - it's now transpiled from ESM to CommonJS instead of the opposite.

  In addition, the `exports` attribute has been added to `package.json` to prohibit access to APIs that are not intended to be used by external consumers.

### Patch Changes

- [#758](https://github.com/iTwin/presentation/pull/758): Promote `@beta` APIs to `@public`.

## 1.0.0

### Major Changes

- [#727](https://github.com/iTwin/presentation/pull/727): 1.0 release.

  The APIs are now considered stable and ready for production use.

## 0.5.0

### Minor Changes

- [#703](https://github.com/iTwin/presentation/pull/703): **BREAKING:** Removed the option to specify value + ECProperty identifier when creating a `ConcatenatedValue`.

  The change provides two benefits:

  1. Access to schema is not required to format `ConcatenatedValue` parts as they already contain all the necessary metadata required for formatting the value. This is a step towards supporting multiple data sources, where schema information might be not available during formatting.
  2. Previously, the property type information had to be extracted for every row in the result set, which was inefficient. Now, the type information is extracted only once, when creating an ECSql query.

  Full list of changes:

  - `ConcatenatedValuePart.isProperty` - removed, as the "property" type was removed from the type union.
  - `ECSql.createConcatenatedValueJsonSelector` and `ECSql.createConcatenatedValueStringSelector` don't accept an option to specify value + ECProperty identifier as a selector argument anymore. Instead, the option that specifies value selector + type information should be used. The latter kind of selector can be created using the newly added `ECSql.createPrimitivePropertyValueSelectorProps` function (see below).
  - Added `ECSql.createPrimitivePropertyValueSelectorProps` function to help create a selector that specifies a value selector + type information. See README for more details.
  - The change allows formatting `ConcatenatedValue` parts without the need to access schema information, so `formatConcatenatedValue` function now doesn't require a `schemaProvider` prop.

  Mitigation example:

  _Before:_

  ```ts
  const selector: ECSql.createConcatenatedValueJsonSelector([
    { type: "String", value: "[" },
    { propertyClassName: "MySchema.MyClass", propertyClassAlias: "this", propertyName: "PropX" },
    { type: "String", value: "]" },
  ]);
  ```

  _After:_

  ```ts
  const selector: ECSql.createConcatenatedValueJsonSelector([
    { type: "String", value: "[" },
    await ECSql.createPrimitivePropertyValueSelectorProps({ schemaProvider, propertyClassName: "MySchema.MyClass", propertyClassAlias: "this", propertyName: "PropX" }),
    { type: "String", value: "]" },
  ]);
  ```

### Patch Changes

- [#703](https://github.com/iTwin/presentation/pull/703): Fix `ECSql.createConcatenatedValueStringSelector` not casting property value to string. This could cause ECSQL query execution to fail when more than one selector is used.

## 0.4.1

### Patch Changes

- [#695](https://github.com/iTwin/presentation/pull/695): Bump `iTwin.js` core package dependency versions to `4.8.0`

## 0.4.0

### Minor Changes

- [#675](https://github.com/iTwin/presentation/pull/675): Added an utility `ECSql.createInstanceKeySelector` function to simplify selecting `InstanceKey` objects.

  Example usage:

  ```ts
  const reader = queryExecutor.createQueryReader({
    ecsql: `
      SELECT ${ECSql.createInstanceKeySelector("el")} key
      FROM bis.Element el
    `,
  });
  for await (const row of reader) {
    const instanceKey: InstanceKey = JSON.parse(row.key);
    // do something with instanceKey
  }
  ```

## 0.3.2

### Patch Changes

- [#655](https://github.com/iTwin/presentation/pull/655): Remove exposed internal APIs.

## 0.3.1

### Patch Changes

- [#631](https://github.com/iTwin/presentation/pull/631): Fix `ECSql.createRelationshipPathJoinClause` creating an invalid JOIN clause in case of reversed relationship step that uses a navigation property.

## 0.3.0

### Minor Changes

- [#628](https://github.com/iTwin/presentation/pull/628): Added support for nested concatenated values by adding `ConcatenatedValue` to the `ConcatenatedValuePart` union. In addition:

  - A type guard `ConcatenatedValuePart.isConcatenatedValue` has been added to distinguish it from other types of `ConcatenatedValuePart`.
  - `ConcatenatedValue.serialize` has been modified to handle the new type of part seamlessly, so the `partFormatter` prop function receives the same 3 types of `ConcatenatedValuePart`, expanded from nested `ConcatenatedValue` if necessary.

  The change makes combining multiple concatenated values easier, e.g. now you can do this:

  ```ts
  const value: ConcatenatedValue = [createConcatenatedValueX(), { type: "String", value: " - " }, createConcatenatedValueY()];
  ```

## 0.2.0

### Minor Changes

- [#582](https://github.com/iTwin/presentation/pull/582): Added `restartToken` property to `ECSqlQueryReaderOptions`.

### Patch Changes

- [#581](https://github.com/iTwin/presentation/pull/581): Bump `itwinjs-core` dependencies to `^4.6.0`

## 0.1.1

### Patch Changes

- [#571](https://github.com/iTwin/presentation/pull/571): Added utility functions for releasing main thread: `releaseMainThread` and `createMainThreadReleaseOnTimePassedHandler`.

## 0.1.0

### Minor Changes

- [#554](https://github.com/iTwin/presentation/pull/554): Initial package release.

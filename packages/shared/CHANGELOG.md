# @itwin/presentation-shared

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

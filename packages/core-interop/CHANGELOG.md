# @itwin/presentation-core-interop

## 1.2.0

### Minor Changes

- [#814](https://github.com/iTwin/presentation/pull/814): Add a `createIModelKey` function to safely create an identifier for an `IModel` in different situations.

  Example:

  ```ts
  import { IModelConnection } from "@itwin/core-frontend";
  import { createIModelKey } from "@itwin/presentation-core-interop";

  IModelConnection.onOpen.addListener((imodel: IModelConnection) => {
    const key = createIModelKey(imodel);
    console.log(`IModel opened: "${key}"`);
  });
  ```

## 1.1.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.2.0

## 1.1.1

### Patch Changes

- [#760](https://github.com/iTwin/presentation/pull/760): Added missing `package.json` file under `cjs` folder. It is needed for package to work as commonjs module.

## 1.1.0

### Minor Changes

- [#740](https://github.com/iTwin/presentation/pull/740): Define `type` and `exports` attributes in `package.json`.

  The change moves this package a step closer towards dropping CommonJS support - it's now transpiled from ESM to CommonJS instead of the opposite.

  In addition, the `exports` attribute has been added to `package.json` to prohibit access to APIs that are not intended to be used by external consumers.

### Patch Changes

- [#758](https://github.com/iTwin/presentation/pull/758): Promote `@beta` APIs to `@public`.
- Updated dependencies:
  - @itwin/presentation-shared@1.1.0

## 1.0.0

### Major Changes

- [#727](https://github.com/iTwin/presentation/pull/727): 1.0 release.

  The APIs are now considered stable and ready for production use.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.0.0

## 0.2.7

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.5.0

## 0.2.6

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.4.1

## 0.2.5

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.4.0

## 0.2.4

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.3.2

## 0.2.3

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.3.1

## 0.2.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.3.0

## 0.2.1

### Patch Changes

- [#623](https://github.com/iTwin/presentation/pull/623): Avoid repeated schema requests from `SchemaContext` - otherwise we're downloading the same schema from the backend multiple times.

## 0.2.0

### Minor Changes

- [#582](https://github.com/iTwin/presentation/pull/582): Updated `ECSqlQueryExecutor` to pass `restartToken` options to the underlying ECSql reader.

### Patch Changes

- [#585](https://github.com/iTwin/presentation/pull/585): `createQueryReader`: Remove extra whitespace from executed queries
- [#592](https://github.com/iTwin/presentation/pull/592): Do not publish source files to the npm
- Updated dependencies:
  - @itwin/presentation-shared@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.1.1

## 0.1.1

### Patch Changes

- [#558](https://github.com/iTwin/presentation/pull/558): Fixed `createECSchemaProvider` to create a provider that returns `undefined` instead of throwing, when the requested schema is not found.

## 0.1.0

### Minor Changes

- [#554](https://github.com/iTwin/presentation/pull/554): Initial package release.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.1.0

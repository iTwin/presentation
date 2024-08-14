# @itwin/presentation-core-interop

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

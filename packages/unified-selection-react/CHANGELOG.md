# @itwin/unified-selection-react

## 2.0.0-alpha.0

### Major Changes

- [#1454](https://github.com/iTwin/presentation/pull/1454): Dropped CommonJS support. These packages are now published as ES modules (ESM) only.

  This is a packaging change only — the public API is unchanged — so consumers already using the ESM build are not affected. For downstream packages depending on these:

  - If you list one of these packages as a `peerDependency`, widen the version range to include the new major version.
  - If you have one of these packages as a `dependency` and re-expose it through your public API, you can safely bump to the new major version — the API is unchanged, so it will not break your API consumers.

### Patch Changes

- Updated dependencies:
  - @itwin/unified-selection@2.0.0-alpha.0

## 1.1.0

### Minor Changes

- [#1387](https://github.com/iTwin/presentation/pull/1387): Added support for React version 19

## 1.0.5

### Patch Changes

- [#1168](https://github.com/iTwin/presentation/pull/1168): Bump dependencies.
- Updated dependencies:
  - @itwin/unified-selection@1.6.5

## 1.0.4

### Patch Changes

- [#1152](https://github.com/iTwin/presentation/pull/1152): Bump dependencies.
- Updated dependencies:
  - @itwin/unified-selection@1.6.4

## 1.0.3

### Patch Changes

- [#1139](https://github.com/iTwin/presentation/pull/1139): Bump dependencies.
- Updated dependencies:
  - @itwin/unified-selection@1.6.3

## 1.0.2

### Patch Changes

- [#1124](https://github.com/iTwin/presentation/pull/1124): Bump dependencies.
- Updated dependencies:
  - @itwin/unified-selection@1.6.2

## 1.0.1

### Patch Changes

- [#982](https://github.com/iTwin/presentation/pull/982): Update itwinjs-core dependencies to v5.0.0
- Updated dependencies:
  - @itwin/unified-selection@1.4.2

## 1.0.0

### Major Changes

- [#841](https://github.com/iTwin/presentation/pull/841): Add a package that provides React APIs for conveniently using the `@itwin/unified-selection` package in React applications and components.

### Patch Changes

- Updated dependencies:
  - @itwin/unified-selection@1.3.0

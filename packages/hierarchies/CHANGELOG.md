# @itwin/presentation-hierarchies

## 0.1.2

### Patch Changes

- [#618](https://github.com/iTwin/presentation/pull/618): Remove `@internal` tags from public APIs that aren't exported through the barrel. They were added to explicitly say that not adding to barrel was intentional, but that makes the `@itwin/no-internal` linter rule angry.

## 0.1.1

### Patch Changes

- [#603](https://github.com/iTwin/presentation/pull/603): Fix filtered node shown as having no children if it has a single hidden child node that also matches filter.

## 0.1.0

### Minor Changes

- [#584](https://github.com/iTwin/presentation/pull/584): Initial release.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.2.0
# @itwin/presentation-hierarchies

## 0.2.0

### Minor Changes

- [#642](https://github.com/iTwin/presentation/pull/642): Added `onlyIfNotHandled` flag to hierarchy level definitions that are passed to `createClassBasedHierarchyDefinition`.
  This flag allows to skip instance node hierarchy level definitions if previous ones have defined hierarchy levels for a more specific class.
  This can help to reduce repetition having to check if class doesn't match those of the more specific definitions.

  Before:

  ```ts
  createClassBasedHierarchyDefinition({
    classHierarchyInspector: inspector,
    hierarchy: {
      childNodes: [
        {
          parentNodeClassName: "BisCore.PhysicalElement",
          definitions: async ({ parentNode }) => getPhysicalElementChildren(parentNode),
        },
        {
          parentNodeClassName: "BisCore.SpatialElement",
          definitions: async ({ parentNode, parentNodeClassName }) => {
            if (await inspector.classDerivesFrom(parentNodeClassName, "BisCore.PhysicalElement")) {
              return [];
            }

            return getSpatialElementChildren(parentNode);
          },
        },
        {
          parentNodeClassName: "BisCore.GeometricElement3d",
          definitions: async ({ parentNode, parentNodeClassName }) => {
            if (await inspector.classDerivesFrom(parentNodeClassName, "BisCore.PhysicalElement")) {
              return [];
            }

            if (await inspector.classDerivesFrom(parentNodeClassName, "BisCore.SpatialElement")) {
              return [];
            }

            return getGeometricElement3dChildren(parentNode);
          },
        },
      ],
    },
  });
  ```

  After:

  ```ts
  createClassBasedHierarchyDefinition({
    classHierarchyInspector,
    hierarchy: {
      childNodes: [
        {
          parentNodeClassName: "BisCore.PhysicalElement",
          definitions: async ({ parentNode }) => getPhysicalElementChildren(parentNode),
        },
        {
          parentNodeClassName: "BisCore.SpatialElement",
          onlyIfNotHandled: true,
          definitions: async ({ parentNode }) => getSpatialElementChildren(parentNode),
        },
        {
          parentNodeClassName: "BisCore.GeometricElement3d",
          onlyIfNotHandled: true,
          definitions: async ({ parentNode }) => getGeometricElement3dChildren(parentNode),
        },
      ],
    },
  });
  ```

## 0.1.6

### Patch Changes

- [#634](https://github.com/iTwin/presentation/pull/634): `NodeSelectQueryFactory.createWhereClause`: Fixed `like` operator not matching substrings.

## 0.1.5

### Patch Changes

- [#632](https://github.com/iTwin/presentation/pull/632): Fixed hierarchy filtering when multiple paths uses same instance with diffrent class name.
- Updated dependencies:
  - @itwin/presentation-shared@0.3.1

## 0.1.4

### Patch Changes

- [#625](https://github.com/iTwin/presentation/pull/625): Fixed `preProcessNode` and `postProcessNode` losing `this` context in `HierarchyProvider`.
- Updated dependencies:
  - @itwin/presentation-shared@0.3.0

## 0.1.3

### Patch Changes

- [#620](https://github.com/iTwin/presentation/pull/620): Expose filtering information to the type of a fully processed node.

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

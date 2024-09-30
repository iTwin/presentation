# @itwin/presentation-hierarchies

## 0.6.0

### Minor Changes

- [#707](https://github.com/iTwin/presentation/pull/707): **BREAKING:** Added mandatory `instanceLabelSelectClauseFactory` parameter to `createNodesQueryClauseFactory`, this enables grouping by navigation property.

  Migration example:

  _Before:_

  ```ts
  const selectQueryFactory = createNodesQueryClauseFactory({ imodelAccess });
  ```

  _After:_

  ```ts
  const selectQueryFactory = createNodesQueryClauseFactory({
    imodelAccess,
    instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
  });
  ```

- Updated dependencies:
  - @itwin/presentation-shared@0.5.0

## 0.5.0

### Minor Changes

- [#688](https://github.com/iTwin/presentation/pull/688): Add ability to prevent auto-expanding of a grouping node when filtering hierarchies:

  ```ts
  const hierarchyProvider = createHierarchyProvider({
    imodelAccess,
    hierarchyDefinition,
    filtering: {
      paths: [
        {
          // Path to the element "C"
          path: [elementKeys.a, elementKeys.b, elementKeys.c],
          // Supply grouping node attributes with the path to the "C" element.
          options: { autoExpand: { key: groupingNode.key, depth: groupingNode.parentKeys.length } },
        },
      ],
    },
  });
  ```

- [#688](https://github.com/iTwin/presentation/pull/688): Add hierarchy node key types to the barrel exports.

### Patch Changes

- [#695](https://github.com/iTwin/presentation/pull/695): Bump `iTwin.js` core package dependency versions to `4.8.0`
- Updated dependencies:
  - @itwin/presentation-shared@0.4.1

## 0.4.0

### Minor Changes

- [#676](https://github.com/iTwin/presentation/pull/676): `createHierarchyProvider`: Added ability to specify whether hierarchy should be expanded to filtering path target, when specifying the `filtering.paths` prop.

  With this change, hierarchy is no longer expanded to filter targets by default. To achieve the same behavior, paths with `autoExpand` option should be provided:

  _Before:_

  ```tsx
  const hierarchyProvider = createHierarchyProvider({
    imodelAccess,
    hierarchyDefinition: createHierarchyDefinition(imodelAccess),
    filtering: { paths: filterPaths },
  });
  ```

  _Now:_

  ```tsx
  const hierarchyProvider = createHierarchyProvider({
    imodelAccess,
    hierarchyDefinition: createHierarchyDefinition(imodelAccess),
    filtering: { paths: filterPaths.map((path) => ({ path, options: { autoExpand: true } })) },
  });
  ```

- [#672](https://github.com/iTwin/presentation/pull/672): Fix `autoExpand` prop of grouping specification for `NodesQueryClauseFactory.createSelectClause` being wrongly defined as `string`. Define it as a string union of `"always" | "single-child"`.

### Patch Changes

- [#675](https://github.com/iTwin/presentation/pull/675): Fix nodes being erroneously set as filter targets when they had filter target siblings.
- [#672](https://github.com/iTwin/presentation/pull/672): Fix grouped nodes not being returned for "Not specified" property grouping node when grouping by value ranges.
- [#672](https://github.com/iTwin/presentation/pull/672): Fix hierarchy provider not returning all nodes in situations when internal cache is full and a prior request of grouped children was made.
- Updated dependencies:
  - @itwin/presentation-shared@0.4.0

## 0.3.0

### Minor Changes

- [#665](https://github.com/iTwin/presentation/pull/665): Remove the option to specify `ecClassId` and `ecInstanceId` in `NodesQueryClauseFactory.createSelectClause` as `Id64String`. Now they can only be specified as a selector object, e.g. `{ selector: "this.ECClassId" }`. In case a static string is needed, the selector can return one.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.3.2

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

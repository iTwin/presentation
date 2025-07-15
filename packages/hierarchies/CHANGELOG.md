# @itwin/presentation-hierarchies

## 1.6.0

### Minor Changes

- 69a2db67917f84e99d532e8e9aabbc02ec262d91: `HierarchyFilteringPathOptions.autoExpand` is now of type:
  ```ts
  autoExpand?: { depth: number } | boolean;
  ```
  When `depth` is set, only nodes up to specified `depth` in `HierarchyFilteringPath` will have `autoExpand` option set.

## 1.5.1

### Patch Changes

- [#982](https://github.com/iTwin/presentation/pull/982): Update itwinjs-core dependencies to v5.0.0
- Updated dependencies:
  - @itwin/presentation-shared@1.2.2

## 1.5.0

### Minor Changes

- [#962](https://github.com/iTwin/presentation/pull/962): `createChildNodePropsAsync` function, returned by `createHierarchyFilteringHelper`, may now return either a Promise, or the value synchronously. Either way, the result may be awaited, but for cases when the `createChildNodePropsAsync` function is called many times, not having to await on it provides performance improvement.

  **Before:**

  ```ts
  const childNodeProps = await createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
    pathMatcher: (identifier): boolean | Promise<boolean> => {
      return false;
    },
  });
  ```

  **After:**

  - **Option A:** check if it's a Promise before awaiting:

    Use this when you want to get slightly better performance by avoiding unnecessary `await`.

    ```ts
    const childNodePropsPossiblyPromise = createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
      pathMatcher: (identifier): boolean | Promise<boolean> => {
        return false;
      },
    });
    const childNodeProps = childNodePropsPossiblyPromise instanceOf Promise ? await childNodePropsPossiblyPromise : childNodePropsPossiblyPromise;
    ```

  - **Option B:** always await

    Use this if pathMatcher always returns a Promise or you prefer a simpler pattern.

    ```ts
    const childNodeProps = await createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
      pathMatcher: async (identifier): Promise<boolean> => {
        return false;
      },
    });
    ```

## 1.4.2

### Patch Changes

- [#909](https://github.com/iTwin/presentation/pull/909): Do not use `dev` versions of `@itwin/*` packages.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.1

## 1.4.1

### Patch Changes

- [#828](https://github.com/iTwin/presentation/pull/828): Polyfill `Symbol.dispose` and `Symbol.asyncDispose` to make sure that code using the upcoming JS recource management API works in all environments.

## 1.4.0

### Minor Changes

- [#802](https://github.com/iTwin/presentation/pull/802): Prefer `Symbol.dispose` over `dispose` for disposable objects.

  The package contained a number of types for disposable objects, that had a requirement of `dispose` method being called on them after they are no longer needed. In conjunction with the `using` utility from `@itwin/core-bentley`, usage of such objects looked like this:

  ```ts
  class MyDisposable() {
    dispose() {
      // do some cleanup
    }
  }
  using(new MyDisposable(), (obj) => {
    // do something with obj, it'll get disposed when the callback returns
  });
  ```

  In version `5.2`, TypeScript [introduced](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management) `Disposable` type and `using` declarations (from the upcoming [Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management) feature in ECMAScript). Now we're making use of those new utilities in this package (while still supporting the old `dispose` method), which allows using `MyDisposable` from the above snippet like this:

  ```ts
  using obj = new MyDisposable();
  // do something with obj, it'll get disposed when it goes out of scope
  ```

## 1.3.0

### Minor Changes

- [#783](https://github.com/iTwin/presentation/pull/783): Extended `createPredicateBasedHierarchyDefinition` props to accept `HierarchyDefinition` functions: `parseNode`, `preProcessNode` and `postProcessNode`.

  The change allows creating a fully capable `HierarchyDefinition` with all the custom behaviors provided by those functions.

- [#791](https://github.com/iTwin/presentation/pull/791): Unify hierarchy updates' handling.

  Previously, we'd only raise the `HierarchyProvider.hierarchyChanged` event on data source changes. The tree state hooks would listen to this event and trigger a hierarchy update. However, there are a few other reasons for the hierarchy to change - changing formatter or active hierarchy filter. In those situations the event was not raised, but tree state hooks still had to trigger hierarchy update. So we ended up with a mix of event-driven and manual hierarchy updates.

  With this change we're clearly stating that a hierarchy provider should trigger its `hierarchyChanged` event whenever something happens that causes the hierarchy to change. That means, the event will be raised when formatter or hierarchy filter is set, and tree state hooks can initiate hierarchy reload from a single place - the `hierarchyChanged` event listener.

  To let event listeners know what caused the hierarchy change, the event now has event arguments, which should be set by the hierarchy provider when raising the event. This allows listeners to customize hierarchy reload logic - for example, our tree state hooks always keep existing tree state except when a new hierarchy filter is set, in which case the existing state is discarded.

- [#783](https://github.com/iTwin/presentation/pull/783): Added hierarchy filtering helper to make hierarchy filtering easier to implement.

  The helper can be created using the `createHierarchyFilteringHelper` function and supplying it the root level filtering paths and parent node. From there, filtering information for specific hierarchy level is determined and an object with the following attributes is returned:

  - `hasFilter` tells if the hierarchy level has a filter applied.
  - `hasFilterTargetAncestor` tells if there's a filter target ancestor node up in the hierarchy.
  - `getChildNodeFilteringIdentifiers()` returns an array of hierarchy node identifiers that apply specifically for this hierarchy level.
  - `createChildNodeProps()` and `createChildNodePropsAsync()` return attributes that should be applied to nodes in filtered hierarchy levels, after applying the filter.

  See the [Implementing hierarchy filtering support](./learning/CustomHierarchyProviders.md#implementing-hierarchy-filtering-support) learning page for a usage example.

  In addition, deprecated a few APIs that are replaced by filtering helper:

  - `extractFilteringProps` function,
  - `HierarchyNodeFilteringProps.create` function.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.2.0

## 1.2.1

### Patch Changes

- [#760](https://github.com/iTwin/presentation/pull/760): Added missing `package.json` file under `cjs` folder. It is needed for package to work as commonjs module.

## 1.2.0

### Minor Changes

- [#740](https://github.com/iTwin/presentation/pull/740): Define `type` and `exports` attributes in `package.json`.

  The change moves this package a step closer towards dropping CommonJS support - it's now transpiled from ESM to CommonJS instead of the opposite.

  In addition, the `exports` attribute has been added to `package.json` to prohibit access to APIs that are not intended to be used by external consumers.

### Patch Changes

- [#743](https://github.com/iTwin/presentation/pull/743): Fixed hierarchy filtering having a limit of 500 filtered nodes under a single parent.
- [#758](https://github.com/iTwin/presentation/pull/758): Promote `@beta` APIs to `@public`.
- Updated dependencies:
  - @itwin/presentation-shared@1.1.0

## 1.1.0

### Minor Changes

- [#711](https://github.com/iTwin/presentation/pull/711): Increased the speed of hierarchy filtering with large number of filtered paths.

  | Amount of paths | Before the change | After the change |
  | --------------- | ----------------- | ---------------- |
  | 500             | 960.18 ms         | 233.65 ms        |
  | 1k              | 2.29 s            | 336.81 ms        |
  | 10k             | 232.55 s          | 2.17 s           |
  | 50k             | not tested        | 13.45 s          |

  In addition, changed `NodeParser` (return type of `HierarchyDefinition.parseNode`):

  - It now can return a promise, so instead of just `SourceInstanceHierarchyNode` it can now also return `Promise<SourceInstanceHierarchyNode>`.
  - Additionally, it now accepts an optional `parentNode` argument of `HierarchyDefinitionParentNode` type.

## 1.0.0

### Major Changes

- [#727](https://github.com/iTwin/presentation/pull/727): 1.0 release.

  The APIs are now considered stable and ready for production use.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.0.0

## 0.7.1

### Patch Changes

- [#720](https://github.com/iTwin/presentation/pull/720): Fixed iModel hierarchy provider returning unfiltered nodes after setting the hierarchy filter in certain scenarios.

  The situation could happen when a new hierarchy filter is set during an ongoing nodes request. Then, requesting nodes immediately after setting the filter could return nodes from the previous request.

  The change also slightly changes what happens with ongoing requests when hierarchy provider's internal state is reset: provider is disposed, the `imodelChanged` event is raised or hierarchy filter is set. Previously, it would continue handling all ongoing requests and return a valid result. Now, it will stop ASAP and return an empty list.

## 0.7.0

### Minor Changes

- [#708](https://github.com/iTwin/presentation/pull/708): **BREAKING:** Added support for creating hierarchies from multiple data sources.

  - `InstancesNodeKey.instanceKeys` array items now have an optional `imodelKey` attribute to allow for the identification of the iModel that the instance belongs to. This is useful when working with sets of instance keys representing instances from different iModels. In addition, the same `imodelKey` attribute is also available on `HierarchyNodeIdentifier` to allow for filtering nodes based on the iModel they belong to.
  - `HierarchyNode` terminology and related changes:
    - "Standard" nodes were renamed to "IModel" nodes to signify the fact that they're based on iModel data:
      - `StandardHierarchyNodeKey` renamed to `IModelHierarchyNodeKey`.
      - `HierarchyNodeKey.isStandard` renamed to `HierarchyNodeKey.isIModelNodeKey`.
      - `HierarchyNode.isStandard` renamed to `HierarchyNode.isIModelNode`.
    - "Custom" nodes were renamed to "generic":
      - `key` of custom nodes was a `string`. Now, `HierarchyProvider` returns these nodes with key of type `GenericNodeKey` (`HierarchyDefinition` still returns the `key` as `string` like before). This affects how generic nodes are identified through `HierarchyNodeIdentifier` when specifying hierarchy filter paths (was a `string`, now `GenericNodeKey`).
      - `DefineCustomNodeChildHierarchyLevelProps` renamed to `DefineGenericNodeChildHierarchyLevelProps`.
      - `HierarchyNodeKey.isCustom` renamed to `HierarchyNodeKey.isGeneric`.
      - `HierarchyNode.isCustom` renamed to `HierarchyNode.isGeneric`.
      - `HierarchyNodeIdentifier.isCustomNodeIdentifier` renamed to `HierarchyNodeIdentifier.isGenericNodeIdentifier`.
      - `HierarchyNodesDefinition.isCustomNode` renamed to `HierarchyNodesDefinition.isGenericNode`.
    - `ParsedHierarchyNode` was renamed to `SourceHierarchyNode`.
    - Type guards in `HierarchyNode` namespace no longer narrow the type of the input node to `ProcessedHierarchyNode` subtypes. Instead, a `ProcessedHierarchyNode` namespace was added with a number of type guards to do that.
  - Changes to `HierarchyProvider` interface:
    - Removed `notifyDataSourceChanged` method. Each provider implementation should decide how it gets notified about data source changes.
    - Added `setHierarchyFilter` method to allow setting or removing the filter without creating a new provider.
  - Renamed `createHierarchyProvider` to `createIModelHierarchyProvider` to signify that the created provider creates nodes based on specific iModel. In addition, the function received the following changes:
    - The `imodelAccess` object now requires an additional `imodelKey` attribute. See README for how to create the `imodelAccess` object.
    - All nodes returned by the provider are now associated with the iModel this provider is using:
      - Instances-based hierarchy nodes' instance keys have an `imodelKey` attribute.
      - Generic nodes' keys have a `source` attribute set to imodel access' `imodelKey`.
    - Added an optional `imodelChanged` prop of `Event` type. The created provider listens to this event and updates the hierarchy when the event is raised (previously this was done by calling `notifyDataSourceChanged` method on the provider).
    - The returned provider now has a `dispose` method to clean up resources - make sure to call it when the provider is no longer needed.
  - Added `mergeProviders` function, which, given a number of hierarchy providers, creates a new provider that merges the hierarchies of the input providers. The returned provider has a `dispose` method that needs to be called when the provider is no longer needed.
  - Renamed `createClassBasedHierarchyDefinition` to `createPredicateBasedHierarchyDefinition` to signify its props changes:

    - When specifying `childNodes` definition for instances parent node, the `parentNodeClassName` attribute was changed to `parentInstancesNodePredicate`. In addition to accepting a full class name, identifying the class of parent instances to return children for, it now also accepts an async function predicate.
    - When specifying `childNodes` definition for generic parent node, the `customParentNodeKey` attribute was changed to `parentGenericNodePredicate`. The type changed from `string`, identifying the key of the parent node, to an async function predicate.

    Migration:

    ```ts
    // before
    const definition = createClassBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [...],
        childNodes: [
          {
            parentNodeClassName: "MySchema.MyClass",
            definitions: async () => [...],
          },
          {
            customParentNodeKey: "my-custom-node",
            definitions: async () => [...],
          },
        ],
      },
    });

    // after
    const definition = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [...],
        childNodes: [
          {
            parentInstancesNodePredicate: "MySchema.MyClass",
            /* alternative:
            parentInstancesNodePredicate: async (parentKey) =>
              Promise.all(
                parentKey.instanceKeys.map(async (instanceKey) =>
                  classHierarchyInspector.classDerivesFrom(instanceKey.className, "MySchema.MyClass"),
                ),
              ),
            */
            definitions: async () => [...],
          },
          {
            parentGenericNodePredicate: async (parentKey) => parentKey.id === "my-custom-node",
            definitions: async () => [...],
          },
        ],
      },
    });
    ```

- [#708](https://github.com/iTwin/presentation/pull/708): Added utilities for custom hierarchy filtering handling:

  - `extractFilteringProps` function, given root level hierarchy filtering paths and a parent node, returns props required to filter particular hierarchy level.
  - `HierarchyFilteringPath` interface is now public and there's also a similarly-named namespace with the following utilities:
    - `mergeOptions` merges filtering options of two paths. This is useful for cases when there are multiple paths targeting the same node, but with different options.
    - `normalize` takes `HierarchyFilteringPath`, which may be either a pure path or an object with a path and options, and returns normalized version of it - an object with `path` and `options` attributes.

- [#717](https://github.com/iTwin/presentation/pull/717): **BREAKING:** Added a required `HierarchyProvider.hierarchyChanged` attribute.

  The attribute is of type `Event` and should be raised by the provider whenever the underlying data source changes in a way that affects the resulting hierarchy. This moves the responsibility of data source change tracking from the consumers using the provider to the provider itself. All provider implementations delivered by this package have been updated to raise this event when necessary.

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

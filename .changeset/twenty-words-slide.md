---
"@itwin/presentation-hierarchies": major
---

Start using tree structure for defining hierarchy search paths.

**Additions:**

- `HierarchySearchTree` type that represents a tree structure of hierarchy search paths and is now used for hierarchy search implementation in `HierarchyProvider`.

  In addition to the type, there's also a namespace with the same name, providing utility functions for working with the tree structure:
  - `HierarchySearchTree.createBuilder` function to create a builder for hierarchy search trees, which can be used to create a tree from individual paths or to merge multiple trees together:

    ```ts
    const builder = HierarchySearchTree.createBuilder();
    builder.accept({ path: searchPath1 });
    builder.accept({ path: searchPath2 });
    builder.accept({ tree: partialSearchTree });
    const tree: HierarchySearchTree = builder.getTree();
    ```

    This is the preferred way to create a `HierarchySearchTree`, as it allows to create a tree without having to create an array first, as opposed to `HierarchySearchTree.createFromPathsList` function described below.

  - `HierarchySearchTree.createFromPathsList` function to create a hierarchy search tree from a list of hierarchy search paths. This is a quick & easy way to migrate from the old `HierarchySearchPath[]` structure to `HierarchySearchTree[]`, but it's' less efficient than using the builder if you need to create a tree from a large number of paths, as it needs to create an intermediate array.

    The recommended way to handle multiple search paths is to use the builder and call `accept` for each path, as it allows to create a tree without having to create an array first:

    ```ts
    // Instead of doing this:
    const searchPaths: HierarchySearchPath[] = [];
    for (const item of items) {
      searchPaths.push(createSearchPathForItem(item));
    }
    const tree: HierarchySearchTree = HierarchySearchTree.createFromPathsList(searchPaths);

    // Do this:
    const builder = HierarchySearchTree.createBuilder();
    for (const item of items) {
      builder.accept({ path: createSearchPathForItem(item) });
    }
    const tree: HierarchySearchTree = builder.getTree();
    ```

  - `HierarchySearchTree.mergeOptions` function to merge options of two hierarchy search trees. Used internally to merge options of the same nodes when creating a tree from a list of paths.

- `HierarchyNode.getGroupingNodeLevel` utility function to get the level of a grouping node in the hierarchy. Convenient for specifying the `groupingLevel` prop in `HierarchySearchPath.options.reveal` and `HierarchySearchTree.options.autoExpand`.

- `HierarchyNodeIdentifier.compare` static function to compare two `HierarchyNodeIdentifier` objects. Useful when using `HierarchyNodeIdentifier` as a key in a dictionary sorted set.

**Breaking changes:**

- `HierarchySearchPathOptions.reveal` type `{ depthInHierarchy: number }` was replaced with `{ groupingLevel: number }`.

  The `depthInHierarchy` option was only useful when revealing grouping nodes, the rename makes the intent more explicit. In addition, the `groupingLevel` option is only handled in the scope of one specific `InstancesNode` node that the options are supplied for, so handling this option is more efficient - we only need to handle it for grouping nodes, and look only as deep as the next grouped `InstancesNode` node.

  Migration:

  ```ts
  const groupingNode = getMyGroupingNode();
  const searchPath: HierarchySearchPath = {
    // ...
    options: {
      // before
      reveal: { depthInHierarchy: groupingNode.parentKeys.length },

      // after
      reveal: { groupingLevel: HierarchyNode.getGroupingNodeLevel(groupingNode) },
    },
  };
  ```

- `HierarchyProvider.setHierarchySearch` now takes `{ paths: HierarchySearchTree[] }` instead of `{ paths: HierarchySearchPath[] }`.

  Migration:

  ```ts
  const provider: HierarchyProvider = getMyHierarchyProvider();
  const searchPaths: HierarchySearchPath[] = getMySearchPaths();
  provider.setHierarchySearch({
    // before
    paths: searchPaths,

    // after
    // - see `HierarchySearchTree.createFromPathsList` description above for more efficient way to do this
    // - quick migration:
    paths: await HierarchySearchTree.createFromPathsList(searchPaths),
  });
  ```

- `createIModelHierarchyProvider` and `createMergedIModelHierarchyProvider` functions' `search` prop now takes `{ paths: HierarchySearchTree[] }` instead of `{ paths: HierarchySearchPath[] }`. Use `HierarchySearchTree.createFromPathsList` to do the conversion.

  Migration:

  ```ts
  const searchPaths: HierarchySearchPath[] = getMySearchPaths();
  const provider = createIModelHierarchyProvider({
    // ...
    search: {
      // before
      paths: searchPaths,

      // after
      // - see `HierarchySearchTree.createFromPathsList` description above for more efficient way to do this
      // - quick migration:
      paths: await HierarchySearchTree.createFromPathsList(searchPaths),
    },
  });
  ```

- `HierarchyNode.search` changes:
  - Type of `childrenTargetPaths` has been changed from `HierarchySearchPath[]` to `HierarchySearchTree[]`.
  - `searchTargetOptions` was replaced with `options`, which is available not only for nodes with `isSearchTarget: true`, but all of them.

  The changes of this attribute are taken care of by the `createHierarchySearchHelper` changes described below.

- `createHierarchySearchHelper` changes:
  - The first argument is now `HierarchySearchTree[]` instead of `HierarchySearchPath[]`.
  - The `createChildNodeProps` function of returned result no longer requires the `parentKeys` prop, but instead always requires the `nodeKey` prop.

  Migration:

  ```ts
  // Somewhere in `HierarchyProvider.getNodes` implementation...

  // Type of the first argument has changed, but it also changed on `HierarchyProvider`, so likely no changes are needed here. If the
  // type of `rootSearch.paths` is still `HierarchySearchPath[]` - use `HierarchySearchTree.createFromPathsList` to do the conversion.
  const helper = createHierarchySearchHelper(rootSearch?.paths, parentNode);
  for (const book of books) {
    const nodeKey: GenericNodeKey = { type: "generic", id: `book:${book.key}` };
    yield {
      key: nodeKey,
      label: book.title,
      children: false,
      parentKeys: [...parentNode.parentKeys, parentNode.key],
      // before
      ...searchHelper?.createChildNodeProps({ nodeKey, parentKeys }),
      // after
      ...searchHelper?.createChildNodeProps({ nodeKey }),
    };
  }
  ```

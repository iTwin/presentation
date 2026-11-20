---
"@itwin/presentation-hierarchies": minor
---

Added `createHierarchyNodePaths` function, which loads hierarchy nodes along the given search paths - objects with a `path` of node identifiers, like the ones yielded by tree definitions' `createInstanceKeyPaths`. All hierarchy levels are requested concurrently, without loading their ancestor nodes first.

The function resolves with a `{ searchPath, nodesPath }` object for every search path, where `nodesPath` contains the same nodes that `HierarchyProvider.getNodes` returns when the hierarchy is loaded from the root down to the path's target, plus the hidden nodes. Nodes that are hidden in the hierarchy have to be included in the search paths - they're included in the resulting node paths with the `isHidden` flag. Search paths whose target isn't found or is hidden are omitted.

The function takes a `PathBasedHierarchyDefinition`, which is like `HierarchyDefinition`, except that its callbacks get a `path` of node identifiers from the root to the parent node, instead of the parent node. The definition should apply the `instanceFilter` it gets, and can't merge nodes by label.

```ts
const hierarchyDefinition: PathBasedHierarchyDefinition = {
  defineHierarchyLevel: async ({ path, instanceFilter, createSelectClause, createFilterClauses }) => [
    // ...
  ],
};
const nodePaths = await createHierarchyNodePaths({
  imodelAccess,
  hierarchyDefinition,
  paths: [{ path: [rootElementKey, childElementKey] }],
});
```

`NodeParser`, `NodePreProcessor` and `NodePostProcessor` got a `TParentProps` type parameter that specifies props identifying the parent of the node. It defaults to the `parentNode` attribute, so existing code is not affected.

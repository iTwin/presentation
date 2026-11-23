---
"@itwin/presentation-hierarchies": minor
---

Added `createIModelHierarchyNodePaths` function, which asynchronously loads paths of hierarchy nodes for the given instance key paths, e.g. the ones created by tree definitions' `createInstanceKeyPaths`. Each nodes path contains the same nodes that `HierarchyProvider.getNodes` returns when the hierarchy is loaded from the root down to the path's target.

The function takes a `PathBasedHierarchyDefinition` - a hierarchy definition whose callbacks get a `path` of node identifiers to the parent node, instead of the parent node. Nodes with multiple instance keys, e.g. nodes merged by label, are not supported - the hierarchy must not have such nodes.

```ts
const hierarchyDefinition: PathBasedHierarchyDefinition = {
  defineHierarchyLevel: async ({ path, createSelectClause }) => [
    // ...
  ],
};
for await (const nodesPath of createIModelHierarchyNodePaths({
  imodelAccess,
  hierarchyDefinition,
  paths: [{ path: [rootElementKey, childElementKey] }],
})) {
  // ...
}
```

`NodeParser`, `NodePreProcessor` and `NodePostProcessor` got a `TParentProps` type parameter that specifies props identifying the parent of the node. It defaults to the `parentNode` attribute, so existing code is not affected.

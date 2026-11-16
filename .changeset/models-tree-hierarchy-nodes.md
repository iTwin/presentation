---
"@itwin/presentation-tree-definitions": patch
---

`createModelsTree`: The returned `hierarchyDefinition` can now also be passed to `createHierarchyNodePaths` from `@itwin/presentation-hierarchies`, to load hierarchy nodes for paths created by `createInstanceKeyPaths`. For each path, it returns the hierarchy nodes from the root up to and including the target node.

```ts
const nodePaths = await createHierarchyNodePaths({
  hierarchyProviderProps: { imodelAccess, hierarchyDefinition: tree.hierarchyDefinition },
  paths: tree.createInstanceKeyPaths({ targetItems }),
});
// every `searchPath` in `nodePaths` is a `{ path, target }` object yielded by `createInstanceKeyPaths`
```

Paths must be created with the default `includeOnlyVisibleNodeInstanceKeys: false`, because nodes that are hidden in the hierarchy have to be included in them.

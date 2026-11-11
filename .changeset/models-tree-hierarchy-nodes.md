---
"@itwin/presentation-tree-definitions": patch
---

`createModelsTree`: Added the experimental (`@alpha`) `getMinimalNodeFactory` helper. It creates a `createMinimalNode` callback for `createHierarchyNodePaths` from `@itwin/presentation-hierarchies`, which loads hierarchy nodes for paths created by `createInstanceKeyPaths`. For each path, it returns the hierarchy nodes from the root up to and including the target node.

```ts
for await (const { searchPath, nodesPath } of createHierarchyNodePaths({
  hierarchyProvider,
  paths: tree.createInstanceKeyPaths({ targetItems }),
  createMinimalNode: await tree.getMinimalNodeFactory(),
})) {
  // `searchPath` is the `{ path, target }` object yielded by `createInstanceKeyPaths`
}
```

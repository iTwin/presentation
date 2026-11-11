---
"@itwin/presentation-tree-definitions": patch
---

`createModelsTree`: Added the `getMinimalNodeFactory` helper. It creates a `createMinimalNode` callback for `createHierarchyNodePaths` from `@itwin/presentation-hierarchies`, which loads hierarchy nodes for paths created by `createInstanceKeyPaths`. For each path, it returns the hierarchy nodes from the root up to and including the target node.

```ts
const nodePaths = await createHierarchyNodePaths({
  hierarchyProvider,
  imodelAccess,
  paths: tree.createInstanceKeyPaths({ targetItems }),
  createMinimalNode: await tree.getMinimalNodeFactory(),
});
// every `searchPath` in `nodePaths` is a `{ path, target }` object yielded by `createInstanceKeyPaths`
```

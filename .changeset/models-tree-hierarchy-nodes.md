---
"@itwin/presentation-tree-definitions": patch
---

`createModelsTree`: When label merging is disabled for subjects, categories and models, the returned `hierarchyDefinition` is also a `PathBasedHierarchyDefinition`, so it can be passed to `createIModelHierarchyNodePaths` from `@itwin/presentation-hierarchies` to load hierarchy nodes for paths created by `createInstanceKeyPaths`. For each path, it returns the hierarchy nodes from the root up to and including the target node.

```ts
const tree = createModelsTree({
  imodelAccess,
  hierarchyConfig: {
    subjects: { labelMerging: "disable" },
    categories: { labelMerging: "disable" },
    models: { labelMerging: "disable" },
  },
});
for await (const nodesPath of createIModelHierarchyNodePaths({
  imodelAccess,
  hierarchyDefinition: tree.hierarchyDefinition,
  paths: tree.createInstanceKeyPaths({ targetItems }),
})) {
  // `nodesPath` is a path of hierarchy nodes from the root to a target found in the hierarchy
}
```

Paths must be created with the default `includeOnlyVisibleNodeInstanceKeys: false`, because nodes that are hidden in the hierarchy have to be included in them.

---
"@itwin/presentation-hierarchies": minor
---

`createHierarchyProvider`: Added ability to specify whether hierarchy should be expanded to filtering path target, when specifying the `filtering.paths` prop.

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

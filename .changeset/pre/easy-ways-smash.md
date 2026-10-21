---
"@itwin/presentation-hierarchies": major
---

`createMergedIModelHierarchyProvider`: The `getHierarchyDefinition` prop now receives a props object `{ imodelAccess }` instead of a positional `imodelAccess` argument, so more props can be added later.

Migration:

```ts
const provider = createMergedIModelHierarchyProvider({
  imodels,
  // before
  getHierarchyDefinition: (imodelAccess) => createMyHierarchyDefinition({ imodelAccess }),
  // after
  getHierarchyDefinition: ({ imodelAccess }) => createMyHierarchyDefinition({ imodelAccess }),
});
```

---
"@itwin/presentation-hierarchies-react": minor
---

`useTree` and `useUnifiedSelectionTree`: Extended return type of `getFilteredPaths` prop to allow specifying whether hierarchy should be expanded to filtering path target.

With this change, hierarchy is no longer expanded to filter targets by default. To achieve the same behavior, paths with `autoExpand` option should be returned:

_Before:_

```tsx
async function getFilteredPaths(): Promise<HierarchyNodeIdentifiersPath[]> {
  return paths;
}
```

_Now:_

```tsx
async function getFilteredPaths(): Promise<Array<{ path: HierarchyNodeIdentifiersPath; options?: { autoExpand?: boolean }>> {
  return paths.map((path) => ({ path, options: { autoExpand: true } }));
}
```

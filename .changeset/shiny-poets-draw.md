---
"@itwin/presentation-hierarchies": minor
---

`HierarchyFilteringPathOptions.autoExpand` now is now of type:
```ts
autoExpand?: { depth: number } | boolean;
```
When `depth` is set, only nodes up to specified `depth` in `HierarchyFilteringPath` will have `autoExpand` option set.

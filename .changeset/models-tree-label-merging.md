---
"@itwin/presentation-tree-definitions": patch
---

`createModelsTree`: Added `subjects.labelMerging` and `categories.labelMerging` hierarchy configuration options that control whether sibling Subject and Category nodes with the same label are merged into a single node. Both default to `"enable"`, preserving the previous behavior.

```ts
const { definition } = createModelsTree({
  imodelAccess,
  hierarchyConfig: {
    subjects: { labelMerging: "disable" },
    categories: { labelMerging: "disable" },
  },
});
```

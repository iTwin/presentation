---
"@itwin/presentation-tree-definitions": patch
---

`createModelsTree`: Added `subjects.labelMerging`, `models.labelMerging` and `categories.labelMerging` hierarchy configuration options that control whether sibling Subject, Model and Category nodes with the same label are merged into a single node. All default to `"enable"`.

Previously, only Subject and Category nodes were merged by label. Model nodes are now merged as well - set `models.labelMerging` to `"disable"` to keep them separate.

```ts
const { definition } = createModelsTree({
  imodelAccess,
  hierarchyConfig: {
    subjects: { labelMerging: "disable" },
    models: { labelMerging: "disable" },
    categories: { labelMerging: "disable" },
  },
});
```

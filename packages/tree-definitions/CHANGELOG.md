# @itwin/presentation-tree-definitions

## 0.1.1

### Patch Changes

- [#1587](https://github.com/iTwin/presentation/pull/1587): Added `createClassificationsTree` to create configurable classification hierarchies with bound search helpers for labels and instance keys. Added `ClassificationsTreeNode` utilities for identifying and narrowing classifications tree nodes.
- [#1594](https://github.com/iTwin/presentation/pull/1594): Improved models tree and categories tree initial load performance by using the schema provider to validate class support instead of running separate metadata ECSQL queries.
- [#1598](https://github.com/iTwin/presentation/pull/1598): `createModelsTree`: Added `subjects.labelMerging`, `models.labelMerging` and `categories.labelMerging` hierarchy configuration options that control whether sibling Subject, Model and Category nodes with the same label are merged into a single node. All default to `"enable"`.

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

- [#1584](https://github.com/iTwin/presentation/pull/1584): Added `createCategoriesTree` to create configurable 2D or 3D categories hierarchy definitions with bound label search helpers. Added `CategoriesTreeNode` utilities for identifying and narrowing categories tree nodes.
- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.15
  - @itwin/presentation-hierarchies@2.0.0-alpha.20

## 0.1.0

### Minor Changes

- [#1576](https://github.com/iTwin/presentation/pull/1576): Initial release of `@itwin/presentation-tree-definitions`, providing a reusable, UI-independent models tree backed by iModel data. Includes `createModelsTree` for creating configurable hierarchy definitions with search helpers, and `ModelsTreeNode` for identifying subject, model, category, element, and element class grouping nodes.

# @itwin/presentation-tree-definitions

Reusable, UI-independent tree definitions backed by iModel data and built on `@itwin/presentation-hierarchies`. The package provides models, categories, and classifications trees for use in custom tree components and other hierarchy-driven workflows.

Use `createModelsTree` to create a hierarchy definition with configurable root subject visibility, empty model inclusion, element class grouping, and hierarchy level filtering. It also provides helpers for searching by label or locating specific instances in the hierarchy. `ModelsTreeNode` offers type guards and node type identification for subject, model, category, element, and element class grouping nodes.

Use `createCategoriesTree` to create a hierarchy definition for a 2D or 3D view with configurable empty category inclusion, sub-category visibility, and optional elements with class exclusions. It also provides helpers for searching by label. `CategoriesTreeNode` offers type guards and node type identification for definition container, category, sub-category, model, element, and element class grouping nodes.

Use `createClassificationsTree` to create a hierarchy definition with a configurable root classification system and optional element class exclusions. It also provides helpers for searching by label or locating specific instances in the hierarchy. `ClassificationsTreeNode` offers type guards and node type identification for classification table, classification, and geometric element nodes.

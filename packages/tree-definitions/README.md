# @itwin/presentation-tree-definitions

Reusable, UI-independent tree definitions backed by iModel data and built on `@itwin/presentation-hierarchies`. The initial release provides a models tree that organizes subjects, models, categories, and elements for use in custom tree components and other hierarchy-driven workflows.

Use `createModelsTree` to create a hierarchy definition with configurable root subject visibility, empty model inclusion, element class grouping, and hierarchy level filtering. It also provides helpers for searching by label or locating specific instances in the hierarchy. `ModelsTreeNode` offers type guards and node type identification for subject, model, category, element, and element class grouping nodes.

---
"@itwin/presentation-tree-definitions": patch
---

Fix elements of classes, hidden through `HiddenClass` or `HiddenSchema` custom attributes, affecting hierarchies created by `createModelsTree`, `createCategoriesTree` and `createClassificationsTree`. Such elements are no longer taken into account when determining whether nodes have children, or whether subjects, models, categories, definition containers and sub-models have content to display. They are also excluded from search results, together with their descendants, and no longer count towards the search limit.

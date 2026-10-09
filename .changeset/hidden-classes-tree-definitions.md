---
"@itwin/presentation-tree-definitions": patch
---

Fix instances of classes, hidden through `HiddenClass` or `HiddenSchema` custom attributes, affecting hierarchies created by `createModelsTree`, `createCategoriesTree` and `createClassificationsTree`.

- Elements of such classes are no longer taken into account when determining whether nodes have children, or whether subjects, models, categories, definition containers and sub-models have content to display. They are also excluded from search results, together with their descendants, and no longer count towards the search limit.
- Models, definition containers, classification tables and classifications of such classes are no longer displayed, together with their content. They're also no longer taken into account when determining whether their parent nodes have children, and are excluded from search results and paths.
- In `createModelsTree`, elements in models of such classes, private models, or template models no longer count towards the label-search limit.

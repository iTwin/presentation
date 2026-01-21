---
"@itwin/presentation-hierarchies-react": major
---

**Breaking change:** Rename `PresentationHierarchyNode` to `TreeNode` for clarity.

We already have a `HierarchyNode` type in `@itwin/presentation-hierarchies`, so having a `PresentationHierarchyNode` in `@itwin/presentation-hierarchies-react` was causing confusion. Additionally, this change aligns with the naming convention that we try to keep, where "hierarchy" refers to data and "tree" refers to UI components.

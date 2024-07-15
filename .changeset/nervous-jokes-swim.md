---
"@itwin/presentation-hierarchies": minor
---

Fix `autoExpand` prop of grouping specification for `NodesQueryClauseFactory.createSelectClause` being wrongly defined as `string`. Define it as a string union of `"always" | "single-child"`.

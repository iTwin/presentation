---
"@itwin/presentation-shared": minor
---

`ECSql.createRelationshipPathJoinInfo`: Each entry of the returned `steps[]` now exposes selectors for the path step's concrete `ECClassId` — `relationshipClassIdSelector`, `sourceClassIdSelector` (`[sourceAlias].[ECClassId]`) and `targetClassIdSelector` (`[targetAlias].[ECClassId]`). For a link-table step the relationship selector is `[relationshipAlias].[ECClassId]`; for a navigation-property step it is `[ownerAlias].[navigationProperty].[RelECClassId]`. For `outer` joins the relationship and target selectors yield `NULL` when nothing is related.

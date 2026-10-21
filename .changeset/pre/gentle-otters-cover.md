---
"@itwin/presentation-shared": patch
---

`createRelationshipPathJoinClause`: The step `instanceFilter` alias placeholders are now substituted in both their bare (`this.`, `rel.`) and bracket-quoted (`[this].`, `[rel].`) forms.

Previously only the bare form was replaced, so a bracket-quoted placeholder was left referencing a non-existent alias in the generated JOIN `ON` clause.

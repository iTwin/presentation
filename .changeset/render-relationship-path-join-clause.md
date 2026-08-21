---
"@itwin/presentation-shared": patch
---

`createRelationshipPathJoinClause`: The pre-resolved (sync) overload now accepts a rendering-only input — each step only needs its `joins`, plus an optional top-level `bindings` — instead of the full `RelationshipPathJoinInfo` shape. Callers that only need to render JOINs no longer have to supply the unused `relationshipClassIdSelector`, `sourceClassIdSelector`, and `targetClassIdSelector` fields per step.

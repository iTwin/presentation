---
"@itwin/presentation-shared": minor
---

Add `ECSql.createRelationshipPathJoinInfo` that resolves a relationship path into a flat, structured list of join descriptors without producing ECSQL. The returned result lets callers inspect the resolved join structure — e.g. to count the number of join tables without re-reading the schema.

In addition, add a sync `ECSql.createRelationshipPathJoinClause(info)` overload that renders a pre-resolved result of `ECSql.createRelationshipPathJoinInfo` into an ECSQL JOIN clause without any async schema access.

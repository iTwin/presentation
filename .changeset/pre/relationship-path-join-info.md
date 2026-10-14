---
"@itwin/presentation-shared": minor
---

Add `createRelationshipPathJoinInfo` that resolves a relationship path into a flat, structured list of join descriptors without producing ECSQL. The returned result lets callers inspect the resolved join structure — e.g. to count the number of join tables without re-reading the schema.

In addition, add a sync `createRelationshipPathJoinClause(info)` overload that renders a pre-resolved result of `createRelationshipPathJoinInfo` into an ECSQL JOIN clause without any async schema access.

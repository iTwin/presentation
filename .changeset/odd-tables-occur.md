---
"@itwin/presentation-shared": patch
---

Fix `ECSql.createRelationshipPathJoinClause` creating an invalid JOIN clause in case of reversed relationship step that uses a navigation property.

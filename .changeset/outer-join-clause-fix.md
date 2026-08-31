---
"@itwin/presentation-shared": patch
---

`createRelationshipPathJoinClause`: fix produced ECSQL being invalid when joining with `joinType: "outer"`. The produced snippet used `OUTER JOIN`, which ECSQL fails to parse - now it uses `LEFT OUTER JOIN`.

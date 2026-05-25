---
"@itwin/presentation-shared": major
---

**Breaking:** `createRelationshipPathJoinClause` now returns `{ joins: string; bindings?: Record<string, ECSqlBinding> }` instead of a plain `string`. Callers must be updated to read the SQL clause from the `joins` property:

```ts
// Before
const joinClause = await createRelationshipPathJoinClause({ schemaProvider, path });

// After
const { joins: joinClause, bindings } = await createRelationshipPathJoinClause({ schemaProvider, path });
```

`RelationshipPathStep` now accepts an optional `instanceFilter` attribute. When provided, the resolved expression is appended as an `AND` condition to the relevant JOIN's `ON` clause. ECSQL parameter bindings declared in `instanceFilter.bindings` are collected across all steps and returned in the `bindings` field of the result.

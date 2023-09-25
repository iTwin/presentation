---
"@itwin/presentation-components": minor
---

- `null` values will no longer be represented as empty fields in the query builder. Instead, building a query for `null` values will only be possible with `isNull` or `isNotNull` operators.
- Empty strings will be selectable and displayed as _Empty Value_ in the query builder.

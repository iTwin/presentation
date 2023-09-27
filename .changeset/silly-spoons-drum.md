---
"@itwin/presentation-components": minor
---

Property value selector in instance filter builder changes:

- `null` values are no longer represented as empty fields - instead, building a query for `null` values should be done using "**Is Null**" and "**Is Not Null**" operators.
- Empty strings are now selectable and displayed as _Empty Value_ in the selector.

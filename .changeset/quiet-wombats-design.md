---
"@itwin/presentation-components": minor
---

Instance filter builder / dialog: Added unique values selector when using `Equal` or `Not Equal` operators. The component provides a drop-down of values available for selected property.

- `null` values are omitted. `"Is Null"` and `"Is Not Null"` operators should be used instead.
- For empty non `null` values _Empty Value_ option is shown in selector.

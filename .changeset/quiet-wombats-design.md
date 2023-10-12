---
"@itwin/presentation-components": minor
---

`PresentationInstanceFilterDialog`: Added unique values value selector when using `Equal` or `Not Equal` operators. It loads unique property values that are associated with node on which filter is placed.

- `null` values are omitted. `"Is Null"` and `"Is Not Null"` operators should be used instead.
- For empty non `null` values _Empty Value_ option is shown in selector.

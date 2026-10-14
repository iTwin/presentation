---
"@itwin/presentation-shared": minor
---

`Props`: Added support for overloaded functions.

When the given function has multiple overload signatures, `Props` now resolves to the union of the parameter types across all overloads instead of only reflecting the last signature.

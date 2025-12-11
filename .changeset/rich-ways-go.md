---
"@itwin/presentation-shared": minor
"@itwin/presentation-hierarchies": patch
---

Add and use a more robust way to check full class names for equality - `compareFullClassNames` function.

The function compares full class names in case-insensitive way, ignoring different supported schema-class name separators (`:` or `.`).

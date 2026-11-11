---
"@itwin/presentation-shared": minor
---

`StructValueDescriptor`: Add a required `className` property with the full name of the struct class that defines the value's shape, so consumers can identify the struct type without re-reading schema.

This is a breaking change for code that creates `StructValueDescriptor` objects - they now need to specify `className`.

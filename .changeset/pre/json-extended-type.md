---
"@itwin/presentation-shared": minor
---

`PrimitiveValueDescriptor`: Add an `extendedType` property that carries a primitive property's `extendedTypeName` (e.g. `"Json"`, `"BeGuid"`), when set, so consumers can refine how a `type`-typed value should be interpreted without re-reading schema. `@itwin/presentation-content` now populates it for primitive properties.

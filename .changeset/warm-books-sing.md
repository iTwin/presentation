---
"@itwin/presentation-shared": minor
---

Added new public APIs for describing and carrying property values:

- `ValueDescriptor` — a discriminated union (`PrimitiveValueDescriptor | StructValueDescriptor | ArrayValueDescriptor`) that describes the shape of a value without carrying the value itself.
- `StructValue` and `ArrayValue` — composite value types complementing the existing `PrimitiveValue`. `Value` is the new top-level union (`PrimitiveValue | StructValue | ArrayValue | undefined`) that represents any value that can be assigned to an EC instance property.

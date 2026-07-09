---
"@itwin/presentation-shared": minor
---

Added new public APIs for describing and carrying property values:

- `ValueDescriptor` — a discriminated union (`PrimitiveValueDescriptor | StructValueDescriptor | ArrayValueDescriptor | NavigationValueDescriptor`) that describes the shape of a value without carrying the value itself.
- `NavigationValueDescriptor` — describes a navigation property value (a reference to another EC instance). The runtime value stays the referenced instance's id, while this descriptor additionally carries the reference's target class name (`targetClassName`) as metadata.
- `StructValue` and `ArrayValue` — composite value types complementing the existing `PrimitiveValue`. `Value` is the new top-level union (`PrimitiveValue | StructValue | ArrayValue | undefined`) that represents any value that can be assigned to an EC instance property.

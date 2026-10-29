---
"@itwin/presentation-shared": minor
---

Added schema-derived property attributes to metadata and value descriptor types.

- `EC.Property.isReadOnly` tells whether the schema declares the property read-only. It's optional, so metadata providers that don't supply it leave it `undefined`.
- `ArrayValueDescriptor.minOccurs` and `ArrayValueDescriptor.maxOccurs` carry an array's occurrence limits, when constrained.

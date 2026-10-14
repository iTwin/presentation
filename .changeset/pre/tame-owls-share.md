---
"@itwin/presentation-shared": minor
---

`TypedPrimitiveValue.create`: The return type is now narrowed based on the given `type` argument, so the result only exposes the properties valid for that type. For example, creating a value with type `"Point3d"` no longer exposes the `koqName` property.

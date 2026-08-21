---
"@itwin/presentation-core-interop": patch
---

Fix `createECSchemaProvider` to set `EC.Property.class` to the class that declares or contributes the property (the base class for an inherited property, or the mixin for a mixin-contributed property), instead of the class the property was queried or enumerated through.

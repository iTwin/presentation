---
"@itwin/presentation-shared": minor
"@itwin/presentation-core-interop": minor
"@itwin/presentation-hierarchies": patch
---

**Breaking:** `EC` namespace interfaces in `@itwin/presentation-shared` no longer use `Promise` wrappers — once a schema is loaded via the still-async `ECSchemaProvider.getSchema`, all further navigation (`baseClass`, `is()`, `getProperty()`, `getProperties()`, `getDerivedClasses()`, `kindOfQuantity`, `relationshipClass`, `enumeration`, `abstractConstraint`) is synchronous. The `getCustomAttributes()` method has been removed from `EC.Schema`, `EC.Class`, and `EC.Property` and replaced with an `isHidden: boolean` property. `EC.CustomAttributeSet` and `EC.CustomAttribute` types have been removed.

**Breaking:** `createECSchemaProvider` in `@itwin/presentation-core-interop` now force-loads all schema items when constructing an `EC.Schema` from `SchemaContext`, so the synchronous contract can be met.

Added a new `createECSchemaProvider` overload accepting a `SchemaView` instance (from `@itwin/ecschema-metadata`) that naturally provides synchronous access. This overload is marked `@beta`.

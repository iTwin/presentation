---
"@itwin/presentation-shared": major
"@itwin/presentation-core-interop": major
"@itwin/presentation-hierarchies": major
---

`EC` namespace interfaces in `@itwin/presentation-shared` no longer use `Promise` wrappers — once a schema is loaded via the still-async `ECSchemaProvider.getSchema`, all further navigation (`baseClass`, `is()`, `getProperty()`, `getProperties()`, `getDerivedClasses()`, `kindOfQuantity`, `relationshipClass`, `enumeration`, `abstractConstraint`) is synchronous.

Additional changes:

- `createECSchemaProvider` in `@itwin/presentation-core-interop` now force-loads all schema items when constructing an `EC.Schema` from `SchemaContext`, so the synchronous contract can be met.
- The `getCustomAttributes()` method has been removed from `EC.Schema`, `EC.Class`, and `EC.Property` and replaced with an `isHidden: boolean` property. `EC.CustomAttributeSet` and `EC.CustomAttribute` types have been removed.
- Added an optional `EC.Property.category` attribute.
- Added a required `EC.RelationshipConstraint.constraintClasses` attribute.

---
"@itwin/presentation-shared": major
"@itwin/presentation-core-interop": major
"@itwin/presentation-hierarchies": major
---

`EC` namespace interfaces in `@itwin/presentation-shared` no longer use `Promise` wrappers — once a schema is loaded via the still-async `ECSchemaProvider.getSchema`, all further navigation (`baseClass`, `is()`, `getProperty()`, `getProperties()`, `kindOfQuantity`, `relationshipClass`, `enumeration`, `abstractConstraint`) is synchronous.

Additional changes:

- Added an `EC.Class.getOwnProperties()` method that returns only the properties defined on the class itself, without inherited properties.
- Added an `EC.EntityClass.getMixins()` method that returns all mixins applied to the entity class.
- Added an optional `EC.Property.category` attribute.
- Added a required `EC.RelationshipConstraint.constraintClasses` attribute.
- Added missing optional `description` attributes to `EC.Schema` and `EC.Property`.

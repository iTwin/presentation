---
"@itwin/presentation-core-interop": minor
"@itwin/presentation-shared": major
"@itwin/presentation-hierarchies": major
"@itwin/presentation-hierarchies-react": major
---

Add additional requirements for types in `EC` metadata namespace, whose objects are returned by `ECSchemaProvider`.

- `EC.Schema`, `EC.Class` and `EC.Property` now all have an async `getCustomAttributes()` method that returns an `EC.CustomAttributeSet`, allowing consumers to access custom attributes of these schema items.
- `EC.Class` now additionally has these members:
  - `baseClass: Promise<Class | undefined>`
  - `getDerivedClasses(): Promise<Class[]>`

While this is an addition, it's considered a breaking change, because objects of the updated types are expected to be supplied to us by consumers.

In reality, consumers will likely use `@itwin/presentation-core-interop` package for creating them, and the package has been updated to handle the change, so reacting to the breaking change is as simple as bumping the version of `@itwin/presentation-core-interop` package in the consumer's `package.json`.

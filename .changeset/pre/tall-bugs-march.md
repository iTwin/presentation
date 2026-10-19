---
"@itwin/presentation-core-interop": minor
"@itwin/presentation-shared": major
"@itwin/presentation-hierarchies": major
"@itwin/presentation-hierarchies-react": major
---

Add additional `baseClass` and `getDerivedClassNames` members to the `EC.Class` objects, returned by `ECSchemaProvider`.

- `baseClass: EC.Class | undefined`
- `getDerivedClassNames(props?: { onlyDirect?: boolean }): string[]`

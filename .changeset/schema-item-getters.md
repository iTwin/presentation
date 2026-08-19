---
"@itwin/presentation-shared": major
"@itwin/presentation-core-interop": minor
---

`EC.Schema`: Add `getEnumeration`, `getKindOfQuantity` and `getPropertyCategory` getters to expose schema items other than classes.

`EC.Schema`, returned by `ECSchemaProvider.getSchema(...)`, now requires `getEnumeration`, `getKindOfQuantity` and `getPropertyCategory` methods. Consumers that only use `EC.Schema` are unaffected, but custom implementations of the interface must add these getters. Migration example:

```ts
const schema: EC.Schema = {
  name,
  version,
  isHidden,
  getClass: (className) => classes.get(className),
  // added:
  getEnumeration: (enumName) => enumerations.get(enumName),
  getKindOfQuantity: (koqName) => kindOfQuantities.get(koqName),
  getPropertyCategory: (categoryName) => categories.get(categoryName),
};
```

`createECSchemaProvider`: The `EC.Schema` returned by the provider now implements the new getters, giving access to enumerations, kind-of-quantities and property categories in addition to classes. Anyone using the provider to get schemas will now be able to access these additional schema items without any changes to their code.

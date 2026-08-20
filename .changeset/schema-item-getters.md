---
"@itwin/presentation-shared": major
"@itwin/presentation-core-interop": minor
---

Expose access to enumerations, kind-of-quantities and property categories through `EC.Schema`, and extend `EC.KindOfQuantity` with `relativeError` and `persistenceUnit` attributes. Schemas returned by `createECSchemaProvider` now implement the new getters.

- `EC.Schema` now requires `getEnumeration`, `getKindOfQuantity` and `getPropertyCategory` methods (mirroring the existing `getClass`). Consumers that only use `EC.Schema` are unaffected, but custom implementations of the interface must add these getters:

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

- `EC.KindOfQuantity` now requires `relativeError` (`number`) and `persistenceUnit` (`string`) attributes. Custom implementations must provide them.

- `createECSchemaProvider`: The `EC.Schema` returned by the provider now implements the new getters, giving access to enumerations, kind-of-quantities and property categories in addition to classes. Existing code keeps working without changes and can now read these additional schema items:

  ```ts
  const schemaProvider = createECSchemaProvider(imodel);
  const schema = await schemaProvider.getSchema("BisCore");
  const enumeration = schema?.getEnumeration("MySchema.MyEnum");
  const koq = schema?.getKindOfQuantity("MySchema.MyKoq");
  const category = schema?.getPropertyCategory("MySchema.MyCategory");
  ```

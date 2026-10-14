---
"@itwin/presentation-core-interop": major
---

Changed `createECSchemaProvider` to take an object exposing the iModel's `getSchemaView` and `createQueryReader` functions instead of a `SchemaContext`. An `IModelDb` or `IModelConnection` satisfies this shape directly, so you can now pass the iModel itself; you can also pass any object that provides just those two functions.

Typical migration:

```ts
const iModel: IModelDb | IModelConnection = ...;

// previously:
const schemaProvider = createECSchemaProvider(iModel.schemaContext);

// now (pass the iModel directly):
const schemaProvider = createECSchemaProvider(iModel);

// or provide only the required functions:
const schemaProvider = createECSchemaProvider({
  getSchemaView: iModel.getSchemaView.bind(iModel),
  createQueryReader: iModel.createQueryReader.bind(iModel),
});
```

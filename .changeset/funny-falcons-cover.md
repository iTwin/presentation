---
"@itwin/presentation-core-interop": major
---

Changed `createECSchemaProvider` to take an instance of an iModel (either `IModelDb` or `IModelConnection`) instead of a `SchemaContext`.

Migration:

```ts
const iModel: IModelDb | IModelConnection = ...;

// previously:
const schemaProvider = createECSchemaProvider(iModel.schemaContext);

// now:
const schemaProvider = createECSchemaProvider(iModel);
```

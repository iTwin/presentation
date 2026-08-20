---
"@itwin/presentation-core-interop": major
---

`createValueFormatter`: Changed to take a `formatsProvider`, a `unitsProvider` and the iModel instead of a `SchemaContext`.

`SchemaContext` is inefficient on iModels with large domain schemas, so the function no longer depends on it. Sourcing formats from a `FormatsProvider` also lets the consuming application register its own formatting overrides (per organization, per iModel, per user, etc.), achieving cohesive formatting across the whole application - something a bare `SchemaContext` couldn't provide.

Migration: the `schemaContext` prop is removed, provide `formatsProvider`, `unitsProvider` and `imodel` instead:

```ts
// previously:
const formatter = createValueFormatter({ schemaContext: imodel.schemaContext, unitSystem: "metric" });

// now, on the frontend:
const formatter = createValueFormatter({
  formatsProvider: IModelApp.formatsProvider,
  unitsProvider: IModelApp.quantityFormatter,
  imodel,
  unitSystem: "metric",
});
```

On the backend, where there's no `IModelApp`, construct equivalent providers from the iModel's `SchemaContext`, e.g. `formatsProvider: new SchemaFormatsProvider(schemaContext)` and `unitsProvider: new SchemaUnitProvider(schemaContext)` from `@itwin/ecschema-metadata`, ideally caching them per iModel.

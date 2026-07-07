---
"@itwin/presentation-content": minor
---

**Breaking:** `IModelFieldsProvider.getContribution` now receives `imodelAccess` typed `ECSchemaProvider & ECClassHierarchyInspector` (previously `ECSchemaProvider`), so providers can match classes polymorphically via `classDerivesFrom`. Consequently `ResolveContentSourcesProps.imodelAccess` (accepted by `resolveContentSources`) is widened to `ECSqlQueryExecutor & ECSchemaProvider & ECClassHierarchyInspector`.

Implementations of `getContribution` require no change (they receive a superset). Callers of `resolveContentSources` must now pass an `imodelAccess` that also implements `ECClassHierarchyInspector`:

```ts
// before
await resolveContentSources({ imodelAccess: { ...queryExecutor, ...schemaProvider }, targets });

// after
await resolveContentSources({ imodelAccess: { ...queryExecutor, ...schemaProvider, ...classHierarchyInspector }, targets });
```

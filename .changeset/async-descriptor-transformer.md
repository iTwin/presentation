---
"@itwin/presentation-content": minor
---

**Breaking:** `DescriptorTransformer.transform` is now asynchronous and receives `{ descriptor, imodelAccess }` instead of just the descriptor.

The `imodelAccess` (an `ECSchemaProvider & ECClassHierarchyInspector`) lets transformers perform schema and class-hierarchy lookups — for example, matching a class polymorphically via `classDerivesFrom` before adjusting fields. `ContentProviderProps.imodelAccess` is correspondingly widened to require `ECClassHierarchyInspector` so the pipeline can supply it.

Migration — update transformer implementations from:

```ts
transform(descriptor) {
  descriptor.removeField(id);
}
```

to:

```ts
async transform({ descriptor, imodelAccess }) {
  descriptor.removeField(id);
}
```

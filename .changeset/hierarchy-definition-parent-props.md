---
"@itwin/presentation-hierarchies": minor
---

`HierarchyDefinition`: Added type parameters that replace the `parentNode` attribute, which the definition callbacks receive, with custom parent props.

- `TParentProps` specifies the parent props of `defineHierarchyLevel` and `parseNode`, and also of `preProcessNode` and `postProcessNode`, unless `TProcessingParentProps` is specified.
- `TProcessingParentProps` specifies the parent props of `preProcessNode` and `postProcessNode`.

`DefineHierarchyLevelProps`, `NodeParser`, `NodePreProcessor` and `NodePostProcessor` got a similar `TParentProps` type parameter. All of them default to the `parentNode` attribute, so existing definitions are not affected. `DefineHierarchyLevelProps` is now a type alias instead of an interface.

```ts
const definition: HierarchyDefinition<{ path: DeepReadonly<IModelInstanceKey[]> }> = {
  defineHierarchyLevel: async ({ path, createSelectClause }) => [
    // ...
  ],
};
```

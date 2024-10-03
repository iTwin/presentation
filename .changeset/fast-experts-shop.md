---
"@itwin/presentation-hierarchies-react": minor
---

**BREAKING:** A new attribute - `imodelKey` - has been added to `imodelAccess` prop of "use tree" hooks. For the most common case when a hierarchy is built from an `IModelConnection`, it's recommended to use `key` attribute of the connection as this value.

Example:

```ts
function createHierarchyProvider(imodel: IModelConnection) {
  return createIModelHierarchyProvider({
    imodelAccess: {
        imodelKey: imodel.key, // set the newly introduced `imodelKey` attribute
        // ... other iModel access props
    },
    // ... other provider props
  });
}
```

See "Basic example" section in README learning page for the full example.

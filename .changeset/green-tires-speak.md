---
"@itwin/unified-selection": minor
---

Fixed `enableUnifiedSelectionSyncWithIModel` not using (and not being able to use) the underlying hilite set provider of the given custom `CachingHiliteSetProvider`, causing selection synchronization to work incorrectly in cases when items were added or removed to iModel's selection set.

- Introduced `IModelHiliteSetProvider` interface and a factory function `createIModelHiliteSetProvider` that creates an instance of it. Functionality-wise these are very similar to `CachingHiliteSetProvider` and `createCachingHiliteSetProvider` but the new type provides access to the underlying hilite set provider of the given iModel. And the naming better represents the purpose of the type.
- Deprecated `CachingHiliteSetProvider` and `createCachingHiliteSetProvider` in favor of the above.
- For the `enableUnifiedSelectionSyncWithIModel` function, deprecated the `cachingHiliteSetProvider` prop in favor of the newly added `imodelHiliteSetProvider`.

The migration is straightforward:

```typescript
// before:
enableUnifiedSelectionSyncWithIModel({
    imodelAccess,
    selectionStorage,
    activeScopeProvider,
    cachingHiliteSetProvider: createCachingHiliteSetProvider({
        selectionStorage,
        imodelProvider: () => imodelAccess,
        createHiliteSetProvider: () => createMyCustomHiliteSetProvider({ imodelAccess }),
    }),
});


// after:
enableUnifiedSelectionSyncWithIModel({
    imodelAccess,
    selectionStorage,
    activeScopeProvider,
    imodelHiliteSetProvider: createIModelHiliteSetProvider({
        selectionStorage,
        imodelProvider: () => imodelAccess,
        createHiliteSetProvider: () => createMyCustomHiliteSetProvider({ imodelAccess }),
    }),
});
```

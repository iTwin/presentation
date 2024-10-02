---
"@itwin/presentation-hierarchies-react": minor
---

**BREAKING:** The `reloadTree` function attribute returned by "use tree" hooks has been changed to **not** accept a `dataSourceChanged` parameter.

The parameter was used to notify the tree component that the underlying data source has changed and the tree should be reloaded. For example, something like this was necessary:

```tsx
const { reloadTree } = useIModelUnifiedSelectionTree({
    // ...
});

useEffect(() => {
  if (!imodel.isBriefcaseConnection()) {
    return;
  }

  return registerTxnListeners(imodel.txns, () => {
    reloadTree({ dataSourceChanged: true });
  });
}, [imodel, reloadTree]);
```

Now, the `HierarchyProvider` notifies the hook about hierarchy changes.

Note that iModel-based hierarchy providers require an `imodelChanged` event object to be provided and raised when the underlying iModel changes:

```tsx
const [imodelChanged] = useState(new BeEvent<() => void>());
useEffect(() => {
  if (imodel.isBriefcaseConnection()) {
    return registerTxnListeners(imodel.txns, () => imodelChanged.raiseEvent());
  }
  return undefined;
}, [imodel, imodelChanged]);

const { ... } = useIModelUnifiedSelectionTree({
  imodelChanged,
  ...,
});
```

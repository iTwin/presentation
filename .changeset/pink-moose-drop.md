---
"@itwin/presentation-hierarchies-react": minor
---

Added `dataSourceChanged` option to `reloadTree` function retuned by `useTree` and `useUnifiedSelectionTree`. It allows to specify that data used to build the tree might have changed and need to be repulled when reloading the hierarchy.

```ts
import { registerTxnListeners } from "@itwin/presentation-core-interop";

function MyTree({ imodel, ...props}: Props) {
  const { reloadTree, treeProps } = useTree(props);
  useEffect(() => {
    // listen for changes in iModel and reload tree
    return registerTxnListeners(imodel.txns, () => {
      reloadTree({ dataSourceChanged: true });
    });
  }, [imodel, reloadTree]);
  return <TreeRenderer {...treeProps} />;
}
```

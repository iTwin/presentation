---
"@itwin/presentation-hierarchies-react": minor
---

Added `dataMightHaveChanged` option to `reloadTree` function retuned by `useTree` and `useUnifiedSelectionTree`. It allows to specify that data used to build tree might have changed and need to be repulled and tree reloaded.

```ts
import { registerTxnListeners } from "@itwin/presentation-core-interop";

function MyTree({ imodel, ...props}: Props) {
  const { reloadTree, treeProps } = useTree(props);
  useEffect(() => {
    // listen for changes in iModel and reload tree
    return registerTxnListeners(imodel.txns, () => {
      reloadTree({ dataMightHaveChanged: true });
    });
  }, [imodel, reloadTree]);
  return <TreeRenderer {...treeProps} />;
}
```

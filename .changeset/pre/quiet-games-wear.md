---
"@itwin/presentation-hierarchies-react": major
---

Start using tree structure for defining hierarchy search paths.

The expected return type of `useTree` hooks' `getSearchPaths` callback prop has changed from `Promise<HierarchySearchPath[] | undefined>` to `Promise<HierarchySearchTree[] | undefined>`. The newly added `HierarchySearchTree.createFromPathsList` from `@itwin/presentation-hierarchies` can be used to do the conversion:`

```tsx
import { HierarchySearchTree } from "@itwin/presentation-hierarchies";

function MyTree() {
  const [searchText, setSearchText] = useState("");
  const treeProps = useIModelUnifiedSelectionTree({
    // ...
    getSearchPaths: useMemo<UseIModelTreeProps["getSearchPaths"]>(() => {
      return async () => {
        // before
        return getSearchTargetPaths({ searchText }),
        // after
        return HierarchySearchTree.createFromPathsList(await getSearchTargetPaths({ searchText }));
        };
    }, [searchText]),
  });

  // ...

  return (
    <StrataKitTreeRenderer
      {...treeProps.treeRendererProps}
      // ...
    />
  );
}
```

---
"@itwin/presentation-hierarchies-react": major
---

Start using tree structure for defining hierarchy search paths.

The `getFilteredPaths` callback prop of tree hooks (`useTree`, `useUnifiedSelectionTree`, `useIModelTree`, `useIModelUnifiedSelectionTree`) has been renamed to `getSearchPaths`, and its return type changed from `Promise<HierarchyFilteringPath[] | undefined>` to `Promise<HierarchySearchTree[] | undefined>`. The newly added `HierarchySearchTree.createFromPathsList` from `@itwin/presentation-hierarchies` can be used to do the conversion:

```tsx
import { HierarchySearchTree } from "@itwin/presentation-hierarchies";

function MyTree() {
  const [searchText, setSearchText] = useState("");
  const treeProps = useIModelUnifiedSelectionTree({
    // ...
    getSearchPaths: useMemo<UseIModelTreeProps["getSearchPaths"]>(() => {
      return async () => {
        // before: `getFilteredPaths` returned the paths directly:
        //   return getSearchTargetPaths({ searchText });
        // after: convert the paths into a `HierarchySearchTree`:
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

---
"@itwin/presentation-hierarchies-react": major
---

Replaced `actions` property on `TreeNodeRenderer` with `getActions` to match how decorations are handled. Removed `useFilterAction` hook and replaced it with `FilterAction` component.

Before:
```tsx
import { TreeNodeRenderer, useFilterAction } from "@itwin/presentation-hierarchies-react";

const filterAction = useFilterAction({ onFilter, getHierarchyLevelDetails });
return <TreeNodeRenderer
    actions={useMemo(
      () => [
        filterAction,
        (node) => ({
          label: "Custom Action",
          actions: () => log(node.label),
          icon: customIconHref,
        }),
      ],
      [filterAction],
    )}
  />;
```

After:
```tsx
import { Icon, Tree } from "@itwin/itwinui-react";
import { FilterAction, TreeNodeRenderer } from "@itwin/presentation-hierarchies-react";

  return <TreeNodeRenderer
    getActions={useCallback(
      (node) => [
        <FilterAction key="filter" node={node} onFilter={onFilter} getHierarchyLevelDetails={getHierarchyLevelDetails} />,
        <Tree.ItemAction key="customAction" label="Custom action" onClick={() => log(node.label)} icon={<Icon href={customIconHref} />} />,
      ],
      [onFilter, getHierarchyLevelDetails],
    )}
  />;
```

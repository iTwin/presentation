---
"@itwin/presentation-hierarchies-react": minor
---

Replaced `actions` property on `TreeNodeRenderer` with `getActions` to match how decorations are handled. Removed `useFilterAction` hook and replaced it with `FilterAction` component.

Before:
```tsx
import { TreeNodeRenderer, useFilterAction } from "@itwin/presentation-hierarchies-react";

const filterAction = useFilterAction({ onFilter, getHierarchyLevelDetails });
return <TreeNodeRenderer
  actions={[
    filterAction,
    (node) => ({
      label: "Custom Action",
      actions: () => log(node.label),
      icon: customIconHref,
    })
  ]}
/>;
```

After:
```tsx
import { Icon, Tree } from "@itwin/itwinui-react";
import { FilterAction, TreeNodeRenderer } from "@itwin/presentation-hierarchies-react";

return <TreeNodeRenderer
  actions={(node) => [
    <FilterAction key="filter" node={node} onFilter={setFilteringOptions} getHierarchyLevelDetails={treeProps.getHierarchyLevelDetails} />,
    <Tree.ItemAction key="customAction" label="Custom action" onClick={() => log(node.label)} icon={<Icon href={customIconHref} />} />,
  ]}
/>;
```

# Migrating from `1.x` to `2.0`

The `2.0` release of `@itwin/presentation-hierarchies-react` includes a number of breaking changes across the consumer-facing API. Despite the breadth of the changes, upgrading is usually straightforward: most applications only interact with a tree state hook and a single rendering component (`StrataKitTreeRenderer`), which now covers the majority of use cases out of the box.

The most notable changes are:

- **New design system.** The delivered tree rendering components moved from [iTwinUI](https://itwinui.bentley.com/) to [StrataKit](https://github.com/iTwin/stratakit) and [`@mui/material`](https://mui.com/). The `TreeRenderer` / `TreeNodeRenderer` components are replaced by `StrataKitTreeRenderer` and related components.
- **Headless-first entry points.** The root entry point now delivers only the headless hooks and utilities. Rendering components live behind a separate `@itwin/presentation-hierarchies-react/stratakit` entry point.
- **Restructured tree state hook result.** Instead of always returning a flat set of properties, the result of `useTree` (and its variants) now groups the previously top-level rendering props into `treeRendererProps` and `rootErrorRendererProps` prop bags, populated based on the current state.
- **`i18next`-based localization.** Localization no longer takes a `localizedStrings` object. The package now delivers a locale JSON file and resolves strings through a `getLocalizedString` function at runtime.

The sections below describe each area of change with before/after examples.

## Packaging, dependencies, and entry points

In `1.x` the package exposed three entry points, with `@itwin/itwinui-react` as an optional peer dependency:

| `1.x` entry point                               | Description                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `@itwin/presentation-hierarchies-react`         | Full API — all hooks, utilities, and iTwinUI-based components.        |
| `@itwin/presentation-hierarchies-react/core`    | Hooks and utilities only, safe to use without `@itwin/itwinui-react`. |
| `@itwin/presentation-hierarchies-react/itwinui` | iTwinUI-based components only (`TreeRenderer`, `TreeNodeRenderer`).   |

In `2.0` there are two entry points, and the StrataKit packages are optional peer dependencies:

| `2.0` entry point                                 | Requires StrataKit peer dependencies | Description                                                                     |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `@itwin/presentation-hierarchies-react`           | ❌                                   | Core API — headless hooks and utilities, including localization helpers.        |
| `@itwin/presentation-hierarchies-react/stratakit` | ✔️                                   | StrataKit-based components and actions (`StrataKitTreeRenderer`, tree actions). |

To migrate:

- Replace imports of rendering components (`TreeRenderer`, `TreeNodeRenderer`, error renderers, action components) with the StrataKit equivalents imported from `@itwin/presentation-hierarchies-react/stratakit`.
- Keep importing hooks and utilities (`useTree`, `useIModelTree`, `useIModelUnifiedSelectionTree`, localization helpers, etc.) from the root entry point.
- Update peer dependencies in your application's `package.json`:
  - **Remove** `@itwin/itwinui-react` - this package no longer has optional dependency on it. Keep it if other parts of your application still use iTwinUI directly.
  - **Add** `@mui/material` (`^9.4.0`), `@stratakit/mui`, and `@stratakit/foundations`. These are optional peer dependencies required only when using the delivered components.
  - **Bump React** to `^18.0.0 || ^19.0.0` if you are still on React `17` — React `17` is no longer supported.
- **Switch to ESM.** The package no longer ships a CommonJS build and is published as ES modules only. Make sure your application and bundler consume it as ESM; `require("@itwin/presentation-hierarchies-react")` no longer works.
- **Configure your bundler for icons.** The delivered components use icons from `@stratakit/icons` (a direct dependency of this package), which are loaded as asset URLs. Your bundler must be configured to emit `.svg` files rather than inline them — follow the [StrataKit icons bundler configuration guide](https://github.com/iTwin/stratakit/blob/main/packages/icons#bundler-configuration) (Vite, Rsbuild, esbuild, etc.).

```tsx
// before
import { useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { TreeRenderer } from "@itwin/presentation-hierarchies-react/itwinui";

// after
import { useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
```

## Rendering components and tree state hook result

The iTwinUI-based `TreeRenderer` and `TreeNodeRenderer` components have been removed and replaced by `StrataKitTreeRenderer`. The new component is virtualized, handles selection modes, node editing, and error display internally, and requires a `treeLabel` prop for accessibility.

At the same time, the result returned by `useTree`, `useUnifiedSelectionTree`, `useIModelTree`, and `useIModelUnifiedSelectionTree` was reshaped so that all rendering-related props are grouped into prop bags that can be passed directly to the delivered components.

Key changes:

- `rootNodes`, `expandNode`, `isNodeSelected`, `selectNodes`, `getHierarchyLevelDetails`, and `reloadTree` are no longer top-level properties. They now live inside `treeRendererProps`.
- `treeRendererProps` is `undefined` during the initial load and defined once root nodes load successfully.
- When loading root nodes fails, `rootErrorRendererProps` is defined (and `treeRendererProps` is `undefined`); pass it to `StrataKitRootErrorRenderer`.

The recommended order of checks when rendering is:

1. If `rootErrorRendererProps` is defined, render the error state.
2. If `treeRendererProps` is `undefined`, the component is doing the initial load (`treeRendererProps` is `undefined` and `isLoading` is `true`) - render a loading state.
3. Otherwise, `treeRendererProps` is defined and the tree can be rendered. If `isLoading` is also `true`, the hierarchy is reloading in the background (`treeRendererProps` is defined and `isLoading` is `true`). You can either render a loading overlay over the tree or stop rendering the tree while it reloads.

```tsx
// before
import { TreeRenderer } from "@itwin/presentation-hierarchies-react/itwinui";

function MyTreeComponent(/* ... */) {
  const { rootNodes, setFormatter, isLoading, ...state } = useIModelUnifiedSelectionTree({/* ... */});
  if (!rootNodes) {
    return "Loading...";
  }

  return (
    <div style={{ position: "relative" }}>
      {isLoading ? <MyLoadingOverlay /> : null}
      <TreeRenderer {...state} rootNodes={rootNodes} />
    </div>
  );
}

// after
import { StrataKitRootErrorRenderer, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";

function MyTreeComponent(/* ... */) {
  const treeProps = useIModelUnifiedSelectionTree({/* ... */});
  if (treeProps.rootErrorRendererProps) {
    return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
  }

  if (!treeProps.treeRendererProps) {
    return "Loading...";
  }
  return (
    <div style={{ position: "relative" }}>
      {treeProps.isLoading ? <MyLoadingOverlay /> : null}
      <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="My Tree" />
    </div>
  );
}
```

The standalone `TreeNodeRenderer` is no longer exported. Node-level customization is now done through props on `StrataKitTreeRenderer` (see [Customizing node rendering](#customizing-node-rendering)). Similarly, `useSelectionHandler` and `createRenderedTreeNodeData` are no longer exported — selection handling is an internal detail of `StrataKitTreeRenderer`.

### Custom tree renderer

If `StrataKitTreeRenderer` does not fit your needs, you can build a custom renderer from the headless result. `treeRendererProps.rootNodes` holds the hierarchy, and the package exports two helpers from the root entry point to work with it:

- `useFlatTreeItems` flattens the hierarchy into a list suitable for virtualized rendering, including placeholder items for nodes whose children are still loading.
- `useErrorNodes` returns the nodes that carry errors (see [Errors](#errors)), so you can render them separately.

```tsx
import { useErrorNodes, useFlatTreeItems } from "@itwin/presentation-hierarchies-react";
import type { TreeRendererProps } from "@itwin/presentation-hierarchies-react";

function MyCustomTree(treeRendererProps: TreeRendererProps) {
  const { rootNodes, expandNode, selectNodes, isNodeSelected } = treeRendererProps;
  const flatItems = useFlatTreeItems(rootNodes);
  const errorNodes = useErrorNodes(rootNodes);

  return (
    <div>
      {flatItems.map((item) =>
        "node" in item ? (
          <MyTreeItem
            key={item.id}
            node={item.node}
            level={item.level}
            isSelected={isNodeSelected(item.node.id)}
            onExpandToggle={(isExpanded) => expandNode(item.node.id, isExpanded)}
            onSelect={() => selectNodes([item.node.id], "replace")}
          />
        ) : (
          <MyLoadingItem key={item.id} level={item.level} />
        ),
      )}
      {errorNodes.map((node) => (
        <MyErrorItem key={node.id} node={node} />
      ))}
    </div>
  );
}
```

## Node type rename: `PresentationHierarchyNode` → `TreeNode`

The primary node type was renamed from `PresentationHierarchyNode` to `TreeNode`. This avoids confusion with the `HierarchyNode` type from `@itwin/presentation-hierarchies` and aligns with the convention where "hierarchy" refers to data and "tree" refers to UI.

```tsx
// before
import { PresentationHierarchyNode } from "@itwin/presentation-hierarchies-react";
function getDecorations(node: PresentationHierarchyNode) {
  /* ... */
}

// after
import { TreeNode } from "@itwin/presentation-hierarchies-react";
function getDecorations(node: TreeNode) {
  /* ... */
}
```

In `1.x`, `rootNodes` contained a union of real hierarchy nodes and separate informational nodes (`PresentationInfoNode`, e.g. "result set too large" or "no filter matches"), and the `isPresentationHierarchyNode` type guard was used to tell them apart. In `2.0` these informational states are no longer represented as separate nodes — they are carried on the node itself (see [Errors](#errors)) — so both the node union and the `isPresentationHierarchyNode` guard were removed.

The top-level `extendedData` property that `PresentationHierarchyNode` exposed (a duplicate of `nodeData.extendedData`) was also removed. Access it through `TreeNode.nodeData.extendedData` instead.

## Customizing node rendering

In `1.x`, node customization was done through props on `TreeNodeRenderer`. In `2.0`, these are provided through callbacks on `StrataKitTreeRenderer`.

### Icons → decorations

The single `getIcon` prop was removed. Node decorations are now provided through the `getTreeItemProps` callback as a `decorations` `ReactNode`, so you can return multiple elements (an icon, a tag, a color swatch, etc.).

```tsx
// before
<TreeNodeRenderer getIcon={(node) => <Icon href={getIconUri(node)} />} />

// after (as a prop on StrataKitTreeRenderer)
<StrataKitTreeRenderer
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  getTreeItemProps={(node) => ({ decorations: <Icon href={getIconUri(node)} /> })}
/>
```

### Labels, descriptions, and event handlers

Per-node content and DOM event handlers are customized through the `getTreeItemProps` callback on `StrataKitTreeRenderer`, which returns props for the underlying tree item. The node is captured in the callback closure, so you don't get it as a handler argument.

- `label` sets the primary node label (replaces the `1.x` `getLabel` prop). When omitted, the node's `label` is used.
- `description` sets a secondary description shown with the node (replaces the `1.x` `getSublabel` prop).
- `onClick` / `onKeyDown` attach DOM handlers to the row (replace the `1.x` `onNodeClick` / `onNodeKeyDown` props). Selection is handled internally by `StrataKitTreeRenderer`, so these run _in addition_ to selection — you don't need to implement selection yourself.

```tsx
<StrataKitTreeRenderer
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  getTreeItemProps={(node) => ({
    label: <CustomLabel node={node} />,
    description: <CustomSublabel node={node} />,
    onClick: (event) => handleClick(node, event),
    onKeyDown: (event) => handleKeyDown(node, event),
  })}
/>
```

### Actions

In `1.x`, custom row actions were provided through a single `getActions` callback that returned an array of plain action definitions (`{ icon, label, onClick }`), and hierarchy-level filtering was a built-in feature controlled by the `onFilterClick` prop.

In `2.0`, actions are React components rather than definition objects:

- The package delivers `TreeNodeFilterAction` (for hierarchy-level filtering, see [Hierarchy level filtering](#hierarchy-level-filtering)) and `TreeNodeRenameAction` (for renaming, see [Node renaming](#node-renaming)), and you can build custom actions by rendering the `TreeActionBase` component.
- `getActions` was replaced by three callbacks, depending on where the action should appear: `getInlineActions`, `getMenuActions`, and `getContextMenuActions`. Each receives `{ targetNode, selectedNodes }` instead of a single node, so actions can operate on the visible selection.
- `getInlineActions` renders actions directly on the tree row and accepts at most two actions; use `getMenuActions` and `getContextMenuActions` for anything beyond that.

```tsx
// before
import { TreeNodeRenderer } from "@itwin/presentation-hierarchies-react/itwinui";

<TreeNodeRenderer getActions={(node) => [{ icon: myIcon, label: "My action", onClick: () => runAction(node) }]} />;

// after
import { StrataKitTreeRenderer, TreeActionBase } from "@itwin/presentation-hierarchies-react/stratakit";
import type { TreeActionBaseAttributes } from "@itwin/presentation-hierarchies-react/stratakit";
import type { TreeNode } from "@itwin/presentation-hierarchies-react";

function MyTreeAction({
  node,
  selectedNodes,
  ...attributes
}: TreeActionBaseAttributes & { node: TreeNode; selectedNodes: TreeNode[] }) {
  return (
    <TreeActionBase
      {...attributes}
      label="My action"
      icon={myIcon}
      hide={!canRunAction(node)}
      onClick={() => runAction(node, selectedNodes)}
    />
  );
}

<StrataKitTreeRenderer
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  getInlineActions={({ targetNode, selectedNodes }) => [
    <MyTreeAction key="my-action" node={targetNode} selectedNodes={selectedNodes} />,
  ]}
  getContextMenuActions={({ targetNode, selectedNodes }) => [
    <MyTreeAction key="my-action" node={targetNode} selectedNodes={selectedNodes} />,
  ]}
/>;
```

### Hierarchy level filtering

In `1.x`, hierarchy-level filtering was built in and triggered through the `onFilterClick` prop. In `2.0` it is opt-in: render the delivered `TreeNodeFilterAction` as one of the node actions and handle the filtering UI yourself.

`TreeNodeFilterAction` shows a filter button on filterable nodes (with a dot indicator when a filter is active). When clicked, it invokes `onFilter` with the node's `HierarchyLevelDetails`. A common pattern is to store those details in state (which opens a filter dialog), then apply the chosen filter through `HierarchyLevelDetails.setInstanceFilter` when the dialog is confirmed. Pass the same handler to the `filterHierarchyLevel` prop of `StrataKitTreeRenderer` to also surface filtering from the error shown when a hierarchy level exceeds its size limit.

```tsx
import { useState } from "react";
import { StrataKitTreeRenderer, TreeNodeFilterAction } from "@itwin/presentation-hierarchies-react/stratakit";
import type { HierarchyLevelDetails } from "@itwin/presentation-hierarchies-react";

// the details of the hierarchy level currently being filtered drive the filter dialog
const [filteringOptions, setFilteringOptions] = useState<HierarchyLevelDetails>();

return (
  <>
    <StrataKitTreeRenderer
      {...treeProps.treeRendererProps}
      treeLabel="My Tree"
      filterHierarchyLevel={setFilteringOptions}
      getInlineActions={({ targetNode }) => [
        <TreeNodeFilterAction
          key="filter"
          node={targetNode}
          onFilter={setFilteringOptions}
          getHierarchyLevelDetails={treeProps.treeRendererProps.getHierarchyLevelDetails}
        />,
      ]}
    />
    <MyFilterDialog
      isOpen={!!filteringOptions}
      onApply={(filter) => {
        filteringOptions?.setInstanceFilter(filter);
        setFilteringOptions(undefined);
      }}
      onClose={() => setFilteringOptions(undefined)}
    />
  </>
);
```

### Node renaming

Node renaming is a new capability in `2.0`. It is configured via the `getEditingProps` callback on `StrataKitTreeRenderer`: return `undefined` for nodes that do not support renaming, and otherwise return an object with a required `onLabelChanged` callback (and optional `validate` / `labelValidationHint`).

`getEditingProps` only enables editing — it does not add a way to enter rename mode. To let users start renaming from the UI, provide a `TreeNodeRenameAction` through one of the action callbacks (e.g. `getMenuActions`).

```tsx
import { StrataKitTreeRenderer, TreeNodeRenameAction } from "@itwin/presentation-hierarchies-react/stratakit";

<StrataKitTreeRenderer
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  getEditingProps={(node) => {
    if (!nodeSupportsRenaming(node)) {
      return undefined;
    }
    return {
      onLabelChanged: (newLabel) => {
        /* handle label change */
      },
      labelValidationHint: `Allowed are A to Z, 0 to 9, "-" and "_"`,
      validate: (newLabel) => /^[A-Za-z0-9\-_ ]+$/.test(newLabel),
    };
  }}
  getMenuActions={({ targetNode }) => [<TreeNodeRenameAction key="rename" node={targetNode} />]}
/>;
```

Rename mode can also be entered programmatically through the `StrataKitTreeRenderer` ref. `renameNode` takes a predicate, expands and scrolls to the first matching (already loaded) node, and starts editing it, returning `"success"` or `"node-not-found"`.

```tsx
import { useRef } from "react";
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import type { StrataKitTreeRendererAttributes } from "@itwin/presentation-hierarchies-react/stratakit";

const treeRef = useRef<StrataKitTreeRendererAttributes>(null);

// later, e.g. right after creating a new node:
treeRef.current?.renameNode((node) => node.id === newNodeId);

<StrataKitTreeRenderer
  ref={treeRef}
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  getEditingProps={/* ... */}
/>;
```

## Errors

In `1.x`, error and informational states (e.g. "result set too large", "no filter matches", or a failure to load children) were surfaced as separate informational nodes (`PresentationInfoNode`) mixed into `rootNodes`, which you detected with the `isPresentationHierarchyNode` guard.

In `2.0` these states are modeled on the nodes and the hook result instead of as separate tree nodes:

- Node-level errors are carried on the node itself through `TreeNode.errors: ErrorInfo[]`, rather than being separate nodes in the tree. The optional `getTreeNodeErrors` callback on the tree state hooks lets you attach custom `ErrorInfo[]` to a node.
- A node can carry multiple errors, and all of them are listed in the tree's error region (the delivered renderer emits one entry per error). The tree row itself is flagged with an error indicator linked to the first error. Errors detected internally are ordered before any custom errors you attach via `getTreeNodeErrors`. The `ResultSetTooLarge`, `NoFilterMatches`, and `ChildrenLoad` error types are produced internally - custom errors should use `type: "Unknown"` (a `GenericErrorInfo`). A node with errors is not expandable unless every error is a `type: "Unknown"` error with `isNodeExpandable: true`, so any internal error type keeps the node non-expandable.
- Root-level load failures (when the root hierarchy level fails to load) are surfaced through the `rootErrorRendererProps` prop bag returned by the tree state hooks; pass it to `StrataKitRootErrorRenderer` (see [Rendering components and tree state hook result](#rendering-components-and-tree-state-hook-result)).

## Hierarchy search

The prop used to display a subset of the hierarchy was renamed and its return type changed to a tree structure.

- `getFilteredPaths` was renamed to `getSearchPaths`.
- The expected return type changed from `Promise<HierarchyFilteringPath[] | undefined>` to `Promise<HierarchySearchTree[] | undefined>`.
- For a small number of paths, use `HierarchySearchTree.createFromPathsList` from `@itwin/presentation-hierarchies` to convert an existing list of paths.
- For a large number of paths, prefer `HierarchySearchTree.createBuilder`, which builds the tree incrementally and avoids materializing an intermediate array.

```tsx
import { HierarchySearchTree } from "@itwin/presentation-hierarchies";

const treeProps = useIModelUnifiedSelectionTree({
  /* ... */
  getSearchPaths: useMemo(() => {
    return async () => {
      // before:
      return getSearchTargetPaths({ searchText });

      // after (small number of paths):
      return HierarchySearchTree.createFromPathsList(await getSearchTargetPaths({ searchText }));
    };
  }, [searchText]),
});
```

For a large number of paths, build the tree with the builder instead, accepting one path at a time:

```tsx
import { HierarchySearchTree } from "@itwin/presentation-hierarchies";

const getSearchPaths = useMemo(() => {
  return async () => {
    const builder = HierarchySearchTree.createBuilder();
    for (const path of await getSearchTargetPaths({ searchText })) {
      builder.accept({ path });
    }
    return builder.getTree();
  };
}, [searchText]);
```

To highlight the matching text in the displayed node labels, use the `useNodeHighlighting` hook from the root entry point. It returns a `getLabel` function that you pass to `StrataKitTreeRenderer` through `getTreeItemProps`:

```tsx
import { useNodeHighlighting } from "@itwin/presentation-hierarchies-react";
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";

const { getLabel } = useNodeHighlighting({ highlightText: searchText });

<StrataKitTreeRenderer
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  getTreeItemProps={(node) => ({ label: getLabel(node) })}
/>;
```

## Unified selection

The unified selection tree hooks now require a `selectionStorage` prop and no longer fall back to a React context.

- `UnifiedSelectionProvider` was removed.
- `selectionStorage` is now a required prop on `useUnifiedSelectionTree` and `useIModelUnifiedSelectionTree`.

```tsx
// before — selection storage could be provided through context
<UnifiedSelectionProvider storage={selectionStorage}>
  <MyTree />
</UnifiedSelectionProvider>;

// after — pass selection storage directly to the hook
const treeProps = useIModelUnifiedSelectionTree({
  selectionStorage,
  sourceName: "MyTreeComponent",
  imodelAccess,
  getHierarchyDefinition,
});
```

## Localization

Localization was reworked to use an [`i18next`](https://www.i18next.com/)-compatible approach. Instead of passing a `localizedStrings` object, the package now delivers an English locale JSON file and resolves strings through a `getLocalizedString` function at runtime.

- `LocalizationContextProvider` no longer accepts a `localizedStrings` object. It now requires a `localization` prop — an object with a `getLocalizedString(key: string): string` method (compatible with `Localization` from `@itwin/core-common`).
- The tree state hooks and rendering components no longer accept a `localizedStrings` prop.
- `LOCALIZATION_NAMESPACES` must be registered with your localization provider during application initialization.
- If you don't wrap your tree in `LocalizationContextProvider`, nothing throws — the default context resolves every string to its key (e.g. `loading` instead of `Loading...`). If you do supply a provider but don't register `LOCALIZATION_NAMESPACES`, the behavior for missing namespaces is determined by your `getLocalizedString` implementation and may differ (returning the key, returning an empty string, throwing, etc.).
- The package ships its English locale file at `lib/public/locales/en/PresentationHierarchies_1.0.json` (namespace `PresentationHierarchies_1.0`). Configure your bundler to copy this asset to the location from which your `Localization` implementation loads namespaces.

```tsx
// before
const localizedStrings = {
  unspecified: "Unspecified",
  other: "Other",
  loading: "Loading...",
  // ...
};

function MyTreeComponent({ imodelAccess }: { imodelAccess: IModelAccess }) {
  const { rootNodes, expandNode } = useIModelUnifiedSelectionTree({
    /* ... */
    localizedStrings,
  });
  // ...
  return (
    <TreeRenderer
      rootNodes={rootNodes}
      expandNode={expandNode}
      localizedStrings={localizedStrings}
      onFilterClick={() => {}}
    />
  );
}

// after
import {
  LOCALIZATION_NAMESPACES,
  LocalizationContextProvider,
  useIModelTree,
} from "@itwin/presentation-hierarchies-react";
import { StrataKitRootErrorRenderer, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";

// during application initialization, register the namespaces delivered by the package
// with your localization provider (e.g. `IModelApp.localization`)
for (const namespace of LOCALIZATION_NAMESPACES) {
  await localization.registerNamespace(namespace);
}

function LocalizedTree({ imodelAccess }: { imodelAccess: IModelAccess }) {
  return (
    <LocalizationContextProvider localization={localization}>
      <MyTreeComponent imodelAccess={imodelAccess} />
    </LocalizationContextProvider>
  );
}

function MyTreeComponent({ imodelAccess }: { imodelAccess: IModelAccess }) {
  const treeProps = useIModelTree({ imodelAccess, getHierarchyDefinition });
  if (treeProps.rootErrorRendererProps) {
    return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
  }
  if (!treeProps.treeRendererProps || treeProps.isLoading) {
    return "Loading...";
  }
  return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="My Tree" />;
}
```

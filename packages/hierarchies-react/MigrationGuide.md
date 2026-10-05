# Migrating from `1.x` to `2.0`

The `2.0` release of `@itwin/presentation-hierarchies-react` includes a number of breaking changes across the consumer-facing API. Despite the breadth of the changes, upgrading is usually straightforward: most applications only interact with a tree state hook and a single rendering component (`StrataKitTreeRenderer`), which now covers the majority of use cases out of the box.

The most notable changes are:

- **New design system.** The delivered tree rendering components moved from [iTwinUI](https://itwinui.bentley.com/) to [StrataKit](https://github.com/iTwin/stratakit) and [`@mui/material`](https://mui.com/). The `TreeRenderer` / `TreeNodeRenderer` components are replaced by `StrataKitTreeRenderer` and related components.
- **Headless-first entry points.** The root entry point now delivers only the headless hooks and utilities. Rendering components live behind a separate `@itwin/presentation-hierarchies-react/stratakit` entry point.
- **Restructured tree state hook result.** The result of `useTree` (and its variants) no longer exposes `rootNodes` / `isLoading` directly; instead it returns `treeRendererProps` and `rootErrorRendererProps` prop bags.
- **`i18next`-based localization.** Localization no longer takes a `localizedStrings` object. The package now delivers a locale JSON file and resolves strings through a `getLocalizedString` function at runtime.

The sections below describe each area of change with before/after examples.

## Package dependencies and entry points

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
  - **Remove** `@itwin/itwinui-react`.
  - **Add** `@mui/material` (`^9.4.0`), `@stratakit/mui`, and `@stratakit/foundations`. These are optional peer dependencies required only when using the delivered components.
- **Configure your bundler for icons.** The delivered components use icons from `@stratakit/icons` (a direct dependency of this package), which are loaded as asset URLs. Your bundler must be configured to emit `.svg` files rather than inline them — follow the [StrataKit icons bundler configuration guide](https://github.com/iTwin/stratakit/blob/main/packages/icons#bundler-configuration) (Vite, Rsbuild, esbuild, etc.).

```tsx
// before
import { useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { TreeRenderer } from "@itwin/presentation-hierarchies-react/itwinui";

// after
import { useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
```

## Rendering components: iTwinUI → StrataKit

The iTwinUI-based `TreeRenderer` and `TreeNodeRenderer` components have been removed and replaced by `StrataKitTreeRenderer`. The new component is virtualized, handles selection modes, node editing, and error display internally, and requires a `treeLabel` prop for accessibility.

```tsx
// before
import { TreeRenderer } from "@itwin/presentation-hierarchies-react/itwinui";

function MyTreeComponent(/* ... */) {
  const { rootNodes, setFormatter, isLoading, ...state } = useIModelUnifiedSelectionTree({/* ... */});
  if (!rootNodes) {
    return "Loading...";
  }
  return <TreeRenderer {...state} rootNodes={rootNodes} />;
}

// after
import { StrataKitRootErrorRenderer, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";

function MyTreeComponent(/* ... */) {
  const treeProps = useIModelUnifiedSelectionTree({/* ... */});
  if (treeProps.rootErrorRendererProps) {
    return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
  }
  if (!treeProps.treeRendererProps || treeProps.isReloading) {
    return "Loading...";
  }
  return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="My Tree" />;
}
```

The standalone `TreeNodeRenderer` is no longer exported. Node-level customization is now done through props on `StrataKitTreeRenderer` (see [Customizing node rendering](#customizing-node-rendering)). Similarly, `useSelectionHandler` and `createRenderedTreeNodeData` are no longer exported — selection handling is an internal detail of `StrataKitTreeRenderer`.

## Tree state hook result shape

The result returned by `useTree`, `useUnifiedSelectionTree`, `useIModelTree`, and `useIModelUnifiedSelectionTree` was reshaped so that all rendering-related props are grouped into prop bags that can be passed directly to the delivered components.

Key changes:

- `rootNodes`, `expandNode`, `isNodeSelected`, `selectNodes`, `getHierarchyLevelDetails`, and `reloadTree` are no longer top-level properties. They now live inside `treeRendererProps`.
- `treeRendererProps` is `undefined` during the initial load and defined once root nodes load successfully.
- When loading root nodes fails, `rootErrorRendererProps` is defined (and `treeRendererProps` is `undefined`); pass it to `StrataKitRootErrorRenderer`.
- `isLoading` was renamed to `isReloading` and applies only to background reloads, not the initial load.
- `getNode` and `setFormatter` remain top-level properties.

The recommended order of checks when rendering is:

1. If `rootErrorRendererProps` is defined, render the error state.
2. If `treeRendererProps` is `undefined`, the component is doing the initial load — render a loading state.
3. Otherwise, render the tree. `isReloading` may also be `true`, indicating a background reload; use it to show a loading overlay on top of the tree rather than replacing the tree with a loading state.

```tsx
// before
const { rootNodes, expandNode, isNodeSelected, selectNodes, isLoading } = useTree({/* ... */});
if (!rootNodes) {
  return "Loading...";
}
return (
  <TreeRenderer
    rootNodes={rootNodes}
    expandNode={expandNode}
    isNodeSelected={isNodeSelected}
    selectNodes={selectNodes}
  />
);

// after
const treeProps = useTree({/* ... */});
if (treeProps.rootErrorRendererProps) {
  return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
}
if (!treeProps.treeRendererProps) {
  return "Loading...";
}
return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="My Tree" />;
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

### Actions

In `1.x`, custom row actions were provided through a single `getActions` callback that returned an array of plain action definitions (`{ icon, label, onClick }`), and hierarchy-level filtering was a built-in feature controlled by the `onFilterClick` prop.

In `2.0`, actions are React components rather than definition objects:

- The package delivers `TreeNodeFilterAction` (for hierarchy-level filtering) and `TreeNodeRenameAction`, and you can build custom actions by rendering the `TreeActionBase` component.
- `getActions` was replaced by three callbacks, depending on where the action should appear: `getInlineActions`, `getMenuActions`, and `getContextMenuActions`. Each receives `{ targetNode, selectedNodes }` instead of a single node, so actions can operate on the whole selection.

```tsx
// before
import { TreeNodeRenderer } from "@itwin/presentation-hierarchies-react/itwinui";

<TreeNodeRenderer
  onFilterClick={(hierarchyLevelDetails) => openFilterDialog(hierarchyLevelDetails)}
  getActions={(node) => [{ icon: myIcon, label: "My action", onClick: () => runAction(node) }]}
/>;

// after
import { StrataKitTreeRenderer, TreeNodeFilterAction } from "@itwin/presentation-hierarchies-react/stratakit";

<StrataKitTreeRenderer
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  getInlineActions={({ targetNode }) => [
    <TreeNodeFilterAction
      key="filter"
      node={targetNode}
      onFilter={onFilter}
      getHierarchyLevelDetails={treeProps.treeRendererProps.getHierarchyLevelDetails}
    />,
  ]}
/>;
```

### Node renaming

Node renaming is a new capability in `2.0`. It is provided through the `TreeNodeRenameAction` component and configured via the `getEditingProps` callback on `StrataKitTreeRenderer`. `getEditingProps` must return `undefined` for nodes that do not support renaming, and otherwise return an object with a required `onLabelChanged` callback (and optional `validate` / `labelValidationHint`).

```tsx
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
/>
```

## Errors

In `1.x`, error and informational states (e.g. "result set too large", "no filter matches", or a failure to load children) were surfaced as separate informational nodes (`PresentationInfoNode`) mixed into `rootNodes`, which you detected with the `isPresentationHierarchyNode` guard.

In `2.0` these states are modeled on the nodes and the hook result instead of as separate tree nodes:

- Node-level errors are carried on the node itself through `TreeNode.errors: ErrorInfo[]`, rather than being separate nodes in the tree. The optional `getTreeNodeErrors` callback on the tree state hooks lets you attach custom `ErrorInfo[]` to a node.
- Root-level load failures (when the root hierarchy level fails to load) are surfaced through the `rootErrorRendererProps` prop bag returned by the tree state hooks; pass it to `StrataKitRootErrorRenderer` (see [Tree state hook result shape](#tree-state-hook-result-shape)).

## Hierarchy search

The prop used to display a subset of the hierarchy was renamed and its return type changed to a tree structure.

- `getFilteredPaths` was renamed to `getSearchPaths`.
- The expected return type changed from `Promise<HierarchySearchPath[] | undefined>` to `Promise<HierarchySearchTree[] | undefined>`. Use `HierarchySearchTree.createFromPathsList` from `@itwin/presentation-hierarchies` to convert an existing list of paths.

```tsx
import { HierarchySearchTree } from "@itwin/presentation-hierarchies";

const treeProps = useIModelUnifiedSelectionTree({
  /* ... */
  getSearchPaths: useMemo<UseIModelTreeProps["getSearchPaths"]>(() => {
    return async () => {
      // before: return getSearchTargetPaths({ searchText });
      // after:
      return HierarchySearchTree.createFromPathsList(await getSearchTargetPaths({ searchText }));
    };
  }, [searchText]),
});
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
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";

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
```

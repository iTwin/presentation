# @itwin/presentation-hierarchies-react

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/presentation-hierarchies-react` package provides APIs for building a headless UI for rendering tree components based on data in an [iTwin.js iModel](https://www.itwinjs.org/learning/imodels/#imodel-overview). In addition, it delivers a set of [StrataKit](https://www.npmjs.com/package/@stratakit/bricks)-based components for rendering the tree.

**Upgrading from `1.x`?** `2.0` contains breaking changes. Read the [`1.x` to `2.0` migration guide](./learning/Migration_v1_v2.md) - or hand it to your AI assistant - before updating to understand what needs to change in your code.

## Entry points

Because StrataKit packages are optional peer dependencies, the package exposes two entry points:

| Entry point                                       | Requires StrataKit peer dependencies | Description                                                                                                       |
| ------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `@itwin/presentation-hierarchies-react`           | ❌                                   | Core API - headless hooks and utilities, including localization helpers.                                          |
| `@itwin/presentation-hierarchies-react/stratakit` | ✔️                                   | StrataKit-based components and actions (`StrataKitTreeRenderer`, `TreeNodeFilterAction`, `TreeNodeRenameAction`). |

## Headless UI

### Tree state hooks

The package provides different flavors of the same hook for creating and managing state of a tree component:

| Feature \ Hook                                                                                       | `useTree` | `useIModelTree` | `useUnifiedSelectionTree` | `useIModelUnifiedSelectionTree` |
| ---------------------------------------------------------------------------------------------------- | --------- | --------------- | ------------------------- | ------------------------------- |
| Supported data source                                                                                | any       | iModel          | any                       | iModel                          |
| Integration with [Unified Selection](https://www.itwinjs.org/presentation/unified-selection/) system | ❌        | ❌              | ✔️                        | ✔️                              |

All these hooks return a `UseTreeResult` object with top-level properties and two optional renderer prop bags:

- `isLoading` is a boolean that is `true` while a tree load is in progress, including the initial load. When `treeRendererProps` is also defined, it indicates a background reload.

- `getNode` function to get a tree node by its id.

- `setFormatter` function to set the active node label formatter.

- `rootErrorRendererProps` is defined (and `treeRendererProps` is `undefined`) when root nodes fail to load. Pass it directly to `StrataKitRootErrorRenderer` or use it to build a custom error UI.

- `treeRendererProps` is defined once root nodes have loaded successfully. It is `undefined` during the initial load. Pass it directly to `StrataKitTreeRenderer` or use it to build a custom tree renderer. It contains:
  - `rootNodes` — array of `TreeNode` items to render.
  - `expandNode` — function to expand or collapse a node.
  - `isNodeSelected` and `selectNodes` — functions to inspect and change tree selection.
  - `getHierarchyLevelDetails` — function to get details of a specific hierarchy level (size limit, instance filter, instance key iterator).
  - `reloadTree` — function to reload part of the tree, optionally keeping its state.

#### `useTree` props

The hook takes a single required prop:

- `getHierarchyProvider` is a factory function that creates a hierarchy provider, returning the hierarchy the tree component will render. The `@itwin/presentation-hierarchies` package describes the concept of hierarchy provider [in more detail](https://github.com/iTwin/presentation/blob/master/packages/hierarchies/README.md#hierarchy-providers).

#### `useUnifiedSelectionTree` props

In addition to [props required by `useTree`](#usetree-props), the hook additionally requires:

- `selectionStorage` - unified selection storage used across different app's components, allowing them all to share selection state.
- `sourceName` - a string that distinguishes selection changes being made by different components. The value should be unique for each component.

#### `useIModelTree` props

The hook takes 2 required properties:

- `imodelAccess` provides access to iModel's data and metadata, required to build the hierarchy. Generally, `@itwin/presentation-core-interop` and `@itwin/presentation-shared` packages are used to create this object:

  <!-- [[include: [Presentation.HierarchiesReact.iModelAccess.Imports, Presentation.HierarchiesReact.iModelAccess], tsx]] -->
  <!-- BEGIN EXTRACTION -->

  ```tsx
  import { IModelConnection } from "@itwin/core-frontend";
  import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
  import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";

  function createIModelAccess(imodel: IModelConnection) {
    const schemaProvider = createECSchemaProvider(imodel);
    return {
      imodelKey: createIModelKey(imodel),
      ...schemaProvider,
      // the second argument is the maximum number of rows the executor will return - this allows us to
      // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
      ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
    };
  }
  ```

  <!-- END EXTRACTION -->

- `getHierarchyDefinition` is a factory function that creates a hierarchy definition, describing the hierarchy the tree component will render. The `@itwin/presentation-hierarchies` package describes the concept of hierarchy definitions [in more detail](https://github.com/iTwin/presentation/blob/master/packages/hierarchies/learning/imodel/HierarchyDefinition.md).

#### `useIModelUnifiedSelectionTree` props

In addition to [props required by `useIModelTree`](#useimodeltree-props), the hook additionally requires:

- `selectionStorage` - unified selection storage used across different app's components, allowing them all to share selection state.
- `sourceName` - a string that distinguishes selection changes being made by different components. The value should be unique for each component.

## StrataKit components

While the package provides a headless UI, it also delivers a set of [StrataKit](https://www.npmjs.com/package/@stratakit/bricks)-based components for rendering the tree, which should cover the majority of use cases. Consumers using the components below are required to provide compatible `@mui/material`, `@stratakit/foundations`, and `@stratakit/mui` packages, which are optional peer dependencies of this package.

Our components use icons from [`@stratakit/icons`](https://www.npmjs.com/package/@stratakit/icons), which is a direct dependency of this package. Because `@stratakit/icons` loads icons as asset URLs, your bundler must be configured to emit `.svg` files rather than inline them. Follow the [StrataKit icons bundler configuration guide](https://www.npmjs.com/package/@stratakit/icons#bundler-configuration) to set this up for your bundler (Vite, esbuild, etc.). This configuration is only required when importing the components from `@itwin/presentation-hierarchies-react/stratakit`; applications using only the headless APIs from the root entry point do not need it.

### `StrataKitTreeRenderer`

The component renders a virtualized tree using the `Tree` component from `@stratakit/structures`. It handles node selection modes, error display, and virtualized scrolling. It accepts a required `treeLabel` prop (used for accessibility) and spreads `treeRendererProps` returned by the tree state hooks.

## Full example

<!-- [[include: [Presentation.HierarchiesReact.iModelAccess.Imports, Presentation.HierarchiesReact.SelectionStorage.Imports, Presentation.HierarchiesReact.CustomTreeExample.Imports, Presentation.HierarchiesReact.iModelAccess, Presentation.HierarchiesReact.SelectionStorage, Presentation.HierarchiesReact.CustomTreeExample], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { useEffect, useState } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { StrataKitRootErrorRenderer, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import { Props } from "@itwin/presentation-shared";
import { createStorage, SelectionStorage } from "@itwin/unified-selection";

function createIModelAccess(imodel: IModelConnection) {
  const schemaProvider = createECSchemaProvider(imodel);
  return {
    imodelKey: createIModelKey(imodel),
    ...schemaProvider,
    // the second argument is the maximum number of rows the executor will return - this allows us to
    // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
    ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
  };
}

// Not part of the package - this should be created once and reused across different components of the application.
const unifiedSelectionStorage = createStorage();

/** Component providing the selection storage and access to iModel. Usually this is done in a top-level component. */
function MyTreeComponent({ imodel }: { imodel: IModelConnection }) {
  const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
  useEffect(() => {
    setIModelAccess(createIModelAccess(imodel));
  }, [imodel]);

  if (!imodelAccess) {
    return null;
  }

  return <MyTreeComponentInternal imodelAccess={imodelAccess} selectionStorage={unifiedSelectionStorage} />;
}

type IModelAccess = Props<typeof useIModelUnifiedSelectionTree>["imodelAccess"];

// The hierarchy definition describes the hierarchy using ECSQL queries; here it just returns all `BisCore.PhysicalModel` instances
function getHierarchyDefinition(): HierarchyDefinition {
  return {
    defineHierarchyLevel: async ({ createSelectClause }) => [
      {
        fullClassName: "BisCore.PhysicalModel",
        query: {
          ecsql: `
            SELECT
              ${await createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: { of: { classAlias: "this", className: "BisCore.PhysicalModel" } },
                hasChildren: false,
              })}
            FROM BisCore.PhysicalModel this
          `,
        },
      },
    ],
  };
}

/** Internal component that creates and renders tree state. */
function MyTreeComponentInternal({
  imodelAccess,
  selectionStorage,
}: {
  imodelAccess: IModelAccess;
  selectionStorage: SelectionStorage;
}) {
  const treeProps = useIModelUnifiedSelectionTree({
    // the unified selection storage used by all app components let them share selection state
    selectionStorage,
    // the source name is used to distinguish selection changes being made by different components
    sourceName: "MyTreeComponent",
    // iModel access is used to build the hierarchy
    imodelAccess,
    // supply the hierarchy definition
    getHierarchyDefinition,
  });
  if (treeProps.rootErrorRendererProps) {
    return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
  }
  if (!treeProps.treeRendererProps || treeProps.isLoading) {
    return "Loading...";
  }

  return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="My Tree" />;
}
```

<!-- END EXTRACTION -->

## Customizing the tree

`StrataKitTreeRenderer` exposes a set of callbacks for customizing how nodes are rendered and interacted with. The examples below focus on the customization-specific parts - plug them into the tree setup from the [full example](#full-example) (the `treeProps` come from the tree state hook). Each snippet lists the imports it needs.

### Custom node rendering

The `getTreeItemProps` callback returns per-node rendering props. Use `decorations` to render one or more elements before the label (icons, badges, etc.), and `label` / `description` to override the node's text:

<!-- [[include: [Presentation.HierarchiesReact.Features.RendererImport, Presentation.HierarchiesReact.Features.DecorationImports, Presentation.HierarchiesReact.Features.CustomNodeRendering], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import { Badge } from "@mui/material";
import { Icon } from "@stratakit/mui";

import folderSvg from "@stratakit/icons/folder.svg";

// Customize per-node rendering through the `getTreeItemProps` callback. `decorations` accepts any
// `ReactNode`, so you can render multiple elements before the label (an icon, a text tag, etc.), and
// `label`/`description` override the node's text.
<StrataKitTreeRenderer
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  getTreeItemProps={(node) => ({
    // Render several decorations before the label by returning multiple elements - here an icon
    // and a badge with a text label.
    decorations: (
      <>
        <Icon href={folderSvg} />
        <Badge color="primary" badgeContent="Model" />
      </>
    ),
    label: node.label,
  })}
/>;
```

<!-- END EXTRACTION -->

### Node actions

Node actions are React components provided through three callbacks, depending on where they should appear: `getInlineActions` (rendered directly on the node, at most two), `getMenuActions` (the overflow menu), and `getContextMenuActions` (the right-click menu). Each callback receives the `targetNode` and the current `selectedNodes`. Build custom actions by rendering `TreeActionBase`, and use the delivered `TreeNodeRenameAction` for the built-in node renaming feature:

<!-- [[include: [Presentation.HierarchiesReact.Features.RendererImport, Presentation.HierarchiesReact.Features.ActionImports, Presentation.HierarchiesReact.Features.CustomAction, Presentation.HierarchiesReact.Features.Actions], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import { TreeActionBase } from "@itwin/presentation-hierarchies-react/stratakit";

import type { TreeNode } from "@itwin/presentation-hierarchies-react";
import type { TreeActionBaseAttributes } from "@itwin/presentation-hierarchies-react/stratakit";

// Build a custom action by rendering `TreeActionBase`. Forward `TreeActionBaseAttributes` so the action
// renders correctly in every context (inline, overflow menu, context menu). The `icon` is only shown when
// the action is rendered as an icon button.
function MyLogAction({
  node,
  selectedNodes,
  ...attributes
}: TreeActionBaseAttributes & { node: TreeNode; selectedNodes: TreeNode[] }) {
  return (
    <TreeActionBase
      {...attributes}
      label="Log node"
      icon={<span className="my-action-icon" aria-hidden={true} />}
      onClick={() => console.log("Clicked node:", node, "Selection:", selectedNodes)}
    />
  );
}

// Row actions are provided through three callbacks, depending on where they should appear. Each receives
// the `targetNode` and the current `selectedNodes`.
<StrataKitTreeRenderer
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  // Rendered directly on the row (at most two).
  getInlineActions={({ targetNode, selectedNodes }) => [
    <MyLogAction key="log" node={targetNode} selectedNodes={selectedNodes} />,
  ]}
  // Rendered in the overflow (ellipsis) menu on the row.
  getMenuActions={({ targetNode, selectedNodes }) => [
    <MyLogAction key="log" node={targetNode} selectedNodes={selectedNodes} />,
  ]}
  // Rendered in the context menu opened by right-clicking the row.
  getContextMenuActions={({ targetNode, selectedNodes }) => [
    <MyLogAction key="log" node={targetNode} selectedNodes={selectedNodes} />,
  ]}
/>;
```

<!-- END EXTRACTION -->

### Node renaming

Node renaming is enabled per node through the `getEditingProps` callback (return `undefined` for nodes that cannot be renamed). Users enter rename mode through the delivered `TreeNodeRenameAction`:

<!-- [[include: [Presentation.HierarchiesReact.Features.RendererImport, Presentation.HierarchiesReact.Features.RenameActionImport, Presentation.HierarchiesReact.Features.Renaming], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import { TreeNodeRenameAction } from "@itwin/presentation-hierarchies-react/stratakit";

// Enable node renaming through the `getEditingProps` callback. Return `undefined` for nodes that cannot be
// renamed. Users enter rename mode through `TreeNodeRenameAction`.
<StrataKitTreeRenderer
  {...treeProps.treeRendererProps}
  treeLabel="My Tree"
  getEditingProps={(node) => ({
    onLabelChanged: (newLabel) => console.log(`Renamed "${node.label}" to "${newLabel}"`),
    validate: (newLabel) => newLabel.trim().length > 0,
    labelValidationHint: "Label must not be empty",
  })}
  getMenuActions={({ targetNode }) => [<TreeNodeRenameAction key="rename" node={targetNode} />]}
/>;
```

<!-- END EXTRACTION -->

Renaming can also be started programmatically through the renderer ref's `renameNode` method, which enters rename mode for the first node matching a predicate:

<!-- [[include: [Presentation.HierarchiesReact.Features.RendererImport, Presentation.HierarchiesReact.Features.RenamingImports, Presentation.HierarchiesReact.Features.ProgrammaticRenaming, Presentation.HierarchiesReact.Features.ProgrammaticRenamingRenderer], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { useRef } from "react";
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";

import type { StrataKitTreeRendererAttributes } from "@itwin/presentation-hierarchies-react/stratakit";

// Hold a ref to the renderer and call `renameNode` to enter rename mode for the first node matching the
// predicate. The node must already be loaded; collapsed parents are expanded and the node is scrolled
// into view.
const treeRef = useRef<StrataKitTreeRendererAttributes>(null);
const renameMyModel = () => treeRef.current?.renameNode((node) => node.label === "My Model A");

// Wire the ref to the renderer and trigger `renameMyModel` from your own UI. `getEditingProps` must
// enable editing for the node you want to rename.
<>
  <button onClick={renameMyModel}>Rename model</button>
  <StrataKitTreeRenderer
    {...treeProps.treeRendererProps}
    ref={treeRef}
    treeLabel="My Tree"
    getEditingProps={(node) => ({
      onLabelChanged: (newLabel) => console.log(`Renamed "${node.label}" to "${newLabel}"`),
    })}
  />
</>;
```

<!-- END EXTRACTION -->

### Custom errors

Custom errors are attached to nodes through the `getTreeNodeErrors` callback on the tree state hook, using the `"Generic"` type (the `ResultSetTooLarge`, `NoFilterMatches`, and `ChildrenLoad` types are produced internally). A generic error only needs a `message` (and optionally `isNodeExpandable`), and the delivered renderer displays it with a link to the node - the same way it renders the internally produced types. Attach an `additionalData` payload to carry structured context, then customize rendering through the `errorRenderer` prop: delegate to `TreeErrorRenderer` and provide a `renderError` callback that renders your own `unstable_ErrorRegion.Item` for your errors and falls back to the delivered `ErrorItemRenderer` for everything else (keeping the default message and node link):

<!-- [[include: [Presentation.HierarchiesReact.Features.HookImports, Presentation.HierarchiesReact.Features.RendererImport, Presentation.HierarchiesReact.Features.ErrorImports, Presentation.HierarchiesReact.Features.ErrorRendering], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { useTree } from "@itwin/presentation-hierarchies-react";
import { StrataKitRootErrorRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import { ErrorItemRenderer, TreeErrorRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import { Link, Typography } from "@mui/material";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";

import type { ComponentProps } from "react";

// The payload your application attaches to a node's error through `additionalData`. Carry whatever the
// renderer needs to recognize the error and build its UI - here a discriminating `type` and the affected object.
interface MyError {
  type: "resource-not-supported";
  object: { displayName: string };
}
function isMyError(data: unknown): data is MyError {
  return !!data && typeof data === "object" && "type" in data && data.type === "resource-not-supported";
}

// Builds the message shown in the error region: the object's label as a link that scrolls to the node,
// followed by the error message.
function ErrorMessage({ label, message, scrollToItem }: { label: string; message: string; scrollToItem: () => void }) {
  return (
    <Typography>
      <Link component="button" type="button" onClick={scrollToItem}>
        {label}
      </Link>
      {`: ${message}`}
    </Typography>
  );
}

// A custom error item renderer. For your own `"Generic"` errors it renders a custom
// `unstable_ErrorRegion.Item`; everything else - including the default message and node link - is
// delegated to the delivered `ErrorItemRenderer`.
function MyErrorItemRenderer(props: ComponentProps<typeof ErrorItemRenderer>) {
  const { error } = props;
  if (error.type === "Generic" && isMyError(error.additionalData)) {
    const { object } = error.additionalData;
    const message = (
      <ErrorMessage
        label={object.displayName}
        message={error.message}
        scrollToItem={() => props.scrollToNode(props.treeNode)}
      />
    );
    return <ErrorRegion.Item messageId={props.treeNode.id} message={message} />;
  }
  return <ErrorItemRenderer {...props} />;
}

// Attach the error through `getTreeNodeErrors` and plug the custom renderer in through `errorRenderer`,
// delegating to `TreeErrorRenderer` with a `renderError` callback.
function TreeWithCustomErrors() {
  const treeProps = useTree({
    getHierarchyProvider,
    getTreeNodeErrors: (node) => [
      {
        id: `${node.label}-error`,
        type: "Generic",
        message: "This resource is not supported",
        isNodeExpandable: true,
        additionalData: {
          type: "resource-not-supported",
          object: { displayName: node.label },
        } satisfies MyError,
      },
    ],
  });
  if (treeProps.rootErrorRendererProps) {
    return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
  }
  if (!treeProps.treeRendererProps || treeProps.isLoading) {
    return "Loading...";
  }
  return (
    <StrataKitTreeRenderer
      {...treeProps.treeRendererProps}
      treeLabel="My Tree"
      errorRenderer={(errorProps) => (
        <TreeErrorRenderer
          {...errorProps}
          renderError={(errorItemProps) => <MyErrorItemRenderer {...errorItemProps} />}
        />
      )}
    />
  );
}
```

<!-- END EXTRACTION -->

## Localization

This package delivers a locale JSON file with English strings that follows the [`i18next JSON format`](https://www.i18next.com/misc/json-format). To enable localization, register `LOCALIZATION_NAMESPACES` during initialization and wrap components in `LocalizationContextProvider`.

Import the localization and tree APIs:

<!-- [[include: [Presentation.HierarchiesReact.Localization.Tree.Imports, Presentation.HierarchiesReact.Localization.TreeRenderer.Imports], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import {
  LOCALIZATION_NAMESPACES,
  LocalizationContextProvider,
  useIModelTree,
} from "@itwin/presentation-hierarchies-react";
import { StrataKitRootErrorRenderer, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
```

<!-- END EXTRACTION -->

Register the localization namespaces with your localization provider during application initialization:

<!-- [[include: Presentation.HierarchiesReact.Localization.RegisterNamespaces, tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
// Register the localization namespaces delivered by the package with your localization provider
// (e.g. `IModelApp.localization`) during application initialization.
for (const namespace of LOCALIZATION_NAMESPACES) {
  await localization.registerNamespace(namespace);
}
```

<!-- END EXTRACTION -->

Wrap the tree components with `LocalizationContextProvider`:

<!-- [[include: Presentation.HierarchiesReact.Localization.Tree, tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
// Wrap the tree components with `LocalizationContextProvider`, passing the same localization provider
// used to register the namespaces. The provider resolves the package's localized strings at runtime.
type IModelAccess = Props<typeof useIModelTree>["imodelAccess"];
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
    return "Loading";
  }
  return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="Localized tree" />;
}
```

<!-- END EXTRACTION -->

`LocalizationContextProvider` accepts a `localization` prop — an object with a `getLocalizedString(key: string): string` method. It is designed to work with the `Localization` interface from `@itwin/core-common`, but a custom implementation can be used as well by providing an object with a custom `getLocalizedString` function. The provider uses it internally to resolve translation keys prefixed with localization namespace.

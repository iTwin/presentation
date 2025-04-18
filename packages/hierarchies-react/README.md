# @itwin/presentation-hierarchies-react

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/presentation-hierarchies-react` package provides APIs for building a headless UI for rendering tree components based on data in an [iTwin.js iModel](https://www.itwinjs.org/learning/imodels/#imodel-overview). In addition, it delivers a set of [iTwinUI](https://itwinui.bentley.com/)-based components for rendering the tree.

## Headless UI

### Tree state hooks

The package provides different flavors of the same hook for creating and managing state of a tree component:

| Feature \ Hook                                                                                       | `useTree` | `useIModelTree` | `useUnifiedSelectionTree` | `useIModelUnifiedSelectionTree` |
| ---------------------------------------------------------------------------------------------------- | --------- | --------------- | ------------------------- | ------------------------------- |
| Supported data source                                                                                | any       | iModel          | any                       | iModel                          |
| Integration with [Unified Selection](https://www.itwinjs.org/presentation/unified-selection/) system | ❌        | ❌              | ✔️                        | ✔️                              |

All these hooks return the same state object, which contains properties and functions to manage the tree component:

- `isLoading` is a boolean indicating whether the root tree nodes are being loaded. Set to `true` on initial load and on reload (e.g. when iModel data changes).

- `rootNodes` is an array of root tree nodes and is what the component should render. There are several types of nodes:

  - A `PresentationHierarchyNode` is the primary type of node, created based on the hierarchy definition. The `isPresentationHierarchyNode` type guard utility may be used to check if a node is of this type.
  - A `PresentationInfoNode` is a non-expandable, non-selectable informational type of node, generally created when for some reason we don't have any real nodes to show. There may be different reasons like filtered-out nodes, too large result set, a network error, etc. The `type` attribute of the node indicates that.

- `expandNode` function to expand or collapse a node.

- `isNodeSelected` and `selectNodes` function to inspect and change tree selection.

- `getNode` function to get node by its id.

- `getHierarchyLevelDetails` function to access details of a specific hierarchy level. The returned object provides access to:

  - hierarchy level size limit,
  - hierarchy level instance filter,
  - instance keys of the nodes in the hierarchy level.

- `reloadTree` function to reload part of the tree, optionally keeping its state.

- `setFormatter` function to set active node label formatter.

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
  import { SchemaContext } from "@itwin/ecschema-metadata";
  import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
  import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
  import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
  import { createLimitingECSqlQueryExecutor, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";

  // Not really part of the package, but we need SchemaContext to create the tree state. It's
  // recommended to cache the schema context and reuse it across different application's components to
  // avoid loading and storing same schemas multiple times.
  const imodelSchemaContextsCache = new Map<string, SchemaContext>();

  function getIModelSchemaContext(imodel: IModelConnection) {
    const imodelKey = createIModelKey(imodel);
    let context = imodelSchemaContextsCache.get(imodelKey);
    if (!context) {
      context = new SchemaContext();
      context.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
      imodelSchemaContextsCache.set(imodelKey, context);
      imodel.onClose.addListener(() => imodelSchemaContextsCache.delete(imodelKey));
    }
    return context;
  }

  function createIModelAccess(imodel: IModelConnection) {
    const schemaProvider = createECSchemaProvider(getIModelSchemaContext(imodel));
    return {
      imodelKey: createIModelKey(imodel),
      ...schemaProvider,
      // while caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
      ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
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

### `useSelectionHandler` hook

This is a React hook that helps implement different selection modes in a tree, whose state is managed through one of the [tree state hooks](#tree-state-hooks).

It takes 3 required properties:

- `rootNodes` and `selectNodes` are the corresponding properties from the tree state object, created using one of the [tree state hooks](#tree-state-hooks).

- `selectionMode` is a string that defines the selection mode. It can be one of the following values:
  - `none` - no selection is allowed,
  - `single` - only one node can be selected at a time,
  - `extended` - multiple nodes can be selected using shift and ctrl keys,
  - `multiple` - multiple nodes can be selected without using shift or ctrl keys.

The returned object contains 2 functions, that should be called by the node renderer: `onNodeClick` and `onNodeKeyDown`.

Our [tree renderer implementation](#treerenderer) calls this hook and passes the callbacks to the [node renderer](#treenoderenderer), so there's no need to use it unless implementing a custom tree renderer.

## iTwinUI components

While the package provides a headless UI, it also delivers a set of [iTwinUI](https://itwinui.bentley.com/)-based components for rendering the tree, which should cover majority of use cases. Consumers using the below components are required to provide a compatible `@itwin/itwinui-react` package, which is an optional peer dependency to this package.

### `TreeRenderer`

The component is based on [iTwinUI Tree component](https://itwinui.bentley.com/docs/tree) and uses our [`TreeNodeRenderer`](#treenoderenderer) to render the nodes. In addition, it makes use of the [`useSelectionHandler` hook](#useselectionhandler-hook) to add selection modes' support.

The iTwinUI Tree component requires a `getNode` function that maps nodes to `NodeData<TNode>` objects. Our `TreeRenderer` uses `createRenderedTreeNodeData` function for this purpose, and it's available for consumers as well, in case a custom iTwinUI Tree component implementation is being written.

### `TreeNodeRenderer`

The component is based on `TreeNode` component from iTwinUI library and supports the following features:

- Rendering informational type of nodes (e.g. "No filter matches", "Too many nodes in a hierarchy level", etc.).
- Reporting click and key down events for use with [`useSelectionHandler` hook](#useselectionhandler-hook).
- Icons, selection, expand / collapse.
- Action buttons to clear / set hierarchy level instance filter.

## Full example

<!-- [[include: [Presentation.HierarchiesReact.iModelAccess.Imports, Presentation.HierarchiesReact.CustomTreeExample.Imports, Presentation.HierarchiesReact.SelectionStorage.Imports, Presentation.HierarchiesReact.iModelAccess, Presentation.HierarchiesReact.SelectionStorage, Presentation.HierarchiesReact.CustomTreeExample], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";

import { createBisInstanceLabelSelectClauseFactory, Props } from "@itwin/presentation-shared";

import { TreeRenderer, useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { createStorage, SelectionStorage } from "@itwin/unified-selection";
import { useEffect, useState } from "react";

// Not really part of the package, but we need SchemaContext to create the tree state. It's
// recommended to cache the schema context and reuse it across different application's components to
// avoid loading and storing same schemas multiple times.
const imodelSchemaContextsCache = new Map<string, SchemaContext>();

function getIModelSchemaContext(imodel: IModelConnection) {
  const imodelKey = createIModelKey(imodel);
  let context = imodelSchemaContextsCache.get(imodelKey);
  if (!context) {
    context = new SchemaContext();
    context.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    imodelSchemaContextsCache.set(imodelKey, context);
    imodel.onClose.addListener(() => imodelSchemaContextsCache.delete(imodelKey));
  }
  return context;
}

function createIModelAccess(imodel: IModelConnection) {
  const schemaProvider = createECSchemaProvider(getIModelSchemaContext(imodel));
  return {
    imodelKey: createIModelKey(imodel),
    ...schemaProvider,
    // while caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
    ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
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
function getHierarchyDefinition({ imodelAccess }: { imodelAccess: IModelAccess }): HierarchyDefinition {
  // Create a factory for building labels SELECT query clauses according to BIS conventions
  const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
  // Create a factory for building nodes SELECT query clauses in a format understood by the provider
  const nodesQueryFactory = createNodesQueryClauseFactory({ imodelAccess, instanceLabelSelectClauseFactory: labelsQueryFactory });
  return {
    defineHierarchyLevel: async () => [
      {
        fullClassName: "BisCore.PhysicalModel",
        query: {
          ecsql: `
            SELECT
              ${await nodesQueryFactory.createSelectClause({
                ecClassId: { selector: "this.ECClassId" },
                ecInstanceId: { selector: "this.ECInstanceId" },
                nodeLabel: {
                  selector: await labelsQueryFactory.createSelectClause({ classAlias: "this", className: "BisCore.PhysicalModel" }),
                },
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
function MyTreeComponentInternal({ imodelAccess, selectionStorage }: { imodelAccess: IModelAccess; selectionStorage: SelectionStorage }) {
  const { rootNodes, setFormatter, isLoading, ...state } = useIModelUnifiedSelectionTree({
    // the unified selection storage used by all app components let them share selection state
    selectionStorage,
    // the source name is used to distinguish selection changes being made by different components
    sourceName: "MyTreeComponent",
    // iModel access is used to build the hierarchy
    imodelAccess,
    // supply the hierarchy definition
    getHierarchyDefinition,
  });
  if (!rootNodes) {
    return "Loading...";
  }
  return <TreeRenderer {...state} rootNodes={rootNodes} />;
}
```

<!-- END EXTRACTION -->

## Localization

Localization can be enabled for `TreeRenderer` component and [tree state hooks](#tree-state-hooks) by providing an object with localized strings that will be used instead of the default English ones.

Example:

<!-- [[include: [Presentation.HierarchiesReact.Localization.CommonImports, Presentation.HierarchiesReact.Localization.Tree.Imports, Presentation.HierarchiesReact.Localization.Strings, Presentation.HierarchiesReact.Localization.Tree], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { Props } from "@itwin/presentation-shared";

import { useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";

type IModelAccess = Props<typeof useIModelUnifiedSelectionTree>["imodelAccess"];

const localizedStrings = {
  // strings for the `useIModelUnifiedSelectionTree` hook
  unspecified: "Unspecified",
  other: "Other",

  // strings for `TreeRenderer` and `TreeNodeRenderer`
  loading: "Loading...",
  filterHierarchyLevel: "Apply hierarchy filter",
  clearHierarchyLevelFilter: "Clear active filter",
  noFilteredChildren: "No child nodes match current filter",
  resultLimitExceeded: "There are more items than allowed limit of {{limit}}.",
  resultLimitExceededWithFiltering: "Please provide <link>additional filtering</link> - there are more items than allowed limit of {{limit}}.",
  increaseHierarchyLimit: "<link>Increase the hierarchy level size limit to {{limit}}.</link>",
  increaseHierarchyLimitWithFiltering: "Or, <link>increase the hierarchy level size limit to {{limit}}.</link>",
};

function MyTreeComponent({ imodelAccess }: { imodelAccess: IModelAccess }) {
  const { rootNodes, expandNode } = useIModelUnifiedSelectionTree({
    sourceName: "MyTreeComponent",
    imodelAccess,
    localizedStrings,
    getHierarchyDefinition,
  });
  if (!rootNodes) {
    return localizedStrings.loading;
  }
  return <TreeRenderer rootNodes={rootNodes} expandNode={expandNode} localizedStrings={localizedStrings} onFilterClick={() => {}} />;
}
```

<!-- END EXTRACTION -->

In case the `TreeNodeRenderer` component is used within a custom tree renderer, the tree component should supply localized strings through `LocalizationContextProvider`:

<!-- [[include: [Presentation.HierarchiesReact.Localization.CommonImports, Presentation.HierarchiesReact.Localization.TreeRenderer.Imports, Presentation.HierarchiesReact.Localization.TreeRenderer], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { Props } from "@itwin/presentation-shared";

import { ComponentPropsWithoutRef, useCallback } from "react";
import { Tree } from "@itwin/itwinui-react";
import {
  createRenderedTreeNodeData,
  LocalizationContextProvider,
  RenderedTreeNode,
  TreeNodeRenderer,
  TreeRenderer,
} from "@itwin/presentation-hierarchies-react";

type TreeProps = ComponentPropsWithoutRef<typeof Tree<RenderedTreeNode>>;
type TreeRendererProps = Props<typeof TreeRenderer>;

function MyTreeRenderer({ rootNodes }: TreeRendererProps) {
  const nodeRenderer = useCallback<TreeProps["nodeRenderer"]>((nodeProps) => {
    return <TreeNodeRenderer {...nodeProps} onFilterClick={() => {}} expandNode={() => {}} />;
  }, []);

  const getNode = useCallback<TreeProps["getNode"]>((node) => createRenderedTreeNodeData(node, () => false), []);

  return (
    <LocalizationContextProvider localizedStrings={localizedStrings}>
      <Tree<RenderedTreeNode> data={rootNodes} nodeRenderer={nodeRenderer} getNode={getNode} enableVirtualization={true} />
    </LocalizationContextProvider>
  );
}
```

<!-- END EXTRACTION -->

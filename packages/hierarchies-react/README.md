# @itwin/presentation-hierarchies-react

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/presentation-hierarchies-react` package provides APIs for building a headless UI for rendering tree components based on data in an [iTwin.js iModel](https://www.itwinjs.org/learning/imodels/#imodel-overview). In addition, it delivers a set of [iTwinUI](https://itwinui.bentley.com/)-based components for rendering the tree.

## Headless UI

### `useTree`

This is a React hook that creates state for a tree component.

It takes 2 required properties:

- `imodelAccess` provides access to iModel's data and metadata, required to build the hierarchy. Generally, `@itwin/presentation-core-interop` and `@itwin/presentation-shared` packages are used to create this object:

  ```tsx
  import { IModelConnection } from "@itwin/core-frontend";
  import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
  import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
  import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";

  function createIModelAccess(imodel: IModelConnection) {
    const schemaProvider = createECSchemaProvider(getIModelSchemaContext(imodel));
    return {
      ...schemaProvider,
      // while caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
      ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
      // the second argument is the maximum number of rows the executor will return - this allows us to
      // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
      ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
    };
  }
  ```

- `getHierarchyDefinition` is a factory function that creates a hierarchy definition, describing the hierarchy the tree component will render. The `@itwin/presentation-hierarchies` package describes the concept of hierarchy definitions [in more detail](https://github.com/iTwin/presentation/blob/master/packages/hierarchies/README.md#hierarchy-definition).

The resulting state object contains the following properties:

- `isLoading` is a boolean indicating whether the root tree nodes are being loaded. Set to `true` on initial load and on reload (e.g. when iModel data changes).

- `rootNodes` is an array of root tree nodes and is what the component should render. There are several types of nodes:

  - A `PresentationHierarchyNode` is the primary type of node, created based on the hierarchy definition. The `isPresentationHierarchyNode` type guard utility may be used to check if a node is of this type.
  - A `PresentationInfoNode` is a non-expandable, non-selectable informational type of node, generally created when for some reason we don't have any real nodes to show. There may be different reasons like filtered-out nodes, too large result set, a network error, etc. The `type` attribute of the node indicates that.

- `expandNode` function to expand or collapse a node.

- `isNodeSelected` and `selectNodes` function to inspect and change tree selection.

- `getHierarchyLevelDetails` function to access details of a specific hierarchy level. The returned object provides access to:

  - hierarchy level size limit,
  - hierarchy level instance filter,
  - instance keys of the nodes in the hierarchy level.

- `reloadTree` function to reload the tree, optionally keeping its state, after an iModel data change.

- `setFormatter` function to set active node label formatter.

### `useSelectionHandler`

This is React hook that helps implement different selection modes in tree, whose state is managed through the `useTree` or `useUnifiedSelectionTree` hooks.

It takes 3 required properties:

- `rootNodes` and `selectNodes` are the corresponding properties from the tree state object, created using `useTree` or `useUnifiedSelectionTree` hook.

- `selectionMode` is a string that defines the selection mode. It can be one of the following values:
  - `none` - no selection is allowed,
  - `single` - only one node can be selected at a time,
  - `extended` - multiple nodes can be selected using shift and ctrl keys,
  - `multiple` - multiple nodes can be selected without using shift or ctrl keys.

The returned object contains 2 functions, that should be called by the node renderer: `onNodeClick` and `onNodeKeyDown`.

Our [tree renderer implementation](#treerenderer) calls this hook and passes the callbacks to the [node renderer](#treenoderenderer), so there's no need to use it unless implementing a custom tree renderer.

### `useUnifiedSelectionTree` & `UnifiedSelectionProvider`

The package delivers a variation of [`useTree`](#usetree), that automatically hooks tree selection into the [Unified Selection](https://www.itwinjs.org/learning/unified-selection/) system. It takes the same properties as [`useTree`](#usetree), plus a couple of additional ones:

- `imodelKey` is a string that uniquely identifies the iModel the tree is associated with. It's used to distinguish selection changes between different iModels. Generally, the value is obtained using `IModelConnection.key` getter.

- `sourceName` is a string that distinguishes selection changes being made by different components. It's used to avoid conflicts between different components that use the same iModel and the same selection storage. The value should be unique for each component.

The returned result is identical to the one from [`useTree`](#usetree).

The hook also relies on unified selection storage being provided to it through a React context. For that, the package delivers the `UnifiedSelectionProvider` component, that should wrap the tree component, using the `useUnifiedSelectionTree` hook:

```tsx
import { UnifiedSelectionProvider, useUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { createStorage } from "@itwin/unified-selection";

// Unified selection storage should be created once per application and reused across components.
const selectionStorage = createStorage();

/** The top-level application component sets up the unified selection context. */
function MyApplication(props: MyApplicationProps) {
  return (
    <UnifiedSelectionProvider storage={selectionStorage}>
      <MyTreeComponent {...props} />
    </UnifiedSelectionProvider>
  );
}

/** The tree component calls `useUnifiedSelectionTree` that uses unified selection context. */
function MyTreeComponent(props: MyTreeComponentProps) {
  const state = useUnifiedSelectionTree(props);
  return <MyTreeRenderer {...state} />;
}
```

## iTwinUI components

While the package provides a headless UI, it also delivers a set of [iTwinUI](https://itwinui.bentley.com/)-based components for rendering the tree, which should cover majority of use cases. Consumers using the below components are required to provide a compatible `@itwin/itwinui-react` package, which is an optional peer dependency to this package.

### `TreeRenderer`

The component is based on [iTwinUI Tree component](https://itwinui.bentley.com/docs/tree) and uses our [`TreeNodeRenderer`](#treenoderenderer) to render the nodes. In addition, it makes use of the [`useSelectionHandler` hook](#useselectionhandler) to add selection modes' support.

The iTwinUI Tree component requires a `getNode` function that maps nodes to `NodeData<TNode>` objects. Our `TreeRenderer` uses `createRenderedTreeNodeData` function for this purpose, and it's available for consumers as well, in case a custom iTwinUI Tree component implementation is being written.

### `TreeNodeRenderer`

The component is based on `TreeNode` component from iTwinUI library and supports the following features:

- Rendering informational type of nodes (e.g. "No filter matches", "Too many nodes in a hierarchy level", etc.).
- Reporting click and key down events for use with [`useSelectionHandler` hook](#useselectionhandler).
- Icons, selection, expand / collapse.
- Action buttons to clear / set hierarchy level instance filter.

## Full example

```tsx
import { useEffect, useState } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import {
  isPresentationHierarchyNode,
  PresentationTreeNode,
  UnifiedSelectionProvider,
  useUnifiedSelectionTree,
  TreeRenderer,
} from "@itwin/presentation-hierarchies-react";
import { createBisInstanceLabelSelectClauseFactory, createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createStorage } from "@itwin/unified-selection";

// Not really part of the package, but we need SchemaContext to create the tree state. It's
// recommended to cache the schema context and reuse it across different application's components to
// avoid loading and storing same schemas multiple times.
const imodelSchemaContextsCache = new Map<string, SchemaContext>();
function getIModelSchemaContext(imodel: IModelConnection) {
  let context = imodelSchemaContextsCache.get(imodel.key);
  if (!context) {
    context = new SchemaContext();
    context.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    imodelSchemaContextsCache.set(imodel.key, context);
    imodel.onClose.addListener(() => imodelSchemaContextsCache.delete(imodel.key));
  }
  return context;
}

// Not part of the package - this should be created once and reused across different components of the application.
const selectionStorage = createStorage();

/** The top level component sets up access to the iModel and unified selection. */
export function MyTreeComponent({ imodel }: { imodel: IModelConnection }) {
  const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
  useEffect(() => {
    const schemaProvider = createECSchemaProvider(getIModelSchemaContext(imodel));
    setIModelAccess({
      ...schemaProvider,
      // while caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
      ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
      // the second argument is the maximum number of rows the executor will return - this allows us to
      // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
      ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
    });
  }, [imodel]);

  if (!imodelAccess) {
    return null;
  }

  return (
    <UnifiedSelectionProvider storage={selectionStorage}>
      <MyTreeComponentInternal imodelKey={imodel.key} imodelAccess={imodelAccess} />
    </UnifiedSelectionProvider>
  );
}
type IModelAccess = Parameters<typeof useUnifiedSelectionTree>[0]["imodelAccess"];

/** Internal component that defines the hierarchy and creates tree state. */
function MyTreeComponentInternal({ imodelAccess, imodelKey }: { imodelAccess: IModelAccess; imodelKey: string }) {
  // Create a factory for building nodes SELECT query clauses in a format understood by the provider
  const [nodesQueryFactory] = useState(createNodesQueryClauseFactory({ imodelAccess }));
  // Create a factory for building labels SELECT query clauses according to BIS conventions
  const [labelsQueryFactory] = useState(createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }));

  const { rootNodes, ...state } = useUnifiedSelectionTree({
    // the source name is used to distinguish selection changes being made by different components
    sourceName: "MyTreeComponent",
    // the iModel key is required for unified selection system to distinguish selection changes between different iModels
    imodelKey,
    // iModel access is used to build the hierarchy
    imodelAccess,
    // the hierarchy definition describes the hierarchy using ECSQL queries; here it just returns all bis.Model instances
    // grouped by class
    getHierarchyDefinition: () => ({
      defineHierarchyLevel: async () => [
        {
          fullClassName: "BisCore.Model",
          query: {
            ecsql: `
              SELECT
                ${await nodesQueryFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: {
                    selector: await labelsQueryFactory.createSelectClause({ classAlias: "this", className: "BisCore.Model" }),
                  },
                  grouping: {
                    byClass: true,
                  },
                  hasChildren: false,
                })}
              FROM BisCore.Model this
              WHERE this.ParentModel IS NULL
            `,
          },
        },
      ],
    }),
  });
  if (!rootNodes) {
    return "Loading...";
  }
  return <TreeRenderer rootNodes={rootNodes} {...state} />;
}
```

## Localization

Localization can be enabled for `TreeRenderer` component and `useTree` and `useUnifiedSelectionTree` hooks by providing an object with localized strings that will be used instead of the default english ones.

Example:

```tsx
const treeRendererLocalizedStrings = {
  loading: "Loading...",
  filterHierarchyLevel: "Apply filter",
  clearHierarchyLevelFilter: "Clear active filter",
  noFilteredChildren: "No child nodes match current filter",
  resultLimitExceeded: "There are more items than allowed limit of {{limit}}.",
  resultLimitExceededWithFiltering: "Please provide <link>additional filtering</link> - there are more items than allowed limit of {{limit}}.",
  increaseHierarchyLimit: "<link>Increase the hierarchy level size limit to {{limit}}.</link>",
  increaseHierarchyLimitWithFiltering: "Or, <link>increase the hierarchy level size limit to {{limit}}.</link>",
};

const hierarchyProviderLocalizedStrings = {
  unspecified: "Unspecified",
  other: "Other",
};

function MyTreeComponent({ imodelAccess, imodelKey }: { imodelAccess: IModelAccess; imodelKey: string }) {
  const { rootNodes, ...state } = useUnifiedSelectionTree({
    sourceName: "MyTreeComponent",
    imodelKey,
    imodelAccess,
    localizedStrings: hierarchyProviderLocalizedStrings,
    getHierarchyDefinition: () => ({
      defineHierarchyLevel: async () => [],
    }),
  });
  if (!rootNodes) {
    return "Loading...";
  }
  return <TreeRenderer rootNodes={rootNodes} localizedStrings={treeRendererLocalizedStrings} {...state} />;
}
```

To enable localization for a custom `TreeNodeRenderer` component, the localized strings should be supplied through `LocalizationContextProvider`:

```tsx
const localizedStrings = {
  loading: "Loading...",
  filterHierarchyLevel: "Apply filter",
  clearHierarchyLevelFilter: "Clear active filter",
  noFilteredChildren: "No child nodes match current filter",
  resultLimitExceeded: "There are more items than allowed limit of {{limit}}.",
  resultLimitExceededWithFiltering: "Please provide <link>additional filtering</link> - there are more items than allowed limit of {{limit}}.",
  increaseHierarchyLimit: "<link>Increase the hierarchy level size limit to {{limit}}.</link>",
  increaseHierarchyLimitWithFiltering: "Or, <link>increase the hierarchy level size limit to {{limit}}.</link>",
};

export function TreeRenderer({ ...props }: TreeRendererProps) {
  const nodeRenderer = useCallback(
    (nodeProps) => {
      return <TreeNodeRenderer {...nodeProps} {...props} />;
    },
    [props],
  );

  return (
    <LocalizationContextProvider localizedStrings={localizedStrings}>
      <Tree<RenderedTreeNode> {...props} />
    </LocalizationContextProvider>
  );
}
```

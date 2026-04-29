# @itwin/presentation-hierarchies-react

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/presentation-hierarchies-react` package provides APIs for building a headless UI for rendering tree components based on data in an [iTwin.js iModel](https://www.itwinjs.org/learning/imodels/#imodel-overview). In addition, it delivers a set of [StrataKit](https://www.npmjs.com/package/@stratakit/bricks)-based components for rendering the tree.

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

- `isReloading` is a boolean that is `true` while the tree is being reloaded (does not apply to the initial load).

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

  ```tsx
  import { IModelConnection } from "@itwin/core-frontend";
  import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
  import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
  import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";

  function createIModelAccess(imodel: IModelConnection) {
    const schemaProvider = createECSchemaProvider(imodel.schemaContext);
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

- `getHierarchyDefinition` is a factory function that creates a hierarchy definition, describing the hierarchy the tree component will render. The `@itwin/presentation-hierarchies` package describes the concept of hierarchy definitions [in more detail](https://github.com/iTwin/presentation/blob/master/packages/hierarchies/learning/imodel/HierarchyDefinition.md).

#### `useIModelUnifiedSelectionTree` props

In addition to [props required by `useIModelTree`](#useimodeltree-props), the hook additionally requires:

- `selectionStorage` - unified selection storage used across different app's components, allowing them all to share selection state.
- `sourceName` - a string that distinguishes selection changes being made by different components. The value should be unique for each component.

## StrataKit components

While the package provides a headless UI, it also delivers a set of [StrataKit](https://www.npmjs.com/package/@stratakit/bricks)-based components for rendering the tree, which should cover majority of use cases. Consumers using the below components are required to provide compatible `@stratakit/bricks`/`@stratakit/icons`/`@stratakit/foundations` packages, which are optional peer dependencies to this package.

### `StrataKitTreeRenderer`

The component renders a virtualized tree using the `Tree` component from `@stratakit/structures`. It handles node selection modes, error display, and virtualized scrolling. It accepts a required `treeLabel` prop (used for accessibility) and spreads `treeRendererProps` returned by the tree state hooks.

## Full example

```tsx
import { IModelConnection } from "@itwin/core-frontend";
import { createCachingECClassHierarchyInspector, Props } from "@itwin/presentation-shared";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, HierarchyDefinition } from "@itwin/presentation-hierarchies";

import { useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { StrataKitTreeRenderer, StrataKitRootErrorRenderer } from "@itwin/presentation-hierarchies-react/stratakit";
import { createStorage, SelectionStorage } from "@itwin/unified-selection";
import { useEffect, useState } from "react";

function createIModelAccess(imodel: IModelConnection) {
  const schemaProvider = createECSchemaProvider(imodel.schemaContext);
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
  return {
    // The `createSelectClause` function is provided automatically by the hierarchy provider
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
    // render error component if tree fails to load
    return <StrataKitRootErrorRenderer {...treeProps.rootErrorRendererProps} />;
  }

  if (treeProps.isReloading || treeProps.treeRendererProps === undefined) {
    return "Loading...";
  }

  return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="My Tree" />;
}
```

## Localization

This package delivers a locale JSON file with English strings that follows the [`i18next JSON format`](https://www.i18next.com/misc/json-format). To enable localization, register `LOCALIZATION_NAMESPACES` during initialization and wrap components in `LocalizationContextProvider`:

```tsx
import {
  LocalizationContextProvider,
  LOCALIZATION_NAMESPACES,
  useIModelUnifiedSelectionTree,
} from "@itwin/presentation-hierarchies-react";
import { StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";

// Register localization namespaces with `i18next` based localization provider.
for (const namespace of LOCALIZATION_NAMESPACES) {
  await localization.registerNamespace(namespace);
}

// Wrap components with LocalizationContextProvider
function Tree() {
  return (
    <LocalizationContextProvider localization={localization}>
      <MyTreeComponent imodelAccess={imodelAccess} />
    </LocalizationContextProvider>
  );
}

function MyTreeComponent({ imodelAccess }: { imodelAccess: IModelAccess }) {
  const treeProps = useIModelUnifiedSelectionTree({
    sourceName: "MyTreeComponent",
    imodelAccess,
    getHierarchyDefinition,
  });

  if (treeProps.rootErrorRendererProps) {
    return <div>Error</div>;
  }

  if (treeProps.isReloading || treeProps.treeRendererProps === undefined) {
    return <div>Loading...</div>;
  }

  return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="My Tree" />;
}
```

`LocalizationContextProvider` accepts a `localization` prop — an object with a `getLocalizedString(key: string): string` method. It is designed to work with the `Localization` interface from `@itwin/core-common`, but a custom implementation can be used as well by providing an object with a custom `getLocalizedString` function. The provider uses it internally to resolve translation keys prefixed with localization namespace.

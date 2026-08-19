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

While the package provides a headless UI, it also delivers a set of [StrataKit](https://www.npmjs.com/package/@stratakit/bricks)-based components for rendering the tree, which should cover majority of use cases. Consumers using the below components are required to provide compatible `@stratakit/bricks`/`@stratakit/icons`/`@stratakit/foundations` packages, which are optional peer dependencies to this package.

### `StrataKitTreeRenderer`

The component renders a virtualized tree using the `Tree` component from `@stratakit/structures`. It handles node selection modes, error display, and virtualized scrolling. It accepts a required `treeLabel` prop (used for accessibility) and spreads `treeRendererProps` returned by the tree state hooks.

## Full example

<!-- [[include: [Presentation.HierarchiesReact.iModelAccess.Imports, Presentation.HierarchiesReact.SelectionStorage.Imports, Presentation.HierarchiesReact.CustomTreeExample.Imports, Presentation.HierarchiesReact.iModelAccess, Presentation.HierarchiesReact.SelectionStorage, Presentation.HierarchiesReact.CustomTreeExample], tsx]] -->
<!-- BEGIN EXTRACTION -->

```tsx
import { IModelConnection } from "@itwin/core-frontend";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";

import { createStorage, SelectionStorage } from "@itwin/unified-selection";

import { useEffect, useState } from "react";
import { Props } from "@itwin/presentation-shared";
import { useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { StrataKitRootErrorRenderer, StrataKitTreeRenderer } from "@itwin/presentation-hierarchies-react/stratakit";

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
  if (!treeProps.treeRendererProps || treeProps.isReloading) {
    return "Loading...";
  }

  return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="My Tree" />;
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
  if (!treeProps.treeRendererProps || treeProps.isReloading) {
    return "Loading";
  }
  return <StrataKitTreeRenderer {...treeProps.treeRendererProps} treeLabel="Localized tree" />;
}
```

<!-- END EXTRACTION -->

`LocalizationContextProvider` accepts a `localization` prop — an object with a `getLocalizedString(key: string): string` method. It is designed to work with the `Localization` interface from `@itwin/core-common`, but a custom implementation can be used as well by providing an object with a custom `getLocalizedString` function. The provider uses it internally to resolve translation keys prefixed with localization namespace.

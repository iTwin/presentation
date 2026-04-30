# Presentation

Presentation packages are part of the [iTwin.js library](https://www.itwinjs.org/). The packages' responsibility is to help application developers bring non-graphical [iModels'](https://www.itwinjs.org/learning/imodels/) data to users, by solving the following problems:

- Format property values according to user's preferences (language, locale, unit system, etc.).
- Calculate display labels for instances of different [ECClasses](https://www.itwinjs.org/bis/ec/ec-class/).
- Gather associated data from different areas of an iModel and return it in a way that's easy to present to users.
- Create hierarchies from [iModel](https://www.itwinjs.org/learning/imodels/) (and not only) data.
- Provide components to present non-graphical iModel data to users. This includes tree, table, property grid and some other components and their building blocks, including headless components for use with any UI components library.

## The packages

Initially, all presentation packages were part of the [itwinjs-core](https://github.com/iTwin/itwinjs-core) repository, releasing in lock-step with the core packages. At some point, some of the packages
were moved to this repository, which broke them out of lock-step and allowed them to have their own, much quicker, release cycle. However, the moved packages are still tightly coupled with the ones in
core repository. Both - the Presentation packages in [itwinjs-core](https://github.com/iTwin/itwinjs-core) repository and the ones that we moved to this one - are considered [legacy packages](#legacy-packages).
While the legacy packages are still maintained and contain some APIs that have no replacements, they're gradually being replaced by [new generation packages](#new-generation-packages).

### Legacy packages

| Package                                                                                                                   | Description                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@itwin/presentation-common`](https://github.com/iTwin/itwinjs-core/tree/master/presentation/common/README.md)           | Common types and utilities used by other _legacy_ Presentation packages.                                                                                 |
| [`@itwin/presentation-backend`](https://github.com/iTwin/itwinjs-core/tree/master/presentation/backend/README.md)         | APIs for querying presentation data directly from iModels on the backend.                                                                                |
| [`@itwin/presentation-frontend`](https://github.com/iTwin/itwinjs-core/tree/master/presentation/frontend/README.md)       | APIs for querying presentation data from iModels through the [RPC system](https://www.itwinjs.org/learning/rpcinterface/).                               |
| [`@itwin/presentation-components`](https://github.com/iTwin/presentation/tree/master/packages/components/README.md)       | React components and their building blocks to display presentation data to users. Uses `@itwin/presentation-frontend` peer dependency to query the data. |
| [`@itwin/presentation-testing`](https://github.com/iTwin/presentation/tree/master/packages/testing/README.md)             | Utility APIs for testing components based on _legacy_ Presentation APIs.                                                                                 |
| [`@itwin/presentation-opentelemetry`](https://github.com/iTwin/presentation/tree/master/packages/opentelemetry/README.md) | APIs for making interop between OpenTelemetry and _legacy_ Presentation types easier.                                                                    |

### New generation packages

Compared to the legacy packages, the new generation ones are much smaller, have less peer dependencies and are more modular. That makes them easier to consume, as
bumping a version of one package doesn't require bumping the version of other packages or affect unrelated APIs.

The new generation packages can be divided into the following groups:

#### Unified selection

| Package                                                                                                                          | Description                                                                                                                                                                                            | When to use                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`@itwin/unified-selection`](https://github.com/iTwin/presentation/tree/master/packages/unified-selection/README.md)             | APIs for maintaining a single source of truth for what's selected in an application.                                                                                                                   | You want selection to be synchronized between multiple components in your application.             |
| [`@itwin/unified-selection-react`](https://github.com/iTwin/presentation/tree/master/packages/unified-selection-react/README.md) | React APIs for conveniently using the [@itwin/unified-selection](https://github.com/iTwin/presentation/blob/master/packages/unified-selection/README.md) package in React applications and components. | You're writing a React application that uses unified selection, and want to make your life easier. |

#### Hierarchies building

| Package                                                                                                                           | Description                                                                                                                                                                                                                                                                         | When to use                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`@itwin/presentation-hierarchies-react`](https://github.com/iTwin/presentation/tree/master/packages/hierarchies-react/README.md) | APIs for building a headless UI for rendering tree components based on data in an [iModel](https://www.itwinjs.org/learning/imodels/). Also contains a set of [iTwinUI](https://github.com/iTwin/iTwinUI/tree/main/packages/itwinui-react)-based components for rendering the tree. | You're creating a React application and want a tree component.                                                 |
| [`@itwin/presentation-hierarchies`](https://github.com/iTwin/presentation/tree/master/packages/hierarchies/README.md)             | APIs for creating hierarchical data structures. The package doesn't depend on any backend, frontend or UI specific packages, which allows it to be used in both backend and frontend applications, and in case of the latter, it can be used with any UI framework.                 | You want to create hierarchical data structures for use cases other than displaying them in a React component. |

#### Utility

| Package                                                                                                                 | Description                                                                                                                                    | When to use                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@itwin/presentation-shared`](https://github.com/iTwin/presentation/tree/master/packages/shared/README.md)             | Shared APIs used throughout the _new generation_ Presentation packages. Includes some utilities that may be useful for external consumers too. | You need one of the utilities provided by the package. While most of them are used by the above packages, some might be useful when defining your hierarchies, getting instance labels, etc. |
| [`@itwin/presentation-core-interop`](https://github.com/iTwin/presentation/tree/master/packages/core-interop/README.md) | Interop layer between [itwinjs-core](https://github.com/iTwin/itwinjs-core) and _new generation_ Presentation packages.                        | You're using the above packages within an iTwin.js-based application.                                                                                                                        |

The below diagram shows the typical dependency structure of a React application or component that uses Presentation packages to create a tree component:

```mermaid
%%{init: {"flowchart": {"htmlLabels": true, "curve": "linear", "nodeSpacing": 50, "rankSpacing": 70}}}%%
flowchart TB
  app["React application"]

  subgraph tier1[ ]
    direction LR
    pkgUnifiedSelection["<div style='text-align:center;white-space:nowrap;'><a href='./packages/unified-selection/README.md'>@itwin/unified-selection</a></div><br/><div style='text-align:left;font-weight:normal;'>Provides APIs for maintaining a single source of truth for what's selected in the application.</div>"]
    pkgUnifiedSelectionReact["<div style='text-align:center;white-space:nowrap;'><a href='./packages/unified-selection-react/README.md'>@itwin/unified-selection-react</a></div><br/><div style='text-align:left;font-weight:normal;'>Provides APIs for making it easier to implement unified selection-driven React components.</div>"]
    pkgHierarchiesReact["<div style='text-align:center;white-space:nowrap;'><a href='./packages/hierarchies-react/README.md'>@itwin/presentation-hierarchies-react</a></div><br/><div style='text-align:left;font-weight:normal;'>Provides headless UI components for creating hierarchical React components as well as iTwinUI-based renderers.</div>"]
    pkgHierarchies["<div style='text-align:center;white-space:nowrap;'><a href='./packages/hierarchies/README.md'>@itwin/presentation-hierarchies</a></div><br/><div style='text-align:left;font-weight:normal;'>Provides framework-agnostic APIs to create hierarchies. May be used on any frontend as well as backend.</div>"]
  end

  pkgCoreInterop["<div style='text-align:center;white-space:nowrap;'><a href='./packages/core-interop/README.md'>@itwin/presentation-core-interop</a></div><br/><div style='text-align:left;font-weight:normal;'>This interop package allows avoiding peer dependencies on core packages.</div>"]

  subgraph tier3[ ]
    direction LR
    pkgShared["<div style='text-align:center;white-space:nowrap;'><a href='./packages/shared/README.md'>@itwin/presentation-shared</a></div><br/><div style='text-align:left;font-weight:normal;'>Provides types and utilities shared across multiple Presentation packages. Some of them may be useful for consumers as well.</div>"]
    pkgCoreLegacy["<div style='text-align:center;white-space:nowrap;'><a href='https://www.itwinjs.org/learning/'>@itwin/core-*</a><br/><a href='https://www.npmjs.com/package/@itwin/presentation-common'>@itwin/presentation-common</a></div>"]
  end

  app -->|uses to provide selection storage to tree components| pkgUnifiedSelection
  app -->|may use to provide unified selection React context| pkgUnifiedSelectionReact
  app -->|uses to create tree components| pkgHierarchiesReact
  app -->|uses to define hierarchies for tree components| pkgHierarchies
  app -->|uses to define hierarchies for tree components| pkgShared
  app -->|uses to map itwinjs-core types to Presentation ones| pkgCoreInterop
  app -->|uses| pkgCoreLegacy

  pkgUnifiedSelectionReact -.->|uses| pkgUnifiedSelection
  pkgHierarchiesReact -->|uses to manage tree selection| pkgUnifiedSelection
  pkgHierarchiesReact -->|uses to create hierarchies| pkgHierarchies
  pkgHierarchies -->|uses| pkgShared
  pkgCoreInterop -->|creates types for| pkgShared
  pkgCoreInterop -.->|creates Presentation types from| pkgCoreLegacy

  subgraph Legend["<div style='font-weight: bold; padding: 10px'>Legend</div>"]
    direction LR
    lGray["Platform-agnostic packages that can be used on the frontend with any UI components library as well as the backend"]:::clsPlatformAgnosticPackageNode
    lRed["React-based frontend package"]:::clsReactPackageNode

    subgraph legendRegular[ ]
      direction LR
      legendN1[ ] -->|regular dependency| legendN2[ ]
    end

    subgraph legendPeer[ ]
      direction LR
      legendN3[ ] -.->|peer dependency| legendN4[ ]
    end
  end

  tier1 ~~~ Legend

  style tier1 fill:none,stroke:none
  style tier3 fill:none,stroke:none
  style legendRegular fill:none,stroke:none
  style legendPeer fill:none,stroke:none
  style legendN1 fill:none,stroke:none,color:none
  style legendN2 fill:none,stroke:none,color:none
  style legendN3 fill:none,stroke:none,color:none
  style legendN4 fill:none,stroke:none,color:none

  classDef clsReactPackageNode fill:#f8cecc,stroke:#b85450,color:#333333,stroke-width:1.2px;
  classDef clsPlatformAgnosticPackageNode fill:#f5f5f5,stroke:#666666,color:#333333,stroke-width:1.2px;

  class app,pkgHierarchiesReact,pkgUnifiedSelectionReact clsReactPackageNode;
  class pkgHierarchies,pkgUnifiedSelection,pkgCoreInterop,pkgShared,pkgCoreLegacy clsPlatformAgnosticPackageNode;
```

## Contribution

If you wish to contribute to this repository, see our [Contributing guide](./CONTRIBUTING.md).

# iModel selection synchronization with unified selection

A Viewport is used to display `BisCore.GeometricElement` _ECInstances_ simply called _Elements_. It uses a container called the highlight (or often - just "hilite") set to represent selected elements. That container is maintained by [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/), containing the displayed elements. As a result, all viewports associated with the same `IModelConnection` share the same hilite set.

The rules for interacting with unified selection are:

- when unified selection changes at the 0th level, we create a [hilite set](./HiliteSets.md) for the current selection and ask the iModel to hilite it,
- when an element is selected in the viewport, we compute the selection based on [selection scope](./SelectionScopes.md) and add that to our unified selection storage at the 0th level.

## Reference

The `@itwin/unified-selection` package delivers an `enableUnifiedSelectionSyncWithIModel` function to enable automatic selection synchronization between `SelectionStorage` and an iModel with all its Viewports. When called, it returns a cleanup function that should be used to disable the synchronization.

For example, in a React application this function could be used inside a `useEffect` hook in a component that maintains an iModel:

<!-- [[include: [Presentation.UnifiedSelection.IModelSelectionSync.Imports, Presentation.UnifiedSelection.IModelSelectionSync.Example], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { enableUnifiedSelectionSyncWithIModel, SelectionStorage } from "@itwin/unified-selection";

/** An iModel-based component that handles iModel selection directly, through its `SelectionSet` */
function IModelComponent({ selectionStorage }: { selectionStorage: SelectionStorage }) {
  // get the active iModel connection (implementation is outside the scope of this example)
  const iModelConnection: IModelConnection = useActiveIModelConnection();

  // enable unified selection sync with the iModel
  useEffect(() => {
    return enableUnifiedSelectionSyncWithIModel({
      // Unified selection storage to synchronize iModel's tool selection with. The storage should be shared
      // across all components in the application to ensure unified selection experience.
      selectionStorage,

      // `imodelAccess` provides access to different iModel's features: query executing, class hierarchy,
      // selection and hilite sets
      imodelAccess: {
        ...createECSqlQueryExecutor(iModelConnection),
        ...createCachingECClassHierarchyInspector({ schemaProvider: createECSchemaProvider(iModelConnection.schemaContext) }),
        key: createIModelKey(iModelConnection),
        hiliteSet: iModelConnection.hilited,
        selectionSet: iModelConnection.selectionSet,
      },

      // a function that returns the active selection scope (see "Selection scopes" section in README)
      activeScopeProvider: () => "model",
    });
  }, [iModelConnection, selectionStorage]);

  return <button onClick={() => iModelConnection.selectionSet.add(geometricElementId)}>Select element</button>;
}
```

<!-- END EXTRACTION -->

There should only be one active synchronization between a single iModel and a `SelectionStorage` at a given time.

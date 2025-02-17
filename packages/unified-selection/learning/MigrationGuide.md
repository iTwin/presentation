# Migrating from `@itwin/presentation-frontend` unified selection API

As the [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) and related APIs get deprecated in iTwin.js version `5.0`, it's important that consumers migrate to the new system over time. Before the deprecation, we made sure that migration is as smooth as possible.

1. All components that we own are compatible with the new system as the first class citizen.

   The [Tree](./SyncWithTree.md), [Table](./SyncWithTable.md) and [Property grid](./SyncWithPropertyGrid.md) components simply got a new `selectionStorage` prop, which tells them to use the new system (click on the links for specific APIs). For Table and Property grid components, the new prop is optional to keep them backwards compatible - in that case they continue working with the deprecated API.

   The [viewWithUnifiedSelection](https://www.itwinjs.org/reference/presentation-components/viewport/viewwithunifiedselection/) HOC was deprecated in favor of the `enableUnifiedSelectionSyncWithIModel` provided by this package. The API is quite a bit different, but it's more clear about what it does and is more flexible in how it can be used. See the [SyncWithIModelConnection](./SyncWithIModelConnection.md) learning page for more information and example for using in a React app.

2. Existing components, that haven't migrated to the new system, continue working as expected.

   This was achieved by enhancing the deprecated [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) to take `SelectionStorage` from this package. That allows making the `SelectionStorage` object the single source of truth of what's selected in an application, even for components using the deprecated API.

   The only change application developers need to do is to initialize the `Presentation` frontend with the `SelectionStorage` object:

   <!-- [[include: [Presentation.UnifiedSelection.LegacySelectionManagerSelectionSync.Imports, Presentation.LegacySelectionManagerSelectionSync.Example], ts]] -->
   <!-- BEGIN EXTRACTION -->

   ```ts
   import { createStorage } from "@itwin/unified-selection";
   import { Presentation } from "@itwin/presentation-frontend";

   const selectionStorage = createStorage();

   // Initialize Presentation with our selection storage, to make sure that any components, using `Presentation.selection`,
   // use the same underlying selection store.
   await Presentation.initialize({
     selection: {
       selectionStorage,
     },
   });
   ```

   <!-- END EXTRACTION -->

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */
/* eslint-disable no-console */

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { useEffect, useState } from "react";
import { KeySet } from "@itwin/presentation-common";
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.Example.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { createIModelKey } from "@itwin/presentation-core-interop";
import { createStorage, Selectables } from "@itwin/unified-selection";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.IModelSelectionSync.Imports
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { enableUnifiedSelectionSyncWithIModel, SelectionStorage } from "@itwin/unified-selection";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.LegacySelectionManagerSelectionSync.Imports
import { Presentation } from "@itwin/presentation-frontend";
// __PUBLISH_EXTRACT_END__
import { buildIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { render, waitFor } from "../../RenderUtils.js";
import { isSelectionStorageSupported, stubVirtualization } from "../../Utils.js";

describe("Unified selection", () => {
  describe("Learning snippets", () => {
    describe("Readme example", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      stubVirtualization();

      it("Basic usage example", async function () {
        const { imodel } = await buildIModel(this, async () => {});

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.Example.CreateStorage
        // Create a global selection store (generally, somewhere in main.ts or similar). This store
        // must be shared across all the application's components to ensure unified selection experience.
        const unifiedSelection = createStorage();
        // __PUBLISH_EXTRACT_END__

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.Example.CleanupOnClose
        // The store should to be cleaned up when iModels are closed to free up memory, e.g.:
        IModelConnection.onClose.addListener((iModelConnection) => {
          unifiedSelection.clearStorage({ imodelKey: createIModelKey(iModelConnection) });
        });
        // __PUBLISH_EXTRACT_END__

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.Example.SelectionListener
        // A demo selection listener logs selection changes to the console:
        unifiedSelection.selectionChangeEvent.addListener(({ imodelKey, source, changeType, selectables }) => {
          const suffix = `in ${imodelKey} iModel from ${source} component`;
          const numSelectables = Selectables.size(selectables);
          switch (changeType) {
            case "add":
              console.log(`Added ${numSelectables} items to selection ${suffix}.`);
              break;
            case "remove":
              console.log(`Removed ${numSelectables} items from selection ${suffix}.`);
              break;
            case "replace":
              console.log(`Replaced selection with ${numSelectables} items ${suffix}.`);
              break;
            case "clear":
              console.log(`Cleared selection ${suffix}.`);
              break;
          }
        });
        // __PUBLISH_EXTRACT_END__

        // Verify selection is initially empty
        expect(Selectables.isEmpty(unifiedSelection.getSelection({ imodelKey: createIModelKey(imodel) }))).to.be.true;

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.Example.InteractiveComponent
        // An interactive component that allows selecting elements, representing something in an iModel, may want to
        // add that something to unified selection. For example:
        const elementKey = { className: "BisCore.PhysicalElement", id: "0x1" };
        unifiedSelection.addToSelection({ imodelKey: createIModelKey(imodel), source: "MyComponent", selectables: [elementKey] });
        // __PUBLISH_EXTRACT_END__

        // Verify selection was added
        expect(Selectables.size(unifiedSelection.getSelection({ imodelKey: createIModelKey(imodel) }))).to.eq(1);
      });

      it("Unified selection sync with iModel selection", async function () {
        const {
          imodel,
          elementKey: { id: geometricElementId },
        } = await buildIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const elementKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id });
          return { modelKey, categoryKey, elementKey };
        });
        function useActiveIModelConnection() {
          return imodel;
        }

        /**
         * A top-level component that creates the selection storage and renders multiple selection-enabled components, one of them
         * also being iModel-based.
         */
        function App() {
          const [selectionStorage] = useState(() => createStorage());
          return (
            <>
              <IModelComponent selectionStorage={selectionStorage} />
              <SelectedItemsWidget selectionStorage={selectionStorage} />
            </>
          );
        }

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.IModelSelectionSync.Example
        /** An iModel-based component that handles iModel selection directly, through its `SelectionSet` */
        function IModelComponent({ selectionStorage }: { selectionStorage: SelectionStorage }) {
          // get the active iModel connection (implementation is outside the scope of this example)
          const iModelConnection: IModelConnection = useActiveIModelConnection();

          // enable unified selection sync with the iModel
          useEffect(
            () =>
              enableUnifiedSelectionSyncWithIModel({
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
              }),
            [iModelConnection, selectionStorage],
          );

          return <button onClick={() => iModelConnection.selectionSet.add(geometricElementId)}>Select element</button>;
        }
        // __PUBLISH_EXTRACT_END__

        /** A simple component that listens to selection changes and prints selected items count */
        function SelectedItemsWidget({ selectionStorage }: { selectionStorage: SelectionStorage }) {
          function getSelectedElementsCount(storage: SelectionStorage) {
            return Selectables.size(storage.getSelection({ imodelKey: createIModelKey(imodel) }));
          }

          const [selectedElementsCount, setSelectedElementsCount] = useState(() => getSelectedElementsCount(selectionStorage));
          useEffect(() => {
            return selectionStorage.selectionChangeEvent.addListener(() => {
              setSelectedElementsCount(getSelectedElementsCount(selectionStorage));
            });
          }, [selectionStorage]);
          return `Number of selected elements: ${selectedElementsCount}`;
        }

        const { getByRole, getByText, user } = render(<App />);
        await waitFor(() => expect(getByText("Number of selected elements: 0")).to.not.be.null);

        await user.click(getByRole("button"));
        await waitFor(() => expect(getByText("Number of selected elements: 1")).to.not.be.null);
      });

      if (isSelectionStorageSupported()) {
        it("Unified selection sync with legacy SelectionManager", async function () {
          Presentation.terminate();

          const { imodel, ...keys } = await buildIModel(this, async (builder) => {
            const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
            const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
            const elementKey = insertPhysicalElement({ builder, userLabel: "root element", modelId: modelKey.id, categoryId: categoryKey.id });
            return { modelKey, categoryKey, elementKey };
          });

          // __PUBLISH_EXTRACT_START__ Presentation.LegacySelectionManagerSelectionSync.Example
          const selectionStorage = createStorage();

          // Initialize Presentation with our selection storage, to make sure that any components, using `Presentation.selection`,
          // use the same underlying selection store.
          await Presentation.initialize({
            selection: {
              selectionStorage,
            },
          });
          // __PUBLISH_EXTRACT_END__

          expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key }))).to.be.true;

          // eslint-disable-next-line @typescript-eslint/no-deprecated
          Presentation.selection.addToSelection("test", imodel, new KeySet([keys.elementKey]));
          await waitFor(() => {
            expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key }))).to.eq(1);
          });
        });
      }
    });
  });
});

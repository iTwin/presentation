/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { useEffect, useState } from "react";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { KeySet } from "@itwin/presentation-common";
import { Selectables } from "@itwin/unified-selection";
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.IModelSelectionSync.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { enableUnifiedSelectionSyncWithIModel, SelectionStorage } from "@itwin/unified-selection";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.LegacySelectionManagerSelectionSync.Imports
import { createStorage } from "@itwin/unified-selection";
import { Presentation } from "@itwin/presentation-frontend";
// __PUBLISH_EXTRACT_END__
import { buildIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { render, waitFor } from "../../RenderUtils.js";
import { stubGetBoundingClientRect } from "../../Utils.js";

describe("Unified selection", () => {
  describe("Learning snippets", () => {
    describe("Readme example", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      stubGetBoundingClientRect();

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
          useEffect(() => {
            // iModel's schema context should be shared between all components using the iModel (implementation
            // of the getter is outside the scope of this example)
            const imodelSchemaContext: SchemaContext = getSchemaContext(iModelConnection);

            return enableUnifiedSelectionSyncWithIModel({
              // Unified selection storage to synchronize iModel's tool selection with. The storage should be shared
              // across all components in the application to ensure unified selection experience.
              selectionStorage,

              // `imodelAccess` provides access to different iModel's features: query executing, class hierarchy,
              // selection and hilite sets
              imodelAccess: {
                ...createECSqlQueryExecutor(iModelConnection),
                ...createCachingECClassHierarchyInspector({ schemaProvider: createECSchemaProvider(imodelSchemaContext) }),
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

        Presentation.selection.addToSelection("test", imodel, new KeySet([keys.elementKey]));
        await waitFor(() => {
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key }))).to.eq(1);
        });
      });
    });
  });
});

function getSchemaContext(imodel: IModelConnection) {
  const schemas = new SchemaContext();
  schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
  return schemas;
}

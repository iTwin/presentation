/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { useEffect, useRef, useState } from "react";
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelectionReact.Context.Imports
import { createStorage, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { UnifiedSelectionContextProvider, useUnifiedSelectionContext } from "@itwin/unified-selection-react";
// __PUBLISH_EXTRACT_END__
import { render, waitFor } from "../../RenderUtils.js";
import { stubGetBoundingClientRect } from "../../Utils.js";

describe.only("Unified Selection React", () => {
  describe("Learning snippets", () => {
    describe("Readme example", () => {
      stubGetBoundingClientRect();

      it("Unified selection context", async function () {
        const imodelKey = "test-imodel-key";

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelectionReact.Context.Example
        /** A top-level component that creates the selection storage and sets up the context provider for all inner components to use */
        function App() {
          const [selectionStorage] = useState(() => createStorage());
          const idCounter = useRef(0);
          return (
            <UnifiedSelectionContextProvider storage={selectionStorage}>
              <button
                onClick={() =>
                  selectionStorage.addToSelection({
                    imodelKey,
                    source: "my-button",
                    selectables: [{ className: "BisCore.Element", id: `0x${++idCounter.current}` }],
                  })
                }
              >
                Select an element
              </button>
              <MyComponent />
            </UnifiedSelectionContextProvider>
          );
        }

        /** An internal component that takes unified selection storage from context and prints the number of selected elements */
        function MyComponent() {
          const selectionContext = useUnifiedSelectionContext();
          if (!selectionContext) {
            throw new Error("Unified selection context is not available");
          }

          function getSelectedElementsCount(storage: SelectionStorage) {
            return Selectables.size(storage.getSelection({ imodelKey }));
          }

          const [selectedElementsCount, setSelectedElementsCount] = useState(() => getSelectedElementsCount(selectionContext.storage));
          useEffect(() => {
            return selectionContext.storage.selectionChangeEvent.addListener(() => {
              setSelectedElementsCount(getSelectedElementsCount(selectionContext.storage));
            });
          }, [selectionContext.storage]);
          return `Number of selected elements: ${selectedElementsCount}`;
        }
        // __PUBLISH_EXTRACT_END__

        const { getByRole, getByText, user } = render(<App />);
        await waitFor(() => expect(getByText("Number of selected elements: 0")).to.not.be.null);

        await user.click(getByRole("button"));
        await waitFor(() => expect(getByText("Number of selected elements: 1")).to.not.be.null);
      });
    });
  });
});

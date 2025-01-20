/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { useCallback, useState } from "react";
import { UiComponents, VirtualizedPropertyGridWithDataProvider } from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { InstanceKey } from "@itwin/presentation-common";
import { PresentationPropertyDataProvider, usePropertyDataProviderWithUnifiedSelection } from "@itwin/presentation-components";
import { buildTestIModel } from "@itwin/presentation-testing";
import { createStorage } from "@itwin/unified-selection";
import { initialize, terminate } from "../../IntegrationTests.js";
import { act, getByText, render, waitFor } from "../../RenderUtils.js";
import { useOptionalDisposable } from "../../UseOptionalDisposable.js";
import { ensurePropertyGridHasPropertyRecord } from "../PropertyGridUtils.js";

describe("Learning snippets", async () => {
  describe("Property grid", () => {
    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
    });

    after(async () => {
      UiComponents.terminate();
      await terminate();
    });

    it("renders unified selection property grid", async function () {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.UnifiedSelection.PropertyGrid
      // Create a single unified selection storage to be shared between all application's components
      const selectionStorage = createStorage();

      function MyPropertyGrid(props: { imodel: IModelConnection }) {
        // create a presentation rules driven data provider; the provider implements `IDisposable`, so we
        // create it through `useOptionalDisposable` hook to make sure it's properly cleaned up
        const dataProvider = useOptionalDisposable(
          useCallback(() => {
            return new PresentationPropertyDataProvider({ imodel: props.imodel });
          }, [props.imodel]),
        );

        if (!dataProvider) {
          return null;
        }

        // render the property grid
        return <MyPropertyGridWithProvider dataProvider={dataProvider} />;
      }

      function MyPropertyGridWithProvider({ dataProvider }: { dataProvider: PresentationPropertyDataProvider }) {
        // set up the data provider to be notified about changes in unified selection, the provided
        // selection storage is used to synchronize selection between different components
        const { isOverLimit, numSelectedElements } = usePropertyDataProviderWithUnifiedSelection({ dataProvider, selectionStorage });

        // width and height should generally we computed using ResizeObserver API or one of its derivatives
        const [width] = useState(400);
        const [height] = useState(600);

        // data provider is going to be empty if no elements are selected
        if (numSelectedElements === 0) {
          return <>Select an element to see its properties</>;
        }

        // there's little value in loading properties for many elements (see `PropertyDataProviderWithUnifiedSelectionProps.requestedContentInstancesLimit`)
        if (isOverLimit) {
          return <>Please select less elements</>;
        }

        // render the property grid
        return <VirtualizedPropertyGridWithDataProvider dataProvider={dataProvider} width={width} height={height} />;
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      const elementKeys: InstanceKey[] = [];
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const imodel = await buildTestIModel(this, (builder) => {
        const categoryKey = insertSpatialCategory({ builder, codeValue: "My Category" });
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "My Model" });
        elementKeys.push(
          insertPhysicalElement({ builder, userLabel: "My Element 1", modelId: modelKey.id, categoryId: categoryKey.id }),
          insertPhysicalElement({ builder, userLabel: "My Element 2", modelId: modelKey.id, categoryId: categoryKey.id }),
        );
      });

      // render the component
      const { container } = render(<MyPropertyGrid imodel={imodel} />);
      await waitFor(() => getByText(container, "Select an element to see its properties"));

      // test Unified Selection -> Property Grid content synchronization
      act(() => selectionStorage.replaceSelection({ imodelKey: imodel.key, source: "", selectables: [elementKeys[0]] }));
      await ensurePropertyGridHasPropertyRecord(container, "$élêçtèd Ítêm(s)", "User Label", "My Element 1");

      act(() => selectionStorage.replaceSelection({ imodelKey: imodel.key, source: "", selectables: [elementKeys[1]] }));
      await ensurePropertyGridHasPropertyRecord(container, "$élêçtèd Ítêm(s)", "User Label", "My Element 2");
    });
  });
});

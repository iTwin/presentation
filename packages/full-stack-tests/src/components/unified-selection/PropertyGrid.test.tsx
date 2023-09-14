/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useState } from "react";
import { UiComponents, VirtualizedPropertyGridWithDataProvider } from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { useDisposable } from "@itwin/core-react";
import { InstanceKey, KeySet } from "@itwin/presentation-common";
import { PresentationPropertyDataProvider, usePropertyDataProviderWithUnifiedSelection } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { act, getByText, render, waitFor } from "@testing-library/react";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { ensurePropertyGridHasPropertyRecord } from "../PropertyGridUtils";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Learning snippets", async () => {
  describe("Property grid", () => {
    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
    });

    after(async () => {
      await terminate();
    });

    it("renders unified selection property grid", async function () {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.UnifiedSelection.PropertyGrid
      function MyPropertyGrid(props: { imodel: IModelConnection }) {
        // create a presentation rules driven data provider; the provider implements `IDisposable`, so we
        // create it through `useDisposable` hook to make sure it's properly cleaned up
        const dataProvider = useDisposable(
          useCallback(() => {
            return new PresentationPropertyDataProvider({ imodel: props.imodel });
          }, [props.imodel]),
        );

        // set up the data provider to be notified about changes in unified selection
        const { isOverLimit, numSelectedElements } = usePropertyDataProviderWithUnifiedSelection({ dataProvider });

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
      // eslint-disable-next-line deprecation/deprecation
      const imodel = await buildTestIModel(this, (builder) => {
        const categoryKey = insertSpatialCategory({ builder, label: "My Category" });
        const modelKey = insertPhysicalModelWithPartition({ builder, label: "My Model" });
        elementKeys.push(
          insertPhysicalElement({ builder, userLabel: "My Element 1", modelId: modelKey.id, categoryId: categoryKey.id }),
          insertPhysicalElement({ builder, userLabel: "My Element 2", modelId: modelKey.id, categoryId: categoryKey.id }),
        );
      });

      // render the component
      const { container } = render(<MyPropertyGrid imodel={imodel} />);
      await waitFor(() => getByText(container, "Select an element to see its properties"));

      // test Unified Selection -> Property Grid content synchronization
      act(() => Presentation.selection.replaceSelection("", imodel, new KeySet([elementKeys[0]])));
      await ensurePropertyGridHasPropertyRecord(container, "User Label", "My Element 1");

      act(() => Presentation.selection.replaceSelection("", imodel, new KeySet([elementKeys[1]])));
      await ensurePropertyGridHasPropertyRecord(container, "User Label", "My Element 2");
    });
  });
});

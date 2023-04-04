/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { useCallback, useState } from "react";
import sinon from "sinon";
import { UiComponents, VirtualizedPropertyGridWithDataProvider } from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { useDisposable } from "@itwin/core-react";
import { InstanceKey, KeySet, PresentationRpcInterface } from "@itwin/presentation-common";
import { PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { render } from "@testing-library/react";
import { insertPhysicalElement, insertPhysicalModel, insertSpatialCategory } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { ensureHasError, ErrorBoundary } from "../ErrorBoundary";
import { ensurePropertyGridHasPropertyRecord } from "../PropertyGridUtils";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Learning snippets", () => {

  describe("Property grid", () => {

    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
    });

    after(async () => {
      await terminate();
    });

    it("handles errors", async function () {
      if (Number.parseInt(PresentationRpcInterface.interfaceVersion.split(".")[0], 10) < 4) {
        // property grid started supporting error boundaries since appui@4.0
        this.skip();
      }

      // __PUBLISH_EXTRACT_START__ Presentation.Components.PropertyGrid.ErrorHandling
      function MyPropertyGrid(props: { imodel: IModelConnection, elementKey: InstanceKey }) {
        // create a presentation rules driven data provider; the provider implements `IDisposable`, so we
        // create it through `useDisposable` hook to make sure it's properly cleaned up
        const dataProvider = useDisposable(useCallback(() => {
          const provider = new PresentationPropertyDataProvider({ imodel: props.imodel });
          provider.keys = new KeySet([props.elementKey]);
          return provider;
        }, [props.imodel, props.elementKey]));

        // width and height should generally we computed using ResizeObserver API or one of its derivatives
        const [width] = useState(400);
        const [height] = useState(600);

        // render the property grid within an error boundary - any errors thrown by the property grid will be captured
        // and handled by the error boundary
        return (
          <ErrorBoundary>
            <VirtualizedPropertyGridWithDataProvider
              dataProvider={dataProvider}
              width={width}
              height={height}
            />
          </ErrorBoundary>
        );
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      let elementKey: InstanceKey | undefined;
      const imodel = await buildTestIModel(this, (builder) => {
        const categoryKey = insertSpatialCategory(builder, "My Category");
        const modelKey = insertPhysicalModel(builder, "My Model");
        elementKey= insertPhysicalElement(builder, "My Element", modelKey.id, categoryKey.id);
      });
      assert(elementKey !== undefined);

      // render the component
      const { container, rerender } = render(
        <MyPropertyGrid imodel={imodel} elementKey={elementKey} />
      );
      await ensurePropertyGridHasPropertyRecord(container, "User Label", "My Element");

      // simulate a network error in RPC request
      sinon.stub(Presentation.presentation, "getContentAndSize").throws(new Error("Network error"));

      // re-render the component, ensure we now get an error
      rerender(
        <MyPropertyGrid imodel={imodel} elementKey={{ ...elementKey }} />
      );
      await ensureHasError(container, "Network error");
    });

  });

});

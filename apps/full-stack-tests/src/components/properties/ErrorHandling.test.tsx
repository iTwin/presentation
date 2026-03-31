/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { useCallback, useState } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { UiComponents, VirtualizedPropertyGridWithDataProvider } from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { InstanceKey, KeySet, PresentationRpcInterface } from "@itwin/presentation-common";
import { PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { createFileNameFromString } from "../../FilenameUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { render } from "../../RenderUtils.js";
import { buildTestIModel } from "../../TestIModelSetup.js";
import { useOptionalDisposable } from "../../UseOptionalDisposable.js";
import { isIterableManager } from "../../Utils.js";
import { ensureHasError, ErrorBoundary } from "../ErrorBoundary.js";
import { ensurePropertyGridHasPropertyRecord } from "../PropertyGridUtils.js";

describe("Learning snippets", () => {
  describe("Property grid", () => {
    beforeAll(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
    });

    afterAll(async () => {
      UiComponents.terminate();
      await terminate();
    });

    it.skipIf(Number.parseInt(PresentationRpcInterface.interfaceVersion.split(".")[0], 10) < 4)("handles errors", async () => {
      // stub console log to avoid ErrorBoundary warning in console
      const consoleStub = vi.spyOn(console, "error").mockImplementation(() => {});

      // __PUBLISH_EXTRACT_START__ Presentation.Components.PropertyGrid.ErrorHandling
      function MyPropertyGrid(props: { imodel: IModelConnection; elementKey: InstanceKey }) {
        // create a presentation rules driven data provider; the provider implements `IDisposable`, so we
        // create it through `useOptionalDisposable` hook to make sure it's properly cleaned up
        const dataProvider = useOptionalDisposable(
          useCallback(() => {
            const provider = new PresentationPropertyDataProvider({ imodel: props.imodel });
            provider.keys = new KeySet([props.elementKey]);
            return provider;
          }, [props.imodel, props.elementKey]),
        );

        // width and height should generally we computed using ResizeObserver API or one of its derivatives
        const [width] = useState(400);
        const [height] = useState(600);

        if (!dataProvider) {
          return null;
        }

        // render the property grid within an error boundary - any errors thrown by the property grid will be captured
        // and handled by the error boundary
        return (
          <ErrorBoundary>
            <VirtualizedPropertyGridWithDataProvider dataProvider={dataProvider} width={width} height={height} />
          </ErrorBoundary>
        );
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      let elementKey: InstanceKey | undefined;
       
      const imodel = await buildTestIModel(createFileNameFromString(expect.getState().currentTestName!), async (builder) => {
        const categoryKey = insertSpatialCategory({ builder, codeValue: "My Category" });
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "My Model" });
        elementKey = insertPhysicalElement({ builder, userLabel: "My Element", modelId: modelKey.id, categoryId: categoryKey.id });
      });
      assert(elementKey !== undefined);

      // render the component
      const { container, rerender } = render(<MyPropertyGrid imodel={imodel} elementKey={elementKey} />);
      // cspell:disable-next-line
      await ensurePropertyGridHasPropertyRecord(container, "$élêçtèd Ítêm(s)", "User Label", "My Element");

      // simulate a network error in RPC request
      const manager = Presentation.presentation;
      if (isIterableManager(manager)) {
        vi.spyOn(manager, "getContentIterator").mockImplementation(() => {
          throw new Error("Network error");
        });
      } else {
        vi.spyOn(Presentation.presentation, "getContentAndSize").mockImplementation(() => {
          throw new Error("Network error");
        });
      }

      // re-render the component, ensure we now get an error
      rerender(<MyPropertyGrid imodel={imodel} elementKey={{ ...elementKey }} />);
      await ensureHasError(container, "Network error");
      consoleStub.mockRestore();
    });
  });
});

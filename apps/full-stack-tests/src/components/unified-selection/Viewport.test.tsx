/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BeUiEvent } from "@itwin/core-bentley";
import { IModelApp, IModelConnection, SelectedViewportChangedArgs, SpatialViewState, ViewManager, ViewState } from "@itwin/core-frontend";
import { Point3d, Vector3d } from "@itwin/core-geometry";
import { UiIModelComponents, ViewportComponent } from "@itwin/imodel-components-react";
import { InstanceKey, KeySet } from "@itwin/presentation-common";
import { viewWithUnifiedSelection } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { initialize, terminate } from "../../IntegrationTests.js";
import { render, waitFor } from "../../RenderUtils.js";
import { buildTestIModel } from "../../TestIModelSetup.js";

describe("Learning snippets", async () => {
  describe("Viewport", () => {
    beforeAll(async () => {
      await initialize();
      await UiIModelComponents.initialize();
    });

    afterAll(async () => {
      await terminate();
      vi.restoreAllMocks();
    });

    it("renders unified selection viewport", async () => {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.UnifiedSelection.Viewport
      // use `viewWithUnifiedSelection` HOC to create an enhanced `ViewportComponent` that synchronizes with unified selection
      const UnifiedSelectionViewport = viewWithUnifiedSelection(ViewportComponent);
      // besides the above line, the component may be used just like the general `ViewportComponent` from `@itwin/imodel-components-react`
      function MyViewport(props: { imodel: IModelConnection; initialViewState: ViewState }) {
        return <UnifiedSelectionViewport imodel={imodel} viewState={props.initialViewState} />;
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      const elementKeys: InstanceKey[] = [];

      const { imodel } = await buildTestIModel(async (builder) => {
        const categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        const modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
        (elementKeys.push(
          insertPhysicalElement({ builder, fullClassNameSeparator: ":", userLabel: "My Assembly Element", modelId: modelKey.id, categoryId: categoryKey.id }),
        ),
          elementKeys.push(
            insertPhysicalElement({
              builder,
              fullClassNameSeparator: ":",
              userLabel: "My Child Element 1",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: elementKeys[0].id,
            }),
            insertPhysicalElement({
              builder,
              fullClassNameSeparator: ":",
              userLabel: "My Child Element 2",
              modelId: modelKey.id,
              categoryId: categoryKey.id,
              parentId: elementKeys[0].id,
            }),
          ));
      });

      // we're not rendering on a screen, so need to stub some stuff
      setupViewportStubs();

      // render the component
      const { getByTestId, unmount } = render(
        <MyViewport imodel={imodel} initialViewState={SpatialViewState.createBlank(imodel, Point3d.createZero(), Vector3d.create(400, 400))} />,
      );
      await waitFor(() => getByTestId("viewport-component"));

      // test Unified Selection -> Hilited elements synchronization
      Presentation.selection.replaceSelection("", imodel, new KeySet([elementKeys[0]]));
      await waitFor(() => {
        expect(imodel.hilited.models.isEmpty).toBe(true);
        expect(imodel.hilited.subcategories.isEmpty).toBe(true);
        expect(imodel.hilited.elements.toId64Array()).toHaveLength(3);
        expect(imodel.hilited.elements.toId64Array()).toEqual(expect.arrayContaining(elementKeys.map((k) => k.id)));
        expect([...imodel.selectionSet.elements]).toHaveLength(3);
        expect([...imodel.selectionSet.elements]).toEqual(expect.arrayContaining(elementKeys.map((k) => k.id)));
      });

      Presentation.selection.clearSelection("", imodel);
      await waitFor(() => {
        expect(imodel.hilited.models.isEmpty).toBe(true);
        expect(imodel.hilited.subcategories.isEmpty).toBe(true);
        expect(imodel.hilited.elements.isEmpty).toBe(true);
        expect(imodel.selectionSet.size).toBe(0);
      });

      // test Viewport elements selection => Unified Selection synchronization
      imodel.selectionSet.replace(elementKeys[2].id);
      await waitFor(() => {
        const selection = Presentation.selection.getSelection(imodel);
        expect(selection.size).toBe(1);
        expect(selection.has(elementKeys[2])).toBe(true);
      });

      imodel.selectionSet.emptyAll();
      await waitFor(() => {
        const selection = Presentation.selection.getSelection(imodel);
        expect(selection.isEmpty).toBe(true);
      });
      unmount();
    });
  });
});

function setupViewportStubs() {
  // `ViewportComponent` calls some of the `ViewManager` functions (gets it through `IModelApp.viewManager`)
  const viewManager = {
    addViewport: vi.fn(),
    dropViewport: vi.fn(),
    onSelectionSetChanged: vi.fn(),
    onSelectedViewportChanged: new BeUiEvent<SelectedViewportChangedArgs>(),
    onShutDown: vi.fn(),
  };
  vi.spyOn(IModelApp, "viewManager", "get").mockReturnValue(viewManager as unknown as ViewManager);

  // `ScreenViewport` requires a size and JSDom doesn't set that up
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { BeUiEvent } from "@itwin/core-bentley";
import { IModelApp, IModelConnection, SelectedViewportChangedArgs, SpatialViewState, ViewManager, ViewState } from "@itwin/core-frontend";
import { Point3d, Vector3d } from "@itwin/core-geometry";
import { UiIModelComponents, ViewportComponent } from "@itwin/imodel-components-react";
import { InstanceKey, KeySet } from "@itwin/presentation-common";
import { viewWithUnifiedSelection } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { render, waitFor } from "@testing-library/react";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Learning snippets", async () => {
  describe("Viewport", () => {
    before(async () => {
      await initialize();
      await UiIModelComponents.initialize();
    });

    after(async () => {
      await terminate();
      sinon.restore();
    });

    it("renders unified selection viewport", async function () {
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
      // eslint-disable-next-line deprecation/deprecation
      const imodel = await buildTestIModel(this, async (builder) => {
        const categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        const modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
        elementKeys.push(
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
          );
      });

      // we're not rendering on a screen, so need to stub some stuff
      setupViewportStubs();

      // render the component
      const { getByTestId } = render(
        <MyViewport imodel={imodel} initialViewState={SpatialViewState.createBlank(imodel, Point3d.createZero(), Vector3d.create(400, 400))} />,
      );
      await waitFor(() => getByTestId("viewport-component"));

      // test Unified Selection -> Hilited elements synchronization
      Presentation.selection.replaceSelection("", imodel, new KeySet([elementKeys[0]]));
      await waitFor(() => {
        expect(imodel.hilited.models.isEmpty).to.be.true;
        expect(imodel.hilited.subcategories.isEmpty).to.be.true;
        expect(imodel.hilited.elements.toId64Array())
          .to.have.lengthOf(3)
          .and.to.include.members(elementKeys.map((k) => k.id));
        expect([...imodel.selectionSet.elements])
          .to.have.lengthOf(3)
          .and.to.include.members(elementKeys.map((k) => k.id));
      });

      Presentation.selection.clearSelection("", imodel);
      await waitFor(() => {
        expect(imodel.hilited.models.isEmpty).to.be.true;
        expect(imodel.hilited.subcategories.isEmpty).to.be.true;
        expect(imodel.hilited.elements.isEmpty).to.be.true;
        expect(imodel.selectionSet.size).to.eq(0);
      });

      // test Viewport elements selection => Unified Selection synchronization
      imodel.selectionSet.replace(elementKeys[2].id);
      await waitFor(() => {
        const selection = Presentation.selection.getSelection(imodel);
        expect(selection)
          .to.satisfy((sel: KeySet) => sel.size === 1)
          .and.satisfy((sel: KeySet) => sel.has(elementKeys[2]));
      });

      imodel.selectionSet.emptyAll();
      await waitFor(() => {
        const selection = Presentation.selection.getSelection(imodel);
        expect(selection.isEmpty).to.be.true;
      });
    });
  });
});

function setupViewportStubs() {
  // `ViewportComponent` calls some of the `ViewManager` functions (gets it through `IModelApp.viewManager`)
  const viewManager = sinon.createStubInstance(ViewManager, {
    addViewport: sinon.stub(),
    dropViewport: sinon.stub(),
  });
  (viewManager as any).onSelectedViewportChanged = new BeUiEvent<SelectedViewportChangedArgs>();
  sinon.stub(IModelApp, "viewManager").get(() => viewManager as unknown as ViewManager);

  // `ScreenViewport` requires a size and JSDom doesn't set that up
  sinon.stub(HTMLElement.prototype, "clientWidth").get(() => 400);
  sinon.stub(HTMLElement.prototype, "clientHeight").get(() => 400);
}

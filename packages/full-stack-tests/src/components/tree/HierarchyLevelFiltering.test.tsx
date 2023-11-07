/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { useState } from "react";
import sinon from "sinon";
import { SelectionMode, TreeRendererProps, UiComponents } from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Ruleset } from "@itwin/presentation-common";
import { PresentationTree, PresentationTreeRenderer, usePresentationTree } from "@itwin/presentation-components";
import { buildTestIModel } from "@itwin/presentation-testing";
import { fireEvent, getByRole, getByText, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { getNodeByLabel, toggleExpandNode } from "../TreeUtils";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Learning snippets", () => {
  describe("Tree", () => {
    stubGlobals();

    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
      HTMLElement.prototype.scrollIntoView = () => {};
    });

    after(async () => {
      delete (HTMLElement.prototype as any).scrollIntoView;
      await terminate();
    });

    it("renders tree with hierarchy level filtering", async function () {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.HierarchyLevelFiltering
      function MyTree(props: { imodel: IModelConnection }) {
        const state = usePresentationTree({ imodel: props.imodel, ruleset, pagingSize: 10 });

        // width and height should generally we computed using ResizeObserver API or one of its derivatives
        const [width] = useState(400);
        const [height] = useState(600);

        if (!state) {
          return null;
        }

        // create presentation-specific tree renderer that enables hierarchy
        // level filtering
        const treeRenderer = (treeRendererProps: TreeRendererProps) => (
          <PresentationTreeRenderer {...treeRendererProps} imodel={props.imodel} modelSource={state.nodeLoader.modelSource} />
        );

        return (
          <PresentationTree
            width={width}
            height={height}
            state={state}
            selectionMode={SelectionMode.Extended}
            // supply the tree renderer we created above
            treeRenderer={treeRenderer}
          />
        );
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      // eslint-disable-next-line deprecation/deprecation
      const imodel = await buildTestIModel(this, async (builder) => {
        const categoryKey = insertSpatialCategory({ builder, codeValue: "My Category" });
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "My Model" });
        insertPhysicalElement({ builder, userLabel: "My Element 1", modelId: modelKey.id, categoryId: categoryKey.id });
        insertPhysicalElement({ builder, userLabel: "My Element 2", modelId: modelKey.id, categoryId: categoryKey.id });
      });

      // render the component
      const user = userEvent.setup();
      const { container, baseElement } = render(<MyTree imodel={imodel} />);
      await waitFor(() => getByRole(container, "tree"));

      // find & expand the model node
      const modelNode = await waitFor(() => getNodeByLabel(container, "My Model"));
      toggleExpandNode(modelNode);
      // expect 2 element nodes
      await waitFor(() => getNodeByLabel(container, "My Element 1"));
      await waitFor(() => getNodeByLabel(container, "My Element 2"));

      // open the filtering dialog
      const filteringButton = modelNode.querySelector(".presentation-components-node-action-buttons button")!;
      fireEvent.click(filteringButton);
      const filteringDialog = await waitFor(() => getByRole(baseElement, "dialog"));

      // open property selector and select the "User Label" property
      const propertySelector = await waitFor(() => {
        const input = filteringDialog.querySelector<HTMLInputElement>(".rule-property .iui-input")!;
        expect(input).to.not.be.null;
        return input;
      });
      fireEvent.focus(propertySelector);
      fireEvent.click(getByText(baseElement, "User Label"));
      await waitFor(() => expect(propertySelector.value).to.eq("User Label"));

      // focus value input box
      const propertyValueBox = filteringDialog.querySelector<HTMLInputElement>(".rule-value .iui-input")!;
      expect(propertyValueBox).to.not.be.null;
      fireEvent.focus(propertyValueBox);
      await user.type(propertyValueBox, "My Element 2");
      fireEvent.blur(propertyValueBox);
      await waitFor(() => {
        // wait for the "apply" button to become enabled
        const disabledButton = filteringDialog.querySelector(".presentation-instance-filter-dialog-apply-button[disabled]");
        if (disabledButton) {
          throw new Error(`The "Apply" button is disabled`);
        }
      });

      // do filter
      const applyFilterButton = filteringDialog.querySelector(".presentation-instance-filter-dialog-apply-button")!;
      expect(applyFilterButton).to.not.be.null;
      fireEvent.click(applyFilterButton);

      // expect 1 element node
      await waitFor(() => getNodeByLabel(container, "My Element 2"));
      expect(() => getNodeByLabel(container, "My Element 1")).to.throw;
    });
  });
});

const ruleset: Ruleset = {
  id: "elements-grouped-by-models",
  rules: [
    {
      ruleType: "RootNodes",
      specifications: [
        {
          specType: "InstanceNodesOfSpecificClasses",
          classes: { schemaName: "BisCore", classNames: ["PhysicalModel"], arePolymorphic: true },
          groupByClass: false,
          groupByLabel: false,
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("Model", "BisCore")`,
      specifications: [
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            {
              relationship: { schemaName: "BisCore", className: "ModelContainsElements" },
              direction: "Forward",
            },
          ],
          groupByClass: false,
          groupByLabel: false,
        },
      ],
    },
  ],
};

/**
 * Stubs global 'requestAnimationFrame' and 'cancelAnimationFrame' functions and 'DOMMatrix' interface.
 * 'requestAnimationFrame' and 'cancelAnimationFrame' is needed for tests using the 'react-select' component.
 * 'DOMMatrix' is needed for tests using draggable 'Dialog'.
 */
function stubGlobals() {
  const raf = global.requestAnimationFrame;
  const caf = global.cancelAnimationFrame;
  const domMatrix = global.DOMMatrix;

  before(() => {
    Object.defineProperty(global, "requestAnimationFrame", {
      writable: true,
      value: (cb: FrameRequestCallback) => {
        return setTimeout(cb, 0);
      },
    });
    Object.defineProperty(global, "cancelAnimationFrame", {
      writable: true,
      value: (handle: number) => {
        clearTimeout(handle);
      },
    });
    Object.defineProperty(global, "DOMMatrix", {
      writable: true,
      value: sinon.fake(() => ({ m41: 0, m42: 0 })),
    });
  });

  after(() => {
    Object.defineProperty(global, "requestAnimationFrame", {
      writable: true,
      value: raf,
    });
    Object.defineProperty(global, "cancelAnimationFrame", {
      writable: true,
      value: caf,
    });
    Object.defineProperty(global, "DOMMatrix", {
      writable: true,
      value: domMatrix,
    });
  });
}

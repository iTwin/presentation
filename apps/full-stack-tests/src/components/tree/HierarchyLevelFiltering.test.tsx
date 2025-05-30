/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { useState } from "react";
import sinon from "sinon";
import { SelectionMode, TreeRendererProps, UiComponents } from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Ruleset } from "@itwin/presentation-common";
import { PresentationTree, PresentationTreeRenderer, usePresentationTreeState } from "@itwin/presentation-components";
import { buildTestIModel } from "@itwin/presentation-testing";
import { initialize, terminate } from "../../IntegrationTests.js";
import { getByPlaceholderText, getByRole, getByTitle, render, waitFor } from "../../RenderUtils.js";
import { stubVirtualization } from "../../Utils.js";
import { getNodeByLabel, toggleExpandNode } from "../TreeUtils.js";

describe("Learning snippets", () => {
  describe("Tree", () => {
    stubGlobals();
    stubVirtualization();

    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
      HTMLElement.prototype.scrollIntoView = () => {};
    });

    after(async () => {
      delete (HTMLElement.prototype as any).scrollIntoView;
      UiComponents.terminate();
      await terminate();
    });

    it("renders tree with hierarchy level filtering", async function () {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.HierarchyLevelFiltering
      function MyTree(props: { imodel: IModelConnection }) {
        const state = usePresentationTreeState({ imodel: props.imodel, ruleset, pagingSize: 10 });

        // width and height should generally we computed using ResizeObserver API or one of its derivatives
        const [width] = useState(400);
        const [height] = useState(600);

        if (!state) {
          return null;
        }

        // create presentation-specific tree renderer that enables hierarchy
        // level filtering
        const treeRenderer = (treeRendererProps: TreeRendererProps) => <PresentationTreeRenderer {...treeRendererProps} nodeLoader={state.nodeLoader} />;

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
      const imodel = await buildTestIModel(this, async (builder) => {
        const categoryKey = insertSpatialCategory({ builder, codeValue: "My Category" });
        const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "My Model" });
        insertPhysicalElement({ builder, userLabel: "My Element 1", modelId: modelKey.id, categoryId: categoryKey.id });
        insertPhysicalElement({ builder, userLabel: "My Element 2", modelId: modelKey.id, categoryId: categoryKey.id });
      });

      // render the component
      const { container, baseElement, user } = render(<MyTree imodel={imodel} />, { addThemeProvider: true });
      await waitFor(() => getByRole(container, "tree"));

      // find & expand the model node
      const modelNode = await waitFor(() => getNodeByLabel(container, "My Model"));
      toggleExpandNode(modelNode);
      // expect 2 element nodes
      await waitFor(() => getNodeByLabel(container, "My Element 1"));
      await waitFor(() => getNodeByLabel(container, "My Element 2"));

      // open the filtering dialog
      const filteringButton = modelNode.querySelector(".presentation-components-node-action-buttons button")!;
      await user.click(filteringButton);
      const filteringDialog = await waitFor(() => getByRole(baseElement, "dialog"));

      // open property selector and select the "User Label" property
      const propertySelector = await waitFor(() => getByPlaceholderText<HTMLInputElement>(baseElement, "Çhóôsë pröpértý"));
      await user.click(propertySelector);
      await user.click(getByTitle(baseElement, "User Label"));
      await waitFor(() => expect(propertySelector.value).to.eq("User Label"));

      // focus value input box
      const propertyValueBox = filteringDialog.querySelector<HTMLInputElement>(".fb-property-value input")!;
      expect(propertyValueBox).to.not.be.null;
      await user.click(propertyValueBox);
      await user.type(propertyValueBox, "My Element 2");
      await user.keyboard("{Enter}");
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
      await user.click(applyFilterButton);

      // expect 1 element node
      await waitFor(() => {
        expect(() => getNodeByLabel(container, "My Element 1")).to.throw();
        expect(getNodeByLabel(container, "My Element 2")).to.not.be.undefined;
      });
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
  const domMatrix = global.DOMMatrix;

  before(() => {
    Object.defineProperty(global, "DOMMatrix", {
      writable: true,
      value: sinon.fake(() => ({ m41: 0, m42: 0 })),
    });
  });

  after(() => {
    Object.defineProperty(global, "DOMMatrix", {
      writable: true,
      value: domMatrix,
    });
  });
}

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
import { PresentationRpcInterface, Ruleset } from "@itwin/presentation-common";
import { PresentationTree, PresentationTreeRenderer, usePresentationTreeState } from "@itwin/presentation-components";
import { buildTestIModel } from "@itwin/presentation-testing";
import { initialize, terminate } from "../../IntegrationTests.js";
import { getByRole, render, waitFor } from "../../RenderUtils.js";
import { getNodeByLabel, toggleExpandNode } from "../TreeUtils.js";

describe("Learning snippets", () => {
  describe("Tree", () => {
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

    it("limits hierarchy level size", async function () {
      // stub console log to avoid hierarchy limit warning in console
      const consoleStub = sinon.stub(console, "log").callsFake(() => {});
      if (Number.parseInt(PresentationRpcInterface.interfaceVersion.split(".")[0], 10) < 4) {
        // hierarchy level size limiting requires core libraries at least @4.0
        this.skip();
      }

      const hierarchyLevelSizeLimit = 10;

      // __PUBLISH_EXTRACT_START__ Presentation.Components.HierarchyLevelLimiting
      function MyTree(props: { imodel: IModelConnection }) {
        const state = usePresentationTreeState({
          imodel: props.imodel,
          ruleset,
          pagingSize: 100,
          // supply the limit of instances to load for a single hierarchy level
          hierarchyLevelSizeLimit,
        });

        // width and height should generally we computed using ResizeObserver API or one of its derivatives
        const [width] = useState(400);
        const [height] = useState(600);

        if (!state) {
          return null;
        }

        // presentation-specific tree renderer should be used when limiting to allow filtering
        // down the results when the limit is exceeded
        const treeRenderer = (treeRendererProps: TreeRendererProps) => <PresentationTreeRenderer {...treeRendererProps} nodeLoader={state.nodeLoader} />;

        return <PresentationTree width={width} height={height} state={state} selectionMode={SelectionMode.Extended} treeRenderer={treeRenderer} />;
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      const imodel = await buildTestIModel(this, async (builder) => {
        const categoryKey = insertSpatialCategory({ builder, codeValue: "My Category" });
        const modelKeyA = insertPhysicalModelWithPartition({ builder, codeValue: "My Model A" });
        for (let i = 0; i < 10; ++i) {
          insertPhysicalElement({ builder, userLabel: `A element ${i + 1}`, modelId: modelKeyA.id, categoryId: categoryKey.id });
        }
        const modelKeyB = insertPhysicalModelWithPartition({ builder, codeValue: "My Model B" });
        for (let i = 0; i < 11; ++i) {
          insertPhysicalElement({ builder, userLabel: `B element ${i + 1}`, modelId: modelKeyB.id, categoryId: categoryKey.id });
        }
      });

      // render the component
      const { container, getByText } = render(<MyTree imodel={imodel} />, { addThemeProvider: true });
      await waitFor(() => getByRole(container, "tree"));

      // find & expand both model nodes
      const modelNodeA = await waitFor(() => getNodeByLabel(container, "My Model A"));
      toggleExpandNode(modelNodeA);

      const modelNodeB = await waitFor(() => getNodeByLabel(container, "My Model B"));
      toggleExpandNode(modelNodeB);

      // expect A model to have child nodes
      for (let i = 0; i < 10; ++i) {
        await waitFor(() => getNodeByLabel(container, `A element ${i + 1}`));
      }

      // expect B model to not have any children
      for (let i = 0; i < 11; ++i) {
        expect(() => getNodeByLabel(container, `B element ${i + 1}`)).to.throw();
      }
      await waitFor(() => expect(getByText(`thèré ârë möré îtëms thâñ älløwèd límît õf ${hierarchyLevelSizeLimit}`, { exact: false })).is.not.null);
      consoleStub.restore();
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

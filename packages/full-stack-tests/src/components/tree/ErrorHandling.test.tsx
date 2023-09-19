/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { useState } from "react";
import sinon from "sinon";
import { ControlledTree, SelectionMode, TreeRendererProps, UiComponents, useTreeModel } from "@itwin/components-react";
import { Guid } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Ruleset } from "@itwin/presentation-common";
import { PresentationTreeRenderer, usePresentationTreeNodeLoader, useUnifiedSelectionTreeEventHandler } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { getByRole, render, waitFor } from "@testing-library/react";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { getNodeByLabel, toggleExpandNode } from "../TreeUtils";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Learning snippets", () => {
  describe("Tree", () => {
    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
      HTMLElement.prototype.scrollIntoView = () => {};
    });

    after(async () => {
      delete (HTMLElement.prototype as any).scrollIntoView;
      await terminate();
    });

    it("handles errors", async function () {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.Tree.ErrorHandling
      function MyTree(props: { imodel: IModelConnection }) {
        const { nodeLoader } = usePresentationTreeNodeLoader({
          imodel: props.imodel,
          ruleset,
          pagingSize: 100,
        });

        // presentation-specific tree renderer takes care of handling errors when requesting nodes
        const treeRenderer = (treeRendererProps: TreeRendererProps) => <PresentationTreeRenderer {...treeRendererProps} nodeLoader={nodeLoader} />;

        // width and height should generally we computed using ResizeObserver API or one of its derivatives
        const [width] = useState(400);
        const [height] = useState(600);

        return (
          <ControlledTree
            width={width}
            height={height}
            selectionMode={SelectionMode.Extended}
            nodeLoader={nodeLoader}
            eventsHandler={useUnifiedSelectionTreeEventHandler({ nodeLoader })}
            model={useTreeModel(nodeLoader.modelSource)}
            treeRenderer={treeRenderer}
          />
        );
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      // eslint-disable-next-line deprecation/deprecation
      const imodel = await buildTestIModel(this, (builder) => {
        const categoryKey = insertSpatialCategory({ builder, label: "My Category" });
        const modelKeyA = insertPhysicalModelWithPartition({ builder, label: "My Model A" });
        const modelKeyB = insertPhysicalModelWithPartition({ builder, label: "My Model B" });
        for (let i = 0; i < 2; ++i) {
          insertPhysicalElement({ builder, userLabel: `A element ${i + 1}`, modelId: modelKeyA.id, categoryId: categoryKey.id });
          insertPhysicalElement({ builder, userLabel: `B element ${i + 1}`, modelId: modelKeyB.id, categoryId: categoryKey.id });
        }
      });

      // render the component
      const { container, getByText, rerender } = render(<MyTree imodel={imodel} />);
      await waitFor(() => getByRole(container, "tree"));

      // find & expand model A node
      const modelNodeA = await waitFor(() => getNodeByLabel(container, "My Model A"));
      toggleExpandNode(modelNodeA);

      // expect the model to have 2 child nodes
      await waitFor(() => getNodeByLabel(container, `A element 1`));
      await waitFor(() => getNodeByLabel(container, `A element 2`));

      // simulate a network error for B model node's children
      sinon.stub(Presentation.presentation, "getNodesAndCount").throws(new Error("Network error"));

      // find & expand model B node
      const modelNodeB = await waitFor(() => getNodeByLabel(container, "My Model B"));
      toggleExpandNode(modelNodeB);

      // expect B model to have a single error node
      await waitFor(() => expect(getByText("Èrrór ¢rëätíñg thë hìérärçhý lévêl")).is.not.null);
      expect(() => getNodeByLabel(container, `B element 1`)).to.throw();
      expect(() => getNodeByLabel(container, `B element 2`)).to.throw();

      // now try to force-rerender the tree to see how the error is handled at the root nodes' level
      rerender(<MyTree key={Guid.createValue()} imodel={imodel} />);
      await waitFor(() => getByRole(container, "tree"));
      expect(() => getNodeByLabel(container, `My Model A`)).to.throw();
      expect(() => getNodeByLabel(container, `My Model B`)).to.throw();
      expect(getByText("Èrrór ¢rëätíñg thë hìérärçhý lévêl")).is.not.null;
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

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { useState } from "react";
import { ControlledTree, SelectionMode, TreeRendererProps, UiComponents, useTreeModel } from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Ruleset } from "@itwin/presentation-common";
import { PresentationTreeRenderer, usePresentationTreeNodeLoader, useUnifiedSelectionTreeEventHandler } from "@itwin/presentation-components";
import { buildTestIModel } from "@itwin/presentation-testing";
import { getByRole, render, waitFor } from "@testing-library/react";
import { insertPhysicalElement, insertPhysicalModel, insertSpatialCategory } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { getNodeByLabel, toggleExpandNode } from "../../TreeUtils";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Learning snippets", () => {

  describe("Hierarchy level limiting", () => {

    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
      HTMLElement.prototype.scrollIntoView = () => { };
    });

    after(async () => {
      delete (HTMLElement.prototype as any).scrollIntoView;
      await terminate();
    });

    it("limits hierarchy level size", async function () {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.HierarchyLevelLimiting
      function MyTree(props: { imodel: IModelConnection }) {
        const { nodeLoader } = usePresentationTreeNodeLoader({
          imodel: props.imodel,
          ruleset,
          pagingSize: 10,
          // supply the limit of instances to load for a single hierarchy level
          hierarchyLevelSizeLimit: 10,
        });

        // presentation-specific tree renderer should be used when limiting to allow filtering
        // down the results when the limit is exceeded
        const treeRenderer = (treeRendererProps: TreeRendererProps) => (
          <PresentationTreeRenderer
            {...treeRendererProps}
            imodel={props.imodel}
            modelSource={nodeLoader.modelSource}
          />
        );

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
      const imodel = await buildTestIModel(this, (builder) => {
        const categoryKey = insertSpatialCategory(builder, "My Category");
        const modelKeyA = insertPhysicalModel(builder, "My Model A");
        for (let i = 0; i < 10; ++i)
          insertPhysicalElement(builder, `A element ${i + 1}`, modelKeyA.id, categoryKey.id);
        const modelKeyB = insertPhysicalModel(builder, "My Model B");
        for (let i = 0; i < 11; ++i)
          insertPhysicalElement(builder, `B element ${i + 1}`, modelKeyB.id, categoryKey.id);
      });

      // render the component
      const { container } = render(
        <MyTree imodel={imodel} />
      );
      await waitFor(() => getByRole(container, "tree"));

      // find & expand both model nodes
      const modelNodeA = await waitFor(() => getNodeByLabel(container, "My Model A"));
      toggleExpandNode(modelNodeA);

      const modelNodeB = await waitFor(() => getNodeByLabel(container, "My Model B"));
      toggleExpandNode(modelNodeB);

      // expect A model to have child nodes
      for (let i = 0; i < 10; ++i)
        await waitFor(() => getNodeByLabel(container, `A element ${i + 1}`));

      // expect B model to not have any children
      for (let i = 0; i < 11; ++i)
        expect(() => getNodeByLabel(container, `B element ${i + 1}`)).to.throw;
      await waitFor(() => expect(container.querySelector(".presentation-components-info-node")).is.not.null);
    });

  });

});

const ruleset: Ruleset = {
  id: "elements-grouped-by-models",
  rules: [{
    ruleType: "RootNodes",
    specifications: [{
      specType: "InstanceNodesOfSpecificClasses",
      classes: { schemaName: "BisCore", classNames: ["PhysicalModel"], arePolymorphic: true },
      groupByClass: false,
      groupByLabel: false,
    }],
  }, {
    ruleType: "ChildNodes",
    condition: "ParentNode.IsOfClass(\"Model\", \"BisCore\")",
    specifications: [{
      specType: "RelatedInstanceNodes",
      relationshipPaths: [{
        relationship: { schemaName: "BisCore", className: "ModelContainsElements" },
        direction: "Forward",
      }],
      groupByClass: false,
      groupByLabel: false,
    }],
  }],
};

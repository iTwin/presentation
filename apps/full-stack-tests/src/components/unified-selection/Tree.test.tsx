/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { useCallback, useState } from "react";
import { SelectionMode, UiComponents } from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { InstanceKey, KeySet, Ruleset, RuleTypes } from "@itwin/presentation-common";
import {
  PresentationTree,
  PresentationTreeEventHandlerProps,
  UnifiedSelectionTreeEventHandler,
  usePresentationTreeState,
} from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { initialize, terminate } from "../../IntegrationTests.js";
import { act, fireEvent, render, waitFor } from "../../RenderUtils.js";
import { getNodeByLabel, isNodeSelectedInTree, toggleExpandNode } from "../TreeUtils.js";

describe("Learning snippets", async () => {
  describe("Tree", () => {
    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
    });

    after(async () => {
      UiComponents.terminate();
      await terminate();
    });

    it("renders unified selection tree", async function () {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.UnifiedSelection.Tree
      function MyTree(props: { imodel: IModelConnection }) {
        // create a node loader for given iModel and ruleset
        const state = usePresentationTreeState({
          imodel: props.imodel,
          ruleset,
          pagingSize: 10,
          // create a tree events handler that synchronizes tree nodes' selection with unified selection
          eventHandlerFactory: useCallback(
            (eventHandlerProps: PresentationTreeEventHandlerProps) => new UnifiedSelectionTreeEventHandler({ nodeLoader: eventHandlerProps.nodeLoader }),
            [],
          ),
        });

        // width and height should generally we computed using ResizeObserver API or one of its derivatives
        const [width] = useState(400);
        const [height] = useState(600);

        if (!state) {
          return null;
        }

        return <PresentationTree width={width} height={height} state={state} selectionMode={SelectionMode.Extended} />;
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      let modelKey: InstanceKey;
      let elementKey: InstanceKey;
      const imodel = await buildTestIModel(this, async (builder) => {
        const categoryKey = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
        modelKey = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
        elementKey = insertPhysicalElement({ builder, fullClassNameSeparator: ":", userLabel: "My Element", modelId: modelKey.id, categoryId: categoryKey.id });
      });

      // render the component
      const { container, getByRole } = render(<MyTree imodel={imodel} />);
      await waitFor(() => getByRole("tree"));

      // find & expand the model node
      const modelNode = await waitFor(() => getNodeByLabel(container, "My Model"));
      toggleExpandNode(modelNode);
      // find the element node
      const elementNode = await waitFor(() => getNodeByLabel(container, "My Element"));

      // test Unified Selection -> Tree selection synchronization
      act(() => Presentation.selection.replaceSelection("", imodel, new KeySet([modelKey!])));
      await waitFor(() => {
        expect(isNodeSelectedInTree(modelNode)).to.be.true;
        expect(isNodeSelectedInTree(elementNode)).to.be.false;
      });
      act(() => Presentation.selection.replaceSelection("", imodel, new KeySet([elementKey!])));
      await waitFor(() => {
        expect(isNodeSelectedInTree(modelNode)).to.be.false;
        expect(isNodeSelectedInTree(elementNode)).to.be.true;
      });

      // test Tree selection -> Unified Selection synchronization
      fireEvent.click(modelNode);
      await waitFor(() => {
        expect(getInstanceKeysInUnifiedSelection(imodel)).to.deep.eq([modelKey]);
      });
      fireEvent.click(elementNode);
      await waitFor(() => {
        expect(getInstanceKeysInUnifiedSelection(imodel)).to.deep.eq([elementKey]);
      });
    });
  });
});

function getInstanceKeysInUnifiedSelection(imodel: IModelConnection) {
  const map = Presentation.selection.getSelection(imodel).instanceKeys;
  const arr = new Array<InstanceKey>();
  map.forEach((ids, className) => ids.forEach((id) => arr.push({ className, id })));
  return arr;
}

const ruleset: Ruleset = {
  id: "elements-grouped-by-models",
  rules: [
    {
      ruleType: RuleTypes.RootNodes,
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
      ruleType: RuleTypes.ChildNodes,
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

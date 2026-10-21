/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { useState } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SelectionMode, UiComponents } from "@itwin/components-react";
import { withEditTxn } from "@itwin/core-backend";
import { Guid } from "@itwin/core-bentley";
import { IModelApp } from "@itwin/core-frontend";
import { PresentationTree, PresentationTreeRenderer, usePresentationTreeState } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { getByRole, render, waitFor } from "../../RenderUtils.js";
import { isIterableManager } from "../../Utils.js";
import { getNodeByLabel, toggleExpandNode } from "../TreeUtils.js";

import type { TreeRendererProps } from "@itwin/components-react";
import type { IModelConnection } from "@itwin/core-frontend";
import type { Ruleset } from "@itwin/presentation-common";

describe("Learning snippets", () => {
  describe("Tree", () => {
    beforeAll(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
      HTMLElement.prototype.scrollIntoView = () => {};
    });

    afterAll(async () => {
      delete (HTMLElement.prototype as any).scrollIntoView;
      UiComponents.terminate();
      await terminate();
    });

    it("handles errors", async () => {
      // stub console log to avoid expected network error in console
      const consoleStub = vi.spyOn(console, "error").mockImplementation(() => {});
      // __PUBLISH_EXTRACT_START__ Presentation.Components.Tree.ErrorHandling
      function MyTree(props: { imodel: IModelConnection }) {
        const state = usePresentationTreeState({ imodel: props.imodel, ruleset, pagingSize: 100 });

        // width and height should generally we computed using ResizeObserver API or one of its derivatives
        const [width] = useState(400);
        const [height] = useState(600);

        if (!state) {
          return null;
        }

        // presentation-specific tree renderer takes care of handling errors when requesting nodes
        const treeRenderer = (treeRendererProps: TreeRendererProps) => (
          <PresentationTreeRenderer {...treeRendererProps} nodeLoader={state.nodeLoader} />
        );

        return (
          <PresentationTree
            width={width}
            height={height}
            state={state}
            selectionMode={SelectionMode.Extended}
            treeRenderer={treeRenderer}
          />
        );
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      const { imodelConnection } = await buildTestIModel((imodel) => {
        withEditTxn(imodel, (txn) => {
          const categoryKey = insertSpatialCategory({ txn, codeValue: "My Category" });
          const modelKeyA = insertPhysicalModelWithPartition({ txn, codeValue: "My Model A" });
          const modelKeyB = insertPhysicalModelWithPartition({ txn, codeValue: "My Model B" });
          for (let i = 0; i < 2; ++i) {
            insertPhysicalElement({
              txn,
              userLabel: `A element ${i + 1}`,
              modelId: modelKeyA.id,
              categoryId: categoryKey.id,
            });
            insertPhysicalElement({
              txn,
              userLabel: `B element ${i + 1}`,
              modelId: modelKeyB.id,
              categoryId: categoryKey.id,
            });
          }
        });
      });

      // render the component
      const { container, getByText, rerender } = render(<MyTree imodel={imodelConnection} />);
      await waitFor(() => getByRole(container, "tree"));

      // find & expand model A node
      const modelNodeA = await waitFor(() => getNodeByLabel(container, "My Model A"));
      toggleExpandNode(modelNodeA);

      // expect the model to have 2 child nodes
      await waitFor(() => getNodeByLabel(container, `A element 1`));
      await waitFor(() => getNodeByLabel(container, `A element 2`));

      // simulate a network error for B model node's children
      const manager = Presentation.presentation;
      if (isIterableManager(manager)) {
        vi.spyOn(manager, "getNodesIterator").mockImplementation(() => {
          throw new Error("Network error");
        });
      } else {
        vi.spyOn(Presentation.presentation, "getNodesAndCount").mockImplementation(() => {
          throw new Error("Network error");
        });
      }

      // find & expand model B node
      const modelNodeB = await waitFor(() => getNodeByLabel(container, "My Model B"));
      toggleExpandNode(modelNodeB);

      // expect B model to have a single error node
      // cspell:disable-next-line
      await waitFor(() => expect(getByText("Èrrór ¢rëätíñg thë hìérärçhý lévêl")).not.toBeNull());
      expect(() => getNodeByLabel(container, `B element 1`)).toThrow();
      expect(() => getNodeByLabel(container, `B element 2`)).toThrow();

      // now try to force-rerender the tree to see how the error is handled at the root nodes' level
      rerender(<MyTree key={Guid.createValue()} imodel={imodelConnection} />);
      await waitFor(() => getByRole(container, "tree"));
      expect(() => getNodeByLabel(container, `My Model A`)).toThrow();
      expect(() => getNodeByLabel(container, `My Model B`)).toThrow();
      // cspell:disable-next-line
      expect(getByText("Èrrór ¢rëätíñg thë hìérärçhý lévêl")).not.toBeNull();
      consoleStub.mockRestore();
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
            { relationship: { schemaName: "BisCore", className: "ModelContainsElements" }, direction: "Forward" },
          ],
          groupByClass: false,
          groupByLabel: false,
        },
      ],
    },
  ],
};

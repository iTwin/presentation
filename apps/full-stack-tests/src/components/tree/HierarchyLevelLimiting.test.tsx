/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { useState } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SelectionMode, UiComponents } from "@itwin/components-react";
import { IModelApp } from "@itwin/core-frontend";
import { PresentationTree, PresentationTreeRenderer, usePresentationTreeState } from "@itwin/presentation-components";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { getByRole, render, waitFor } from "../../RenderUtils.js";
import { getNodeByLabel, toggleExpandNode } from "../TreeUtils.js";

import type { TreeRendererProps } from "@itwin/components-react";
import type { IModelConnection } from "@itwin/core-frontend";
import type { Ruleset } from "@itwin/presentation-common";

/* eslint-disable @typescript-eslint/no-deprecated */

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

    // TODO: remove skip once core dependencies are bumped to >5.8.0
    it.skip("limits hierarchy level size", async () => {
      // stub console log to avoid hierarchy limit warning in console
      const consoleStub = vi.spyOn(console, "log").mockImplementation(() => {});

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
      const { imodel } = await buildTestIModel(async (builder) => {
        const categoryKey = insertSpatialCategory({ builder, codeValue: "My Category" });
        const modelKeyA = insertPhysicalModelWithPartition({ builder, codeValue: "My Model A" });
        for (let i = 0; i < 10; ++i) {
          insertPhysicalElement({
            builder,
            userLabel: `A element ${i + 1}`,
            modelId: modelKeyA.id,
            categoryId: categoryKey.id,
          });
        }
        const modelKeyB = insertPhysicalModelWithPartition({ builder, codeValue: "My Model B" });
        for (let i = 0; i < 11; ++i) {
          insertPhysicalElement({
            builder,
            userLabel: `B element ${i + 1}`,
            modelId: modelKeyB.id,
            categoryId: categoryKey.id,
          });
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
        expect(() => getNodeByLabel(container, `B element ${i + 1}`)).toThrow();
      }
      // cspell:disable-next-line
      await waitFor(() =>
        expect(
          getByText(`thèré ârë möré îtëms thâñ älløwèd límît õf ${hierarchyLevelSizeLimit}`, { exact: false }),
        ).not.toBeNull(),
      );

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

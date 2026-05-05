/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { TreeErrorRenderer } from "../../presentation-hierarchies-react/stratakit/TreeErrorRenderer.js";
import { COLOR_SCHEMES, renderWithTheme, validateSnapshot } from "./RenderUtils.js";
import { createTreeNode } from "./TestUtils.js";

import type { TreeErrorRendererProps } from "../../presentation-hierarchies-react/stratakit/TreeErrorRenderer.js";

async function renderTreeErrorRenderer(
  props: TreeErrorRendererProps,
  colorScheme: "light" | "dark",
  waitForText: string,
) {
  const result = await renderWithTheme(
    <div style={{ width: 300, minHeight: 200 }}>
      <TreeErrorRenderer {...props} />
    </div>,
    { colorScheme },
  );
  await result.locator.getByRole("button").click();
  await expect.element(result.locator.getByText(waitForText)).toBeVisible();
  return result;
}

COLOR_SCHEMES.forEach((colorScheme) => {
  describe(`[${colorScheme}] <TreeErrorRenderer />`, () => {
    const defaultProps: Omit<TreeErrorRendererProps, "errorNodes"> = {
      treeLabel: "Test Tree",
      reloadTree: vi.fn(),
      scrollToNode: vi.fn(),
      getHierarchyLevelDetails: vi.fn(),
    };

    beforeEach(async () => {
      await page.viewport(300, 200);
    });

    it("renders with unknown error", async () => {
      const errorNodes = [
        createTreeNode({
          id: "node-1",
          label: "Node 1",
          errors: [{ id: "error-1", type: "Unknown", message: "Something went wrong" }],
        }),
      ];
      const { locator } = await renderTreeErrorRenderer(
        { ...defaultProps, errorNodes },
        colorScheme,
        "Something went wrong",
      );
      await validateSnapshot(locator);
    });

    it("renders with children load error", async () => {
      const errorNodes = [
        createTreeNode({
          id: "node-1",
          label: "Node 1",
          errors: [{ id: "error-1", type: "ChildrenLoad", message: "Failed to load" }],
        }),
      ];
      const { locator } = await renderTreeErrorRenderer(
        { ...defaultProps, errorNodes },
        colorScheme,
        "Failed to create hierarchy",
      );
      await validateSnapshot(locator);
    });

    it("renders with result set too large error", async () => {
      const errorNodes = [
        createTreeNode({
          id: "node-1",
          label: "Node 1",
          errors: [{ id: "error-1", type: "ResultSetTooLarge", resultSetSizeLimit: 1000 }],
        }),
      ];
      const { locator } = await renderTreeErrorRenderer({ ...defaultProps, errorNodes }, colorScheme, "1000+ items");
      await validateSnapshot(locator);
    });

    it("renders with result set too large error with filtering", async () => {
      const errorNodes = [
        createTreeNode({
          id: "node-1",
          label: "Node 1",
          isFilterable: true,
          errors: [{ id: "error-1", type: "ResultSetTooLarge", resultSetSizeLimit: 1000 }],
        }),
      ];
      const { locator } = await renderTreeErrorRenderer(
        { ...defaultProps, filterHierarchyLevel: vi.fn(), errorNodes },
        colorScheme,
        "1000+ items",
      );
      await validateSnapshot(locator);
    });

    it("renders with no filter matches error", async () => {
      const errorNodes = [
        createTreeNode({ id: "node-1", label: "Node 1", errors: [{ id: "error-1", type: "NoFilterMatches" }] }),
      ];
      const { locator } = await renderTreeErrorRenderer(
        { ...defaultProps, filterHierarchyLevel: vi.fn(), errorNodes },
        colorScheme,
        "No matches for current filter",
      );
      await validateSnapshot(locator);
    });

    it("renders with multiple error nodes", async () => {
      const errorNodes = [
        createTreeNode({
          id: "node-1",
          label: "Node 1",
          errors: [{ id: "error-1", type: "Unknown", message: "Error on node 1" }],
        }),
        createTreeNode({
          id: "node-2",
          label: "Node 2",
          errors: [{ id: "error-2", type: "ChildrenLoad", message: "Failed to load children" }],
        }),
      ];
      const { locator } = await renderTreeErrorRenderer(
        { ...defaultProps, errorNodes },
        colorScheme,
        "Failed to create hierarchy",
      );
      await validateSnapshot(locator);
    });
  });
});

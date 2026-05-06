/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { TreeActionBase } from "../../presentation-hierarchies-react/stratakit/TreeAction.js";
import { TreeNodeFilterAction } from "../../presentation-hierarchies-react/stratakit/TreeNodeFilterAction.js";
import { TreeNodeRenameAction } from "../../presentation-hierarchies-react/stratakit/TreeNodeRenameAction.js";
import { StrataKitTreeRenderer } from "../../presentation-hierarchies-react/stratakit/TreeRenderer.js";
import { COLOR_SCHEMES, renderWithTheme, validateSnapshot } from "./RenderUtils.js";
import { createTreeNode } from "./TestUtils.js";

import placeholderSvg from "@stratakit/icons/placeholder.svg";

import type { ComponentProps } from "react";

type StrataKitTreeRendererProps = ComponentProps<typeof StrataKitTreeRenderer>;

function createDefaultProps(overrides?: Partial<StrataKitTreeRendererProps>): StrataKitTreeRendererProps {
  return {
    rootNodes: [],
    treeLabel: "Test Tree",
    expandNode: vi.fn(),
    selectNodes: vi.fn(),
    isNodeSelected: () => false,
    reloadTree: vi.fn(),
    getHierarchyLevelDetails: vi.fn(),
    ...overrides,
  };
}

async function renderTree(props: StrataKitTreeRendererProps, colorScheme: "light" | "dark") {
  return renderWithTheme(
    <div style={{ height: 100, width: 300 }}>
      <StrataKitTreeRenderer {...props} />
    </div>,
    { colorScheme },
  );
}

COLOR_SCHEMES.forEach((colorScheme) => {
  describe(`[${colorScheme}] <StrataKitTreeRenderer />`, () => {
    beforeEach(async () => {
      await page.viewport(300, 100);
    });

    it("renders tree with single root node", async () => {
      const props = createDefaultProps({ rootNodes: [createTreeNode({ id: "node-1", label: "Root Node" })] });
      const { locator } = await renderTree(props, colorScheme);
      await expect.element(locator.getByText("Root Node")).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with expanded parent and children", async () => {
      const props = createDefaultProps({
        rootNodes: [
          createTreeNode({
            id: "parent",
            label: "Parent Node",
            isExpanded: true,
            children: [
              createTreeNode({ id: "child-1", label: "Child 1" }),
              createTreeNode({ id: "child-2", label: "Child 2" }),
            ],
          }),
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      await expect.element(locator.getByText("Child 2")).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with loading placeholder", async () => {
      const props = createDefaultProps({
        rootNodes: [
          createTreeNode({ id: "parent", label: "Loading Node", isExpanded: true, isLoading: true, children: true }),
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      await expect.element(locator.getByText("Loading Node")).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with selected node", async () => {
      const props = createDefaultProps({
        rootNodes: [
          createTreeNode({ id: "node-1", label: "Selected Node" }),
          createTreeNode({ id: "node-2", label: "Unselected Node" }),
        ],
        isNodeSelected: (nodeId) => nodeId === "node-1",
      });
      const { locator } = await renderTree(props, colorScheme);
      await expect.element(locator.getByText("Selected Node", { exact: true })).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with error nodes", async () => {
      const props = createDefaultProps({
        rootNodes: [
          createTreeNode({
            id: "node-1",
            label: "Error Node",
            errors: [{ id: "error-1", type: "Unknown", message: "Something went wrong" }],
          }),
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      await expect.element(locator.getByRole("treeitem", { name: "Error Node" })).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with children load error", async () => {
      const props = createDefaultProps({
        rootNodes: [
          createTreeNode({
            id: "node-1",
            label: "Failed Node",
            errors: [{ id: "error-1", type: "ChildrenLoad", message: "Failed to load children" }],
          }),
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      await expect.element(locator.getByRole("treeitem", { name: "Failed Node" })).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with inline actions", async () => {
      const props = createDefaultProps({
        rootNodes: [createTreeNode({ id: "node-1", label: "Node with actions" })],
        getInlineActions: () => [
          <TreeActionBase key="action-1" label="Action 1" icon={placeholderSvg} onClick={vi.fn()} />,
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      await locator.getByText("Node with actions").hover();
      await expect.element(locator.getByRole("button", { name: "Action 1" })).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with always visible inline actions", async () => {
      const props = createDefaultProps({
        rootNodes: [createTreeNode({ id: "node-1", label: "Node with visible actions" })],
        getInlineActions: () => [
          <TreeActionBase key="action-1" label="Action 1" icon={placeholderSvg} onClick={vi.fn()} visible={true} />,
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      await expect.element(locator.getByRole("button", { name: "Action 1" })).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with menu actions", async () => {
      const props = createDefaultProps({
        rootNodes: [
          createTreeNode({ id: "node-1", label: "Node with menu" }),
          createTreeNode({ id: "node-2", label: "Node 2" }),
        ],
        getMenuActions: () => [
          <TreeActionBase key="action-1" label="Menu Action 1" icon={placeholderSvg} onClick={vi.fn()} />,
          <TreeActionBase key="action-2" label="Menu Action 2" icon={placeholderSvg} onClick={vi.fn()} />,
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      const node = locator.getByText("Node with menu");
      await expect.element(node).toBeVisible();
      await node.hover();
      await locator.getByRole("button", { name: "More" }).click();
      await expect.element(page.getByText("Menu Action 1")).toBeVisible();
      await validateSnapshot(locator, { skipA11y: ["aria-hidden-focus"] });
    });

    it("renders tree with context menu actions", async () => {
      const props = createDefaultProps({
        rootNodes: [
          createTreeNode({ id: "node-1", label: "Node with context menu" }),
          createTreeNode({ id: "node-2", label: "Node 2" }),
        ],
        getContextMenuActions: () => [
          <TreeActionBase key="action-1" label="Context Action 1" icon={placeholderSvg} onClick={vi.fn()} />,
          <TreeActionBase key="action-2" label="Context Action 2" icon={placeholderSvg} onClick={vi.fn()} />,
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      await locator.getByText("Node with context menu").click({ button: "right" });
      await expect.element(page.getByText("Context Action 1")).toBeVisible();
      // `aria-required-children` is being triggered because anchor element of context menu is rendered next to `treeitem` under `tree` and
      // it expects that `tree` contains only `treeitem` children.
      await validateSnapshot(locator, { skipA11y: ["aria-hidden-focus", "aria-required-children"] });
    });

    it("renders tree with filter action on filterable node", async () => {
      const props = createDefaultProps({
        rootNodes: [createTreeNode({ id: "node-1", label: "Filterable Node", isFilterable: true })],
        getInlineActions: ({ targetNode }) => [
          <TreeNodeFilterAction key="filter" node={targetNode} onFilter={vi.fn()} getHierarchyLevelDetails={vi.fn()} />,
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      const node = locator.getByText("Filterable Node");
      await expect.element(node).toBeVisible();
      await node.hover();
      await expect.element(locator.getByRole("button", { name: "Filter" })).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with active filter indicator", async () => {
      const props = createDefaultProps({
        rootNodes: [createTreeNode({ id: "node-1", label: "Filtered Node", isFilterable: true, isFiltered: true })],
        getInlineActions: ({ targetNode }) => [
          <TreeNodeFilterAction key="filter" node={targetNode} onFilter={vi.fn()} getHierarchyLevelDetails={vi.fn()} />,
        ],
      });
      const { locator } = await renderTree(props, colorScheme);
      await expect.element(locator.getByText("Filtered Node")).toBeVisible();
      await validateSnapshot(locator);
    });

    it("renders tree with rename action", async () => {
      const props = createDefaultProps({
        rootNodes: [createTreeNode({ id: "node-1", label: "Renaming Node" })],
        getEditingProps: () => ({ onLabelChanged: vi.fn() }),
        getMenuActions: ({ targetNode }) => [<TreeNodeRenameAction key="rename" node={targetNode} />],
      });
      const { locator } = await renderTree(props, colorScheme);
      const node = locator.getByText("Renaming Node");
      await expect.element(node).toBeVisible();
      await node.hover();
      await locator.getByRole("button", { name: "More" }).click();
      await expect.element(page.getByText("Rename", { exact: true })).toBeVisible();
      await validateSnapshot(locator, { skipA11y: ["aria-hidden-focus"] });
    });
  });
});

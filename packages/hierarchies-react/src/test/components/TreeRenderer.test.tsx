/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { TreeActionBase } from "../../presentation-hierarchies-react/stratakit/TreeAction.js";
import { TreeNodeFilterAction } from "../../presentation-hierarchies-react/stratakit/TreeNodeFilterAction.js";
import { TreeNodeRenameAction } from "../../presentation-hierarchies-react/stratakit/TreeNodeRenameAction.js";
import { StrataKitTreeRenderer } from "../../presentation-hierarchies-react/stratakit/TreeRenderer.js";
import { COLOR_SCHEMES, renderWithTheme, validateSnapshot } from "./RenderUtils.js";
import { createTreeNode } from "./TestUtils.js";

import placeholderSvg from "@stratakit/icons/placeholder.svg";

import type { ComponentProps, ReactNode, Ref } from "react";
import type { StrataKitTreeRendererAttributes } from "../../presentation-hierarchies-react/stratakit/TreeRenderer.js";
import type { TreeNode } from "../../presentation-hierarchies-react/TreeNode.js";

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

function TreeContainer({ height, width, children }: { height?: number; width?: number; children: ReactNode }) {
  return <div style={{ height: height ?? 100, width: width ?? 300 }}>{children}</div>;
}

async function renderTree(
  props: StrataKitTreeRendererProps,
  colorScheme: "light" | "dark",
  options?: { height?: number; width?: number },
) {
  return renderWithTheme(
    <TreeContainer height={options?.height} width={options?.width}>
      <StrataKitTreeRenderer {...props} />
    </TreeContainer>,
    { colorScheme },
  );
}

function TreeWithExpansionState({
  initialRootNodes,
  treeRef,
  ...props
}: Omit<StrataKitTreeRendererProps, "rootNodes" | "expandNode"> & {
  initialRootNodes: TreeNode[];
  treeRef: Ref<StrataKitTreeRendererAttributes>;
}) {
  const [rootNodes, setRootNodes] = useState(initialRootNodes);
  const expandNode = (nodeId: string, isExpanded: boolean) =>
    setRootNodes((nodes) => setNodeExpanded(nodes, nodeId, isExpanded));
  return (
    <TreeContainer>
      <StrataKitTreeRenderer {...props} ref={treeRef} rootNodes={rootNodes} expandNode={expandNode} />
    </TreeContainer>
  );
}

function setNodeExpanded(nodes: TreeNode[], nodeId: string, isExpanded: boolean): TreeNode[] {
  return nodes.map((node) => ({
    ...node,
    isExpanded: node.id === nodeId ? isExpanded : node.isExpanded,
    children: node.children === true ? true : setNodeExpanded(node.children, nodeId, isExpanded),
  }));
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

    it("moves focus from a loading placeholder to its loaded child", async () => {
      const props = createDefaultProps();
      const renderTreeWithNodes = (rootNodes: StrataKitTreeRendererProps["rootNodes"]) => (
        <TreeContainer>
          <StrataKitTreeRenderer {...props} rootNodes={rootNodes} />
        </TreeContainer>
      );
      const { locator, rerender } = await renderWithTheme(
        renderTreeWithNodes([
          createTreeNode({ id: "parent", label: "Parent", isExpanded: true, isLoading: true, children: true }),
        ]),
        { colorScheme },
      );

      (locator.getByRole("treeitem", { name: "Loading" }).element() as HTMLElement).focus();
      await rerender(
        renderTreeWithNodes([
          createTreeNode({
            id: "parent",
            label: "Parent",
            isExpanded: true,
            children: [createTreeNode({ id: "child", label: "Loaded Child" })],
          }),
        ]),
      );

      await expect.element(locator.getByRole("treeitem", { name: "Loaded Child" })).toHaveFocus();
    });

    it("returns focus to the parent when loading children fails", async () => {
      const props = createDefaultProps();
      const renderTreeWithNodes = (rootNodes: StrataKitTreeRendererProps["rootNodes"]) => (
        <TreeContainer>
          <StrataKitTreeRenderer {...props} rootNodes={rootNodes} />
        </TreeContainer>
      );
      const { locator, rerender } = await renderWithTheme(
        renderTreeWithNodes([
          createTreeNode({ id: "parent", label: "Parent", isExpanded: true, isLoading: true, children: true }),
        ]),
        { colorScheme },
      );

      (locator.getByRole("treeitem", { name: "Loading" }).element() as HTMLElement).focus();
      await rerender(
        renderTreeWithNodes([
          createTreeNode({
            id: "parent",
            label: "Parent",
            isExpanded: true,
            errors: [{ id: "children-error", type: "ChildrenLoad", message: "Failed to load children" }],
          }),
        ]),
      );

      await expect.element(locator.getByRole("treeitem", { name: "Parent" })).toHaveFocus();
    });

    it("does not move focus on children load if active element is not placeholder", async () => {
      const props = createDefaultProps();
      const renderTreeWithNodes = (rootNodes: StrataKitTreeRendererProps["rootNodes"]) => (
        <TreeContainer>
          <StrataKitTreeRenderer {...props} rootNodes={rootNodes} />
        </TreeContainer>
      );
      const { locator, rerender } = await renderWithTheme(
        renderTreeWithNodes([
          createTreeNode({ id: "parent", label: "Parent", isExpanded: true, isLoading: true, children: true }),
        ]),
        { colorScheme },
      );

      (locator.getByRole("treeitem", { name: "Loading" }).element() as HTMLElement).focus();
      const parent = locator.getByRole("treeitem", { name: "Parent" });
      (parent.element() as HTMLElement).focus();
      await rerender(
        renderTreeWithNodes([
          createTreeNode({
            id: "parent",
            label: "Parent",
            isExpanded: true,
            children: [createTreeNode({ id: "child", label: "Loaded Child" })],
          }),
        ]),
      );

      await expect.element(parent).toHaveFocus();
    });

    it("does not focus another branch at the placeholder's former index and level", async () => {
      const props = createDefaultProps();
      const renderTreeWithNodes = (rootNodes: StrataKitTreeRendererProps["rootNodes"]) => (
        <TreeContainer height={200}>
          <StrataKitTreeRenderer {...props} rootNodes={rootNodes} />
        </TreeContainer>
      );
      const { locator, rerender } = await renderWithTheme(
        renderTreeWithNodes([
          createTreeNode({
            id: "a",
            label: "A",
            isExpanded: true,
            children: [
              createTreeNode({ id: "b", label: "B" }),
              createTreeNode({ id: "c", label: "C", isExpanded: true, isLoading: true, children: true }),
            ],
          }),
          createTreeNode({
            id: "d",
            label: "D",
            children: [createTreeNode({ id: "e", label: "E", children: [createTreeNode({ id: "f", label: "F" })] })],
          }),
        ]),
        { colorScheme },
      );

      const placeholder = locator.getByRole("treeitem", { name: "Loading" }).element() as HTMLElement;
      const placeholderIndex = placeholder.getAttribute("data-index");
      const placeholderLevel = placeholder.getAttribute("aria-level");
      placeholder.focus();

      await rerender(
        renderTreeWithNodes([
          createTreeNode({
            id: "a",
            label: "A",
            children: [
              createTreeNode({ id: "b", label: "B" }),
              createTreeNode({ id: "c", label: "C", isExpanded: true, isLoading: true, children: true }),
            ],
          }),
          createTreeNode({
            id: "d",
            label: "D",
            isExpanded: true,
            children: [
              createTreeNode({
                id: "e",
                label: "E",
                isExpanded: true,
                children: [createTreeNode({ id: "f", label: "F" })],
              }),
            ],
          }),
        ]),
      );

      const otherBranchChild = locator.getByRole("treeitem", { name: "F" });
      expect(otherBranchChild.element().getAttribute("data-index")).toBe(placeholderIndex);
      expect(otherBranchChild.element().getAttribute("aria-level")).toBe(placeholderLevel);
      await expect.element(otherBranchChild).not.toHaveFocus();
    });

    describe("scrollToNode", () => {
      it("returns `node-not-found` when no node matches the predicate", async () => {
        const ref = createRef<StrataKitTreeRendererAttributes>();
        const onComplete = vi.fn();
        const props = createDefaultProps({ rootNodes: [createTreeNode({ id: "node-1", label: "Node 1" })] });
        await renderWithTheme(
          <TreeContainer>
            <StrataKitTreeRenderer {...props} ref={ref} />
          </TreeContainer>,
          { colorScheme },
        );

        expect(ref.current!.scrollToNode({ nodePredicate: (node) => node.id === "missing", onComplete })).toBe(
          "node-not-found",
        );
        expect(onComplete).not.toHaveBeenCalled();
      });

      it("returns `node-not-found` when target is under a node with an expansion-blocking error", async () => {
        const ref = createRef<StrataKitTreeRendererAttributes>();
        const onComplete = vi.fn();
        const props = createDefaultProps({
          rootNodes: [
            createTreeNode({
              id: "parent",
              label: "Parent",
              isExpanded: true,
              errors: [{ id: "error", type: "Generic", message: "Blocking error" }],
              children: [createTreeNode({ id: "child", label: "Hidden Child" })],
            }),
          ],
        });
        await renderWithTheme(
          <TreeContainer>
            <StrataKitTreeRenderer {...props} ref={ref} />
          </TreeContainer>,
          { colorScheme },
        );

        expect(ref.current!.scrollToNode({ nodePredicate: (node) => node.id === "child", onComplete })).toBe(
          "node-not-found",
        );
        expect(props.expandNode).not.toHaveBeenCalled();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expect(onComplete).not.toHaveBeenCalled();
      });

      it("scrolls to node that's out of view", async () => {
        const ref = createRef<StrataKitTreeRendererAttributes>();
        const onComplete = vi.fn();
        const props = createDefaultProps({
          rootNodes: Array.from({ length: 100 }, (_, i) => createTreeNode({ id: `node-${i}`, label: `Node ${i}` })),
        });
        const { locator } = await renderWithTheme(
          <TreeContainer>
            <StrataKitTreeRenderer {...props} ref={ref} />
          </TreeContainer>,
          { colorScheme },
        );
        await expect.element(locator.getByRole("treeitem", { name: "Node 99" })).not.toBeInTheDocument();

        expect(ref.current!.scrollToNode({ nodePredicate: (node) => node.id === "node-99", onComplete })).toBe(
          "success",
        );

        await expect.element(locator.getByRole("treeitem", { name: "Node 99" })).toBeInViewport();
        await vi.waitFor(() =>
          expect(onComplete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "node-99" })),
        );
        expect(props.expandNode).not.toHaveBeenCalled();
      });

      it("expands collapsed ancestors of a deeply nested node and scrolls to it", async () => {
        const ref = createRef<StrataKitTreeRendererAttributes>();
        const onComplete = vi.fn();
        const { locator } = await renderWithTheme(
          <TreeWithExpansionState
            {...createDefaultProps()}
            treeRef={ref}
            initialRootNodes={[
              ...Array.from({ length: 50 }, (_, i) => createTreeNode({ id: `node-${i}`, label: `Node ${i}` })),
              createTreeNode({
                id: "grandparent",
                label: "Grandparent",
                children: [
                  createTreeNode({
                    id: "parent",
                    label: "Parent",
                    children: [createTreeNode({ id: "child", label: "Target Child" })],
                  }),
                ],
              }),
            ]}
          />,
          { colorScheme },
        );
        await expect.element(locator.getByRole("treeitem", { name: "Target Child" })).not.toBeInTheDocument();

        expect(ref.current!.scrollToNode({ nodePredicate: (node) => node.id === "child", onComplete })).toBe("success");

        await expect.element(locator.getByRole("treeitem", { name: "Target Child" })).toBeInViewport();
        await vi.waitFor(() =>
          expect(onComplete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "child" })),
        );
      });

      it("lets a newer request supersede one pending on expansion", async () => {
        const ref = createRef<StrataKitTreeRendererAttributes>();
        const onFirstComplete = vi.fn();
        const onSecondComplete = vi.fn();
        const { locator } = await renderWithTheme(
          <TreeWithExpansionState
            {...createDefaultProps()}
            treeRef={ref}
            initialRootNodes={[
              ...Array.from({ length: 50 }, (_, i) => createTreeNode({ id: `node-${i}`, label: `Node ${i}` })),
              createTreeNode({
                id: "parent",
                label: "Parent",
                children: [createTreeNode({ id: "child", label: "Target Child" })],
              }),
            ]}
          />,
          { colorScheme },
        );

        ref.current!.scrollToNode({ nodePredicate: (node) => node.id === "child", onComplete: onFirstComplete });
        ref.current!.scrollToNode({ nodePredicate: (node) => node.id === "node-25", onComplete: onSecondComplete });

        await vi.waitFor(() =>
          expect(onSecondComplete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "node-25" })),
        );
        // let the expansion re-render settle
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await expect.element(locator.getByRole("treeitem", { name: "Node 25" })).toBeInViewport();
        expect(locator.getByRole("treeitem", { name: "Target Child" }).query()).toBeNull();
        expect(onFirstComplete).not.toHaveBeenCalled();
      });
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
            errors: [{ id: "error-1", type: "Generic", message: "Something went wrong" }],
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
      await page.viewport(300, 200);
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
      const { locator } = await renderTree(props, colorScheme, { height: 200 });
      await locator.getByText("Node with context menu").click({ button: "right" });
      await expect.element(page.getByText("Context Action 1")).toBeVisible();
      await expect.element(page.getByText("Context Action 2")).toBeVisible();
      await validateSnapshot(locator);
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

    it("renders label editor for nested node", async () => {
      // the editor is 300px wide - make sure there's enough space for it to not be shifted from its anchor
      await page.viewport(400, 150);
      const props = createDefaultProps({
        rootNodes: [
          createTreeNode({
            id: "parent",
            label: "Parent Node",
            isExpanded: true,
            children: [
              createTreeNode({ id: "child-1", label: "Renaming Node" }),
              createTreeNode({ id: "child-2", label: "Child 2" }),
            ],
          }),
        ],
        getEditingProps: () => ({ onLabelChanged: vi.fn() }),
        getMenuActions: ({ targetNode }) => [<TreeNodeRenameAction key="rename" node={targetNode} />],
      });
      const { locator } = await renderTree(props, colorScheme, { height: 150, width: 400 });
      const node = locator.getByRole("treeitem", { name: "Renaming Node" });
      await expect.element(node).toBeVisible();
      await node.hover();
      await node.getByRole("button", { name: "More" }).click();
      await page.getByText("Rename", { exact: true }).click();
      await expect.element(page.getByRole("textbox", { name: "New label" })).toBeVisible();
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

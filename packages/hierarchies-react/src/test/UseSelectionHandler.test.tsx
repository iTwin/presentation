/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { waitFor } from "presentation-test-utilities";
import sinon from "sinon";
import { useSelectionHandler } from "../presentation-hierarchies-react/UseSelectionHandler.js";
import { renderHook } from "./TestUtils.js";
import type { TreeNode } from "../presentation-hierarchies-react/TreeNode.js";
import type { SelectionChangeType } from "../presentation-hierarchies-react/UseSelectionHandler.js";

describe("useSelectionHandler", () => {
  const selectNodesStub = sinon.stub<[Array<string>, SelectionChangeType], void>();

  const createTreeNode = (id: string, children: Array<TreeNode> = [], isExpanded: boolean = true) => {
    return { id, isExpanded, children } as TreeNode;
  };

  afterEach(() => {
    selectNodesStub.reset();
  });

  describe("`none` selection mode", () => {
    it("does nothing when node is clicked", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode: "none", selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: false, shiftDown: false, ctrlDown: false });

      await waitFor(() => {
        expect(selectNodesStub).to.not.be.called;
      });
    });
  });

  describe("`single` selection mode", () => {
    const selectionMode = "single";

    it("replaces selection when node is clicked", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: false, shiftDown: false, ctrlDown: false });

      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "replace");
      });
    });

    it("replaces selection when clicking using `ctrl` and `shift`", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: false, shiftDown: false, ctrlDown: true });

      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "replace");
      });
      selectNodesStub.resetHistory();

      result.current.handleNodeSelect({ nodeId: "node", isSelected: false, shiftDown: true, ctrlDown: false });

      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "replace");
      });
    });

    it("removes from selection when a selected node is clicked", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: true, shiftDown: false, ctrlDown: false });

      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "remove");
      });
    });
  });

  describe("`multiple` selection mode", () => {
    const selectionMode = "multiple";

    it("adds to selection when node is clicked", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: false, shiftDown: false, ctrlDown: false });

      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "add");
      });
    });

    it("adds to selection when clicking using `ctrl` and `shift`", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: false, shiftDown: false, ctrlDown: true });

      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "add");
      });
      selectNodesStub.resetHistory();

      result.current.handleNodeSelect({ nodeId: "node", isSelected: false, shiftDown: true, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "add");
      });
    });

    it("removes from selection when a selected node is clicked", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: true, shiftDown: false, ctrlDown: false });

      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "remove");
      });
    });
  });

  describe("`extended` selection mode", () => {
    const selectionMode = "extended";

    it("replaces selection when node is clicked", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: false, shiftDown: false, ctrlDown: false });

      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "replace");
      });
    });

    it("replaces selection when selected node is clicked", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: true, shiftDown: false, ctrlDown: false });

      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "replace");
      });
    });

    it("adds to selection when node is clicked and `ctrl` used", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: false, shiftDown: false, ctrlDown: true });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "add");
      });
    });

    it("removes from selection when a selected node is clicked and `ctrl` used", async () => {
      const rootNode = createTreeNode("node");
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [rootNode], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node", isSelected: true, shiftDown: false, ctrlDown: true });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node"], "remove");
      });
    });

    it("replaces selection with node range when node clicked and `shift` used", async () => {
      const nodes = [createTreeNode("node-1"), createTreeNode("node-2"), createTreeNode("node-3")];
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: nodes, selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node-1", isSelected: false, shiftDown: false, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-1"], "replace");
      });
      selectNodesStub.reset();

      result.current.handleNodeSelect({ nodeId: "node-3", isSelected: false, shiftDown: true, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2", "node-3"], "replace");
      });
    });

    it("starts range selection from first node when previous selection does not exist", async () => {
      const nodes = [createTreeNode("node-1"), createTreeNode("node-2"), createTreeNode("node-3")];
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: nodes, selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node-3", isSelected: false, shiftDown: true, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2", "node-3"], "replace");
      });
    });

    it("selects range when second selected node has lower index", async () => {
      const nodes = [createTreeNode("node-1"), createTreeNode("node-2"), createTreeNode("node-3")];
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: nodes, selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node-3", isSelected: false, shiftDown: false, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-3"], "replace");
      });
      selectNodesStub.reset();

      result.current.handleNodeSelect({ nodeId: "node-1", isSelected: false, shiftDown: true, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2", "node-3"], "replace");
      });
    });

    it("selects visible children of different depth when selecting range", async () => {
      const innerChild = createTreeNode("child-inner");
      const outerChild = createTreeNode("child-outer", [innerChild]);
      const nodes = [createTreeNode("node-1", [outerChild]), createTreeNode("node-2")];
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: nodes, selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node-1", isSelected: false, shiftDown: false, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-1"], "replace");
      });
      selectNodesStub.reset();

      result.current.handleNodeSelect({ nodeId: "node-2", isSelected: false, shiftDown: true, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "child-outer", "child-inner", "node-2"], "replace");
      });
    });

    it("skips non visible children when selecting range", async () => {
      const innerChild = createTreeNode("child-inner");
      const outerChild = createTreeNode("child-outer", [innerChild]);
      const nodes = [createTreeNode("node-1", [outerChild], false), createTreeNode("node-2")];
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: nodes, selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node-1", isSelected: false, shiftDown: false, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-1"], "replace");
      });
      selectNodesStub.reset();

      result.current.handleNodeSelect({ nodeId: "node-2", isSelected: false, shiftDown: true, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2"], "replace");
      });
    });

    it("subsequent range selections use the same starting point", async () => {
      const nodes = [createTreeNode("node-1"), createTreeNode("node-2"), createTreeNode("node-3"), createTreeNode("node-4")];
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: nodes, selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "node-2", isSelected: false, shiftDown: false, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-2"], "replace");
      });
      selectNodesStub.reset();

      result.current.handleNodeSelect({ nodeId: "node-1", isSelected: false, shiftDown: true, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2"], "replace");
      });
      selectNodesStub.reset();

      result.current.handleNodeSelect({ nodeId: "node-3", isSelected: false, shiftDown: true, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-2", "node-3"], "replace");
      });
      +selectNodesStub.reset();

      result.current.handleNodeSelect({ nodeId: "node-4", isSelected: false, shiftDown: false, ctrlDown: true });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-4"], "add");
      });
      selectNodesStub.reset();

      result.current.handleNodeSelect({ nodeId: "node-3", isSelected: false, shiftDown: true, ctrlDown: false });
      await waitFor(() => {
        expect(selectNodesStub).to.be.calledOnceWith(["node-3", "node-4"], "replace");
      });
    });

    it("does nothing when invalid node clicked and `shift` used", async () => {
      const { result } = renderHook(useSelectionHandler, { initialProps: { rootNodes: [], selectionMode, selectNodes: selectNodesStub } });

      result.current.handleNodeSelect({ nodeId: "invalid", isSelected: false, shiftDown: true, ctrlDown: false });

      expect(selectNodesStub).to.not.be.called;
    });
  });
});

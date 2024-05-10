/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { renderHook } from "@testing-library/react";
import { PresentationHierarchyNode, PresentationInfoNode, PresentationTreeNode } from "../presentation-hierarchies-react";
import { SelectionChangeType, SelectionMode, useSelectionHandler } from "../presentation-hierarchies-react/UseSelectionHandler";

describe("useSelectionHandler", () => {
  const selectNodeStub = sinon.stub<[Array<string>, SelectionChangeType], void>();

  const createMouseEvent = (key?: "Shift" | "Ctrl") => {
    return { shiftKey: key === "Shift", ctrlKey: key === "Ctrl" } as unknown as React.MouseEvent<HTMLDivElement, MouseEvent>;
  };

  const createKeyboardEvent = (mainKey?: " " | "Spacebar" | "Enter", extraKey?: "Shift" | "Ctrl") => {
    return { key: mainKey, shiftKey: extraKey === "Shift", ctrlKey: extraKey === "Ctrl" } as unknown as React.KeyboardEvent<HTMLDivElement>;
  };

  const createHierarchyNode = (id: string, children: Array<PresentationTreeNode> = [], isExpanded: boolean = true) => {
    return { id, isExpanded, children } as PresentationHierarchyNode;
  };

  const createInfoNode = (id: string) => {
    return { id, message: "message" } as PresentationInfoNode;
  };

  const createProps = (rootNodes: Array<PresentationTreeNode> | undefined, selectionMode: SelectionMode) => {
    return { initialProps: { rootNodes, selectNode: selectNodeStub, selectionMode } };
  };

  afterEach(() => {
    selectNodeStub.reset();
  });

  const selectionTests = (selectNode: (result: any, node: string, isSelected: boolean, key?: "Shift" | "Ctrl") => void) => {
    it("does nothing when no root nodes passed", () => {
      const { result } = renderHook(useSelectionHandler, createProps(undefined, SelectionMode.None));

      selectNode(result.current, "node", true);
      expect(selectNodeStub).to.not.be.called;
    });

    describe("`None` selection mode", () => {
      it("does nothing when node is clicked", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], SelectionMode.None));

        selectNode(result.current, "node", true, "Ctrl");
        expect(selectNodeStub).to.not.be.called;
      });
    });

    describe("`Single` selection mode", () => {
      const selectionMode = SelectionMode.Single;

      it("replaces selection when node is clicked", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], selectionMode));

        selectNode(result.current, "node", true, "Ctrl");
        expect(selectNodeStub).to.be.calledOnceWith(["node"], "replace");
      });

      it("does nothing when a selected node is clicked", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], selectionMode));

        selectNode(result.current, "node", false, "Shift");
        expect(selectNodeStub).to.not.be.called;
      });
    });

    describe("`SingleAllowDeselect` selection mode", () => {
      const selectionMode = SelectionMode.SingleAllowDeselect;

      it("replaces selection when node is clicked", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], selectionMode));

        selectNode(result.current, "node", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node"], "replace");
      });

      it("removes from selection when a selected node is clicked", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], selectionMode));

        selectNode(result.current, "node", false, "Ctrl");
        expect(selectNodeStub).to.be.calledOnceWith(["node"], "remove");
      });
    });

    describe("`Multiple` selection mode", () => {
      const selectionMode = SelectionMode.Multiple;

      it("adds to selection when node is clicked", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], selectionMode));

        selectNode(result.current, "node", true, "Ctrl");
        expect(selectNodeStub).to.be.calledOnceWith(["node"], "add");
      });

      it("removes from selection when a selected node is clicked", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], selectionMode));

        selectNode(result.current, "node", false, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node"], "remove");
      });
    });

    describe("`Extended` selection mode", () => {
      const selectionMode = SelectionMode.Extended;

      it("replaces selection when node is clicked", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], selectionMode));

        selectNode(result.current, "node", true);
        expect(selectNodeStub).to.be.calledOnceWith(["node"], "replace");
      });

      it("adds to selection when node is clicked and `ctrl` used", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], selectionMode));

        selectNode(result.current, "node", true, "Ctrl");
        expect(selectNodeStub).to.be.calledOnceWith(["node"], "add");
      });

      it("removes from selection when a selected node is clicked and `ctrl` used", () => {
        const rootNode = createHierarchyNode("node");
        const { result } = renderHook(useSelectionHandler, createProps([rootNode], selectionMode));

        selectNode(result.current, "node", false, "Ctrl");
        expect(selectNodeStub).to.be.calledOnceWith(["node"], "remove");
      });

      it("replaces selection with node range when node clicked and `shift` used", () => {
        const nodes = [createHierarchyNode("node-1"), createHierarchyNode("node-2"), createHierarchyNode("node-3")];
        const { result } = renderHook(useSelectionHandler, createProps(nodes, selectionMode));

        selectNode(result.current, "node-1", true);
        expect(selectNodeStub).to.be.calledOnceWith(["node-1"], "replace");
        selectNodeStub.reset();

        selectNode(result.current, "node-3", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node-1", "node-2", "node-3"], "replace");
      });

      it("starts range selection from first node when previous selection does not exist", () => {
        const nodes = [createHierarchyNode("node-1"), createHierarchyNode("node-2"), createHierarchyNode("node-3")];
        const { result } = renderHook(useSelectionHandler, createProps(nodes, selectionMode));

        selectNode(result.current, "node-3", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node-1", "node-2", "node-3"], "replace");
      });

      it("selects range when second selected node has lower index", () => {
        const nodes = [createHierarchyNode("node-1"), createHierarchyNode("node-2"), createHierarchyNode("node-3")];
        const { result } = renderHook(useSelectionHandler, createProps(nodes, selectionMode));

        selectNode(result.current, "node-3", true);
        expect(selectNodeStub).to.be.calledOnceWith(["node-3"], "replace");
        selectNodeStub.reset();

        selectNode(result.current, "node-1", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node-1", "node-2", "node-3"], "replace");
      });

      it("skips info nodes when selecting range", () => {
        const nodes = [createHierarchyNode("node-1"), createInfoNode("node-2"), createHierarchyNode("node-3")];
        const { result } = renderHook(useSelectionHandler, createProps(nodes, selectionMode));

        selectNode(result.current, "node-1", true);
        expect(selectNodeStub).to.be.calledOnceWith(["node-1"], "replace");
        selectNodeStub.reset();

        selectNode(result.current, "node-3", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node-1", "node-3"], "replace");
      });

      it("selects visible children of different depth when selecting range", () => {
        const innerChild = createHierarchyNode("child-inner");
        const outerChild = createHierarchyNode("child-outer", [innerChild]);
        const node1 = createHierarchyNode("node-1", [outerChild]);
        const node2 = createHierarchyNode("node-2");
        const { result } = renderHook(useSelectionHandler, createProps([node1, node2], selectionMode));

        selectNode(result.current, "node-1", true);
        expect(selectNodeStub).to.be.calledOnceWith(["node-1"], "replace");
        selectNodeStub.reset();

        selectNode(result.current, "node-2", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node-1", "child-outer", "child-inner", "node-2"], "replace");
      });

      it("skips non visible children when selecting range", () => {
        const innerChild = createHierarchyNode("child-inner");
        const outerChild = createHierarchyNode("child-outer", [innerChild]);
        const node1 = createHierarchyNode("node-1", [outerChild], false);
        const node2 = createHierarchyNode("node-2");
        const { result } = renderHook(useSelectionHandler, createProps([node1, node2], selectionMode));

        selectNode(result.current, "node-1", true);
        expect(selectNodeStub).to.be.calledOnceWith(["node-1"], "replace");
        selectNodeStub.reset();

        selectNode(result.current, "node-2", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node-1", "node-2"], "replace");
      });

      it("does not update previous selection when using `shift`", () => {
        const nodes = [createHierarchyNode("node-1"), createHierarchyNode("node-2"), createHierarchyNode("node-3"), createHierarchyNode("node-4")];
        const { result } = renderHook(useSelectionHandler, createProps(nodes, selectionMode));

        selectNode(result.current, "node-2", true);
        expect(selectNodeStub).to.be.calledOnceWith(["node-2"], "replace");
        selectNodeStub.reset();

        selectNode(result.current, "node-1", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node-1", "node-2"], "replace");
        selectNodeStub.reset();

        selectNode(result.current, "node-3", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node-2", "node-3"], "replace");
        selectNodeStub.reset();

        selectNode(result.current, "node-4", true, "Ctrl");
        expect(selectNodeStub).to.be.calledOnceWith(["node-4"], "add");
        selectNodeStub.reset();

        selectNode(result.current, "node-3", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith(["node-3", "node-4"], "replace");
        selectNodeStub.reset();
      });

      it("does nothing when invalid node passed", () => {
        const nodes = [createHierarchyNode("node-1"), createHierarchyNode("node-2"), createHierarchyNode("node-3")];
        const { result } = renderHook(useSelectionHandler, createProps(nodes, selectionMode));

        selectNode(result.current, "invalid", true, "Shift");
        expect(selectNodeStub).to.be.calledOnceWith([], "replace");
      });
    });
  };

  describe("keyboard input", () => {
    it("only reacts to ` `, `Spacebar` and `Enter`", () => {
      const rootNode = createHierarchyNode("node");
      const { result } = renderHook(useSelectionHandler, createProps([rootNode], SelectionMode.Single));

      result.current.onNodeKeyDown("node", true, createKeyboardEvent(" "));
      result.current.onNodeKeyDown("node", true, createKeyboardEvent("Spacebar"));
      result.current.onNodeKeyDown("node", true, createKeyboardEvent("Enter"));

      expect(selectNodeStub).to.be.calledThrice;
      selectNodeStub.reset();

      result.current.onNodeKeyDown("node", true, createKeyboardEvent(undefined, "Shift"));
      result.current.onNodeKeyDown("node", true, createKeyboardEvent(undefined, "Ctrl"));

      expect(selectNodeStub).to.not.be.called;
    });

    selectionTests((result, node, isSelected, key) => {
      result.onNodeKeyDown(node, isSelected, createKeyboardEvent("Enter", key));
    });
  });

  describe("mouse input", () => {
    selectionTests((result, node, isSelected, key) => {
      result.onNodeClick(node, isSelected, createMouseEvent(key));
    });
  });
});

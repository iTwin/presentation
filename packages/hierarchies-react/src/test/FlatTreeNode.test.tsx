/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { renderHook } from "@testing-library/react";
import { useErrorNodes, useFlatTreeItems } from "../presentation-hierarchies-react/FlatTreeNode.js";

import type { HierarchyNode } from "@itwin/presentation-hierarchies";
import type { TreeNode } from "../presentation-hierarchies-react/TreeNode.js";

describe("FlatTreeNode", () => {
  function createTreeNode(props: Partial<TreeNode> & { id: string }): TreeNode {
    return {
      label: props.id,
      children: props.children ?? true,
      isExpanded: props.isExpanded ?? false,
      isLoading: props.isLoading ?? false,
      isFilterable: props.isFilterable ?? false,
      isFiltered: props.isFiltered ?? false,
      nodeData: props.nodeData ?? ({} as HierarchyNode),
      error: props.error,
      ...props,
    };
  }

  describe("useFlatTreeItems", () => {
    it("includes children and nested descendants when error is expandable", () => {
      const grandChildNode = createTreeNode({ id: "grandchild-1" });
      const childNode1 = createTreeNode({ id: "child-1", isExpanded: true, children: [grandChildNode] });
      const childNode2 = createTreeNode({ id: "child-2" });
      const parentNode = createTreeNode({
        id: "parent",
        isExpanded: true,
        error: { id: "error-1", type: "Unknown", message: "Something went wrong", isNodeExpandable: true },
        children: [childNode1, childNode2],
      });

      const { result } = renderHook(() => useFlatTreeItems([parentNode]));

      expect(result.current).to.have.lengthOf(4);
      expect(result.current[0]).to.deep.include({ id: "parent", level: 1 });
      expect(result.current[1]).to.deep.include({ id: "child-1", level: 2 });
      expect(result.current[2]).to.deep.include({ id: "grandchild-1", level: 3 });
      expect(result.current[3]).to.deep.include({ id: "child-2", level: 2 });
    });

    it("does not include children when error is not expandable", () => {
      const childNode = createTreeNode({ id: "child-1" });
      const parentNode = createTreeNode({
        id: "parent",
        isExpanded: true,
        error: { id: "error-1", type: "Unknown", message: "Something went wrong", isNodeExpandable: false },
        children: [childNode],
      });

      const { result } = renderHook(() => useFlatTreeItems([parentNode]));

      expect(result.current).to.have.lengthOf(1);
      expect(result.current[0]).to.deep.include({ id: "parent" });
    });

    it("does not include children when error has no isNodeExpandable property", () => {
      const childNode = createTreeNode({ id: "child-1" });
      const parentNode = createTreeNode({
        id: "parent",
        isExpanded: true,
        error: { id: "error-1", type: "Unknown", message: "Something went wrong" },
        children: [childNode],
      });

      const { result } = renderHook(() => useFlatTreeItems([parentNode]));

      expect(result.current).to.have.lengthOf(1);
      expect(result.current[0]).to.deep.include({ id: "parent" });
    });

    it("does not include children when node is collapsed", () => {
      const childNode = createTreeNode({ id: "child-1" });
      const parentNode = createTreeNode({
        id: "parent",
        isExpanded: false,
        error: { id: "error-1", type: "Unknown", message: "Something went wrong", isNodeExpandable: true },
        children: [childNode],
      });

      const { result } = renderHook(() => useFlatTreeItems([parentNode]));

      expect(result.current).to.have.lengthOf(1);
      expect(result.current[0]).to.deep.include({ id: "parent" });
    });
  });

  describe("useErrorNodes", () => {
    it("reports all errors when parent has expandable error", () => {
      const grandChildNode = createTreeNode({
        id: "grandchild-1",
        error: { id: "error-3", type: "ChildrenLoad", message: "Grandchild error" },
        children: [],
      });
      const childNode1 = createTreeNode({
        id: "child-1",
        error: { id: "error-2", type: "Unknown", message: "Child error", isNodeExpandable: true },
        children: [grandChildNode],
      });
      const childNode2 = createTreeNode({ id: "child-2", children: [] });
      const parentNode = createTreeNode({
        id: "parent",
        error: { id: "error-1", type: "Unknown", message: "Parent error", isNodeExpandable: true },
        children: [childNode1, childNode2],
      });

      const { result } = renderHook(() => useErrorNodes([parentNode]));

      expect(result.current).to.have.lengthOf(3);
      expect(result.current[0].id).to.equal("parent");
      expect(result.current[1].id).to.equal("child-1");
      expect(result.current[2].id).to.equal("grandchild-1");
    });

    it("does not traverse children when error is not expandable", () => {
      const childNode = createTreeNode({
        id: "child-1",
        error: { id: "error-2", type: "ChildrenLoad", message: "Child error" },
        children: [],
      });
      const parentNode = createTreeNode({
        id: "parent",
        error: { id: "error-1", type: "Unknown", message: "Parent error", isNodeExpandable: false },
        children: [childNode],
      });

      const { result } = renderHook(() => useErrorNodes([parentNode]));

      expect(result.current).to.have.lengthOf(1);
      expect(result.current[0].id).to.equal("parent");
    });

    it("does not traverse children when error has no isNodeExpandable property", () => {
      const childNode = createTreeNode({
        id: "child-1",
        error: { id: "error-2", type: "ChildrenLoad", message: "Child error" },
        children: [],
      });
      const parentNode = createTreeNode({
        id: "parent",
        error: { id: "error-1", type: "Unknown", message: "Parent error" },
        children: [childNode],
      });

      const { result } = renderHook(() => useErrorNodes([parentNode]));

      expect(result.current).to.have.lengthOf(1);
      expect(result.current[0].id).to.equal("parent");
    });

    it("counts error root node when it is not expanded", () => {
      const rootNode = createTreeNode({
        id: "root",
        error: { id: "error-1", type: "Unknown", message: "Root error" },
        children: true,
      });

      const { result } = renderHook(() => useErrorNodes([rootNode]));

      expect(result.current).to.have.lengthOf(1);
      expect(result.current[0].id).to.equal("root");
    });
  });
});

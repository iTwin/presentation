/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
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
      errors: props.errors ?? [],
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
        errors: [{ id: "error-1", type: "Unknown", message: "Something went wrong", isNodeExpandable: true }],
        children: [childNode1, childNode2],
      });

      const { result } = renderHook(() => useFlatTreeItems([parentNode]));

      expect(result.current).toHaveLength(4);
      expect(result.current[0]).toMatchObject({ id: "parent", level: 1 });
      expect(result.current[1]).toMatchObject({ id: "child-1", level: 2 });
      expect(result.current[2]).toMatchObject({ id: "grandchild-1", level: 3 });
      expect(result.current[3]).toMatchObject({ id: "child-2", level: 2 });
    });

    it("does not include children when error is not expandable", () => {
      const childNode = createTreeNode({ id: "child-1" });
      const parentNode = createTreeNode({
        id: "parent",
        isExpanded: true,
        errors: [{ id: "error-1", type: "Unknown", message: "Something went wrong", isNodeExpandable: false }],
        children: [childNode],
      });

      const { result } = renderHook(() => useFlatTreeItems([parentNode]));

      expect(result.current).toHaveLength(1);
      expect(result.current[0]).toMatchObject({ id: "parent" });
    });

    it("does not include children when error has no isNodeExpandable property", () => {
      const childNode = createTreeNode({ id: "child-1" });
      const parentNode = createTreeNode({
        id: "parent",
        isExpanded: true,
        errors: [{ id: "error-1", type: "Unknown", message: "Something went wrong" }],
        children: [childNode],
      });

      const { result } = renderHook(() => useFlatTreeItems([parentNode]));

      expect(result.current).toHaveLength(1);
      expect(result.current[0]).toMatchObject({ id: "parent" });
    });

    it("does not include children when node is collapsed", () => {
      const childNode = createTreeNode({ id: "child-1" });
      const parentNode = createTreeNode({
        id: "parent",
        isExpanded: false,
        errors: [{ id: "error-1", type: "Unknown", message: "Something went wrong", isNodeExpandable: true }],
        children: [childNode],
      });

      const { result } = renderHook(() => useFlatTreeItems([parentNode]));

      expect(result.current).toHaveLength(1);
      expect(result.current[0]).toMatchObject({ id: "parent" });
    });
  });

  describe("useErrorNodes", () => {
    it("reports all errors when parent has expandable error", () => {
      const grandChildNode = createTreeNode({
        id: "grandchild-1",
        errors: [{ id: "error-3", type: "ChildrenLoad", message: "Grandchild error" }],
        children: [],
      });
      const childNode1 = createTreeNode({
        id: "child-1",
        errors: [{ id: "error-2", type: "Unknown", message: "Child error", isNodeExpandable: true }],
        children: [grandChildNode],
      });
      const childNode2 = createTreeNode({ id: "child-2", children: [] });
      const parentNode = createTreeNode({
        id: "parent",
        errors: [{ id: "error-1", type: "Unknown", message: "Parent error", isNodeExpandable: true }],
        children: [childNode1, childNode2],
      });

      const { result } = renderHook(() => useErrorNodes([parentNode]));

      expect(result.current).toHaveLength(3);
      expect(result.current[0].id).toBe("parent");
      expect(result.current[1].id).toBe("child-1");
      expect(result.current[2].id).toBe("grandchild-1");
    });

    it("does not traverse children when error is not expandable", () => {
      const childNode = createTreeNode({
        id: "child-1",
        errors: [{ id: "error-2", type: "ChildrenLoad", message: "Child error" }],
        children: [],
      });
      const parentNode = createTreeNode({
        id: "parent",
        errors: [{ id: "error-1", type: "Unknown", message: "Parent error", isNodeExpandable: false }],
        children: [childNode],
      });

      const { result } = renderHook(() => useErrorNodes([parentNode]));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("parent");
    });

    it("does not traverse children when error has no isNodeExpandable property", () => {
      const childNode = createTreeNode({
        id: "child-1",
        errors: [{ id: "error-2", type: "ChildrenLoad", message: "Child error" }],
        children: [],
      });
      const parentNode = createTreeNode({
        id: "parent",
        errors: [{ id: "error-1", type: "Unknown", message: "Parent error" }],
        children: [childNode],
      });

      const { result } = renderHook(() => useErrorNodes([parentNode]));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("parent");
    });

    it("counts error root node when it is not expanded", () => {
      const rootNode = createTreeNode({
        id: "root",
        errors: [{ id: "error-1", type: "Unknown", message: "Root error" }],
        children: true,
      });

      const { result } = renderHook(() => useErrorNodes([rootNode]));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("root");
    });
  });
});

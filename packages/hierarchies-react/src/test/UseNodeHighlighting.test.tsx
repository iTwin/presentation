/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { NonGroupingHierarchyNode } from "@itwin/presentation-hierarchies";
import { PresentationHierarchyNode } from "../presentation-hierarchies-react/TreeNode.js";
import { useNodeHighlighting } from "../presentation-hierarchies-react/UseNodeHighlighting.js";
import { render, renderHook } from "./TestUtils.js";

describe("useNodeHighlighting", () => {
  it("does not highlight when highlight is undefined", () => {
    const rootNodes = [createdFilterTargetHierarchyNode({ id: "node", label: "node" })];

    const { result } = renderHook(useNodeHighlighting, {
      initialProps: {},
    });

    const { container } = render(result.current.getLabel(rootNodes[0]));

    expect(container.querySelector("mark")).to.be.null;
  });

  it("does not highlight text when no matches found", () => {
    const rootNodes = [createdFilterTargetHierarchyNode({ id: "node", label: "node" })];

    const { result } = renderHook(useNodeHighlighting, {
      initialProps: { highlightText: "test" },
    });

    const { container } = render(result.current.getLabel(rootNodes[0]));

    expect(container.querySelector("mark")).to.be.null;
  });

  it("does not highlight text when node is not filter target", () => {
    const rootNodes = [createHierarchyNode({ id: "node", label: "node" })];

    const { result } = renderHook(useNodeHighlighting, {
      initialProps: { highlightText: "node" },
    });

    const { container } = render(result.current.getLabel(rootNodes[0]));

    expect(container.querySelector("mark")).to.be.null;
  });

  it("highlights text when match found", () => {
    const rootNodes = [createdFilterTargetHierarchyNode({ id: "node", label: "node" })];

    const { result } = renderHook(useNodeHighlighting, {
      initialProps: { highlightText: "node" },
    });

    const { container } = render(result.current.getLabel(rootNodes[0]));

    expect(container.querySelector("mark")?.textContent).to.be.eq("node");
  });

  it("highlights text with special characters", () => {
    const rootNodes = [createdFilterTargetHierarchyNode({ id: "node", label: "[1-x]node" })];

    const { result } = renderHook(useNodeHighlighting, {
      initialProps: { highlightText: "[1-x]node" },
    });

    const { container } = render(result.current.getLabel(rootNodes[0]));

    expect(container.querySelector("mark")?.textContent).to.be.eq("[1-x]node");
  });

  it("highlights text in the middle", () => {
    const rootNodes = [createdFilterTargetHierarchyNode({ id: "node", label: "1 test 2" })];

    const { result } = renderHook(useNodeHighlighting, {
      initialProps: { highlightText: "test" },
    });

    const { container } = render(result.current.getLabel(rootNodes[0]));

    const spans = container.querySelectorAll("span");
    const marks = container.querySelectorAll("mark");

    expect(spans).to.have.length(2);
    expect(marks).to.have.length(1);
    expect(spans[0].textContent).to.be.eq("1 ");
    expect(spans[1].textContent).to.be.eq(" 2");
    expect(marks[0].textContent).to.be.eq("test");
  });

  it("highlights edges of text", () => {
    const rootNodes = [createdFilterTargetHierarchyNode({ id: "node", label: "test node test" })];

    const { result } = renderHook(useNodeHighlighting, {
      initialProps: { highlightText: "test" },
    });

    const { container } = render(result.current.getLabel(rootNodes[0]));

    const spans = container.querySelectorAll("span");
    const marks = container.querySelectorAll("mark");

    expect(spans).to.have.length(1);
    expect(marks).to.have.length(2);
    expect(spans[0].textContent).to.be.eq(" node ");
    expect(marks[0].textContent).to.be.eq("test");
    expect(marks[1].textContent).to.be.eq("test");
  });
});

function createHierarchyNode(partial?: Partial<PresentationHierarchyNode>): PresentationHierarchyNode {
  return {
    id: "test-node",
    label: "test-node",
    isExpanded: false,
    isLoading: false,
    isFilterable: false,
    isFiltered: false,
    nodeData: createNonGroupingHierarchyNode(),
    children: [],
    ...partial,
  };
}
function createNonGroupingHierarchyNode(partial?: Partial<NonGroupingHierarchyNode>): NonGroupingHierarchyNode {
  return {
    label: "test-node",
    key: { type: "instances", instanceKeys: [] },
    parentKeys: [],
    children: false,
    ...partial,
  };
}

function createdFilterTargetHierarchyNode(partial?: Partial<PresentationHierarchyNode>): PresentationHierarchyNode {
  const node = createHierarchyNode(partial);
  return {
    ...node,
    nodeData: {
      ...node.nodeData,
      filtering: {
        isFilterTarget: true,
      },
    },
  };
}

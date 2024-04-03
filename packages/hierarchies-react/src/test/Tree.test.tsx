/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { TreeRenderer } from "../presentation-hierarchies-react/Tree";
import { PresentationHierarchyNode, PresentationInfoNode, PresentationTreeNode } from "../presentation-hierarchies-react/Types";
import { createStub, render, within } from "./TestUtils";

describe("Tree", () => {
  const onFilterClick = createStub<(nodeId: string) => void>();
  const expandNode = createStub<(nodeId: string, isExpanded: boolean) => void>();
  const selectNode = createStub<(nodeId: string, isSelected: boolean) => void>();
  const isNodeSelected = createStub<(nodeId: string) => boolean>();
  const setHierarchyLevelLimit = createStub<(nodeId: string | undefined, limit: undefined | number | "unbounded") => void>();
  const removeHierarchyLevelFilter = createStub<(nodeId: string) => void>();

  const initialProps = {
    onFilterClick,
    expandNode,
    selectNode,
    isNodeSelected,
    setHierarchyLevelLimit,
    removeHierarchyLevelFilter,
  };

  beforeEach(() => {
    onFilterClick.reset();
    expandNode.reset();
    selectNode.reset();
    isNodeSelected.reset();
    setHierarchyLevelLimit.reset();
    removeHierarchyLevelFilter.reset();
  });

  it("renders nodes", () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
      },
      {
        id: "root-2",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).to.not.be.null;
    expect(queryByText("root-2")).to.not.be.null;
  });

  it("expands/collapses nodes", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isExpanded: true,
        children: [
          {
            id: "child-1",
          },
        ],
      },
      {
        id: "root-2",
        isExpanded: false,
        children: [
          {
            id: "child-2",
          },
        ],
      },
    ]);

    const { user, getByRole, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).to.not.be.null;
    expect(queryByText("child-1")).to.not.be.null;
    expect(queryByText("root-2")).to.not.be.null;
    expect(queryByText("child-2")).to.be.null;

    const collapseButton = within(getByRole("treeitem", { expanded: true })).getByRole("button", { name: "Collapse" });
    const expandButton = within(getByRole("treeitem", { expanded: false })).getByRole("button", { name: "Expand" });

    await user.click(collapseButton);
    expect(expandNode).to.be.calledOnceWith("root-1", false);
    expandNode.reset();

    await user.click(expandButton);
    expect(expandNode).to.be.calledOnceWith("root-2", true);
  });

  it("selects/unselects nodes", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
      },
      {
        id: "root-2",
      },
    ]);

    isNodeSelected.callsFake((nodeId) => nodeId === "root-1");

    const { user, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).to.not.be.null;
    expect(queryByText("root-2")).to.not.be.null;

    await user.click(getByText("root-1"));
    expect(selectNode).to.be.calledOnceWith("root-1", false);
    selectNode.reset();

    await user.click(getByText("root-2"));
    expect(selectNode).to.be.calledOnceWith("root-2", true);
  });

  it("renders icon", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} getIcon={() => <div>Icon</div>} />);

    expect(queryByText("root-1")).to.not.be.null;
    expect(queryByText("Icon")).to.not.be.null;
  });

  it("calls `removeHierarchyLevelFilter` if node is filtered", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isFiltered: true,
        isFilterable: true,
      },
    ]);

    const { user, queryByText, getByRole } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).to.not.be.null;
    await user.click(getByRole("button", { name: "Clear active filter" }));
    expect(removeHierarchyLevelFilter).to.be.calledOnceWith("root-1");
  });

  it("calls `onFilterClick` if node is filterable", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isFilterable: true,
      },
    ]);

    const { user, queryByText, getByRole } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).to.not.be.null;
    await user.click(getByRole("button", { name: "Apply filter" }));
    expect(onFilterClick).to.be.calledOnceWith("root-1");
  });

  it("renders `ResultSetTooLarge` node", async () => {
    const rootNodes = createNodes([
      {
        id: "info-node",
        parentNodeId: "parent-id",
        type: "ResultSetTooLarge",
        message: "Result set too large",
      },
    ]);

    const { user, getByRole, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("Result set too large")).to.not.be.null;
    await user.click(getByRole("button"));
    expect(setHierarchyLevelLimit).to.be.calledOnceWith("parent-id", "unbounded");
  });

  it("renders placeholder node if children is loading", () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isExpanded: true,
        isLoading: true,
        children: true,
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).to.not.be.null;
    expect(queryByText("Loading...")).to.not.be.null;
  });

  it("renders unknown info node", () => {
    const rootNodes = createNodes([
      {
        id: "info-node",
        parentNodeId: undefined,
        type: "Unknown",
        message: "Some Error",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("Some Error")).to.not.be.null;
  });
});

type PartialHierarchyNode = Partial<Omit<PresentationHierarchyNode, "children">> & {
  id: string;
  children?: true | Array<PartialHierarchyNode | PresentationInfoNode>;
};

function createNodes(nodes: Array<PartialHierarchyNode | PresentationInfoNode>): PresentationTreeNode[] {
  return nodes.map<PresentationTreeNode>((node) => {
    if (isInfoNode(node)) {
      return {
        ...node,
      };
    }

    const presentationNode: PresentationHierarchyNode = {
      ...node,
      isExpanded: node.isExpanded ?? false,
      isFilterable: node.isFilterable ?? false,
      isFiltered: node.isFiltered ?? false,
      isLoading: node.isLoading ?? false,
      label: node.label ?? node.id,
      children: node.children === true ? true : createNodes(node.children ?? []),
    };
    return presentationNode;
  });
}

function isInfoNode(node: PartialHierarchyNode | PresentationInfoNode): node is PresentationInfoNode {
  return "type" in node;
}

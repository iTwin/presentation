/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GenericInstanceFilter } from "@itwin/presentation-hierarchies";
import { MAX_LIMIT_OVERRIDE } from "../presentation-hierarchies-react/internal/Utils";
import { TreeRenderer } from "../presentation-hierarchies-react/TreeRenderer";
import { PresentationHierarchyNode, PresentationInfoNode, PresentationTreeNode } from "../presentation-hierarchies-react/Types";
import { SelectionChangeType } from "../presentation-hierarchies-react/UseSelectionHandler";
import { act, createStub, createTestHierarchyNode, render, waitFor, within } from "./TestUtils";

describe("Tree", () => {
  const onFilterClick = createStub<(nodeId: string | undefined) => void>();
  const expandNode = createStub<(nodeId: string, isExpanded: boolean) => void>();
  const selectNodes = createStub<(nodeIds: Array<string>, changeType: SelectionChangeType) => void>();
  const isNodeSelected = createStub<(nodeId: string) => boolean>();
  const setHierarchyLevelLimit = createStub<(nodeId: string | undefined, limit: undefined | number | "unbounded") => void>();
  const setHierarchyLevelFilter = createStub<(nodeId: string | undefined, filter: GenericInstanceFilter | undefined) => void>();

  const initialProps = {
    onFilterClick,
    expandNode,
    selectNodes,
    isNodeSelected,
    setHierarchyLevelLimit,
    setHierarchyLevelFilter,
  };

  beforeEach(() => {
    onFilterClick.reset();
    expandNode.reset();
    selectNodes.reset();
    isNodeSelected.reset();
    setHierarchyLevelLimit.reset();
    setHierarchyLevelFilter.reset();
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

    const { user, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} selectionMode={"single"} />);

    expect(queryByText("root-1")).to.not.be.null;
    expect(queryByText("root-2")).to.not.be.null;

    await user.click(getByText("root-1"));
    expect(selectNodes).to.be.calledOnceWith(["root-1"], "remove");
    selectNodes.reset();

    await user.click(getByText("root-2"));
    expect(selectNodes).to.be.calledOnceWith(["root-2"], "replace");
  });

  it("selects/deselects using keyboard", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
      },
      {
        id: "root-2",
      },
    ]);

    isNodeSelected.callsFake((nodeId) => nodeId === "root-1");

    const { user, getAllByRole, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} selectionMode={"single"} />);

    expect(queryByText("root-1")).to.not.be.null;
    expect(queryByText("root-2")).to.not.be.null;

    const node1 = getAllByRole("treeitem")[0];
    act(() => {
      node1.focus();
    });
    await user.keyboard("{Enter}");
    expect(selectNodes).to.be.calledOnceWith(["root-1"], "remove");
    selectNodes.reset();

    const node2 = getAllByRole("treeitem")[1];
    act(() => {
      node2.focus();
    });
    await user.keyboard("{Enter}");
    expect(selectNodes).to.be.calledOnceWith(["root-2"], "replace");
  });

  it("does not select node when expander clicked using keyboard", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isExpanded: false,
        children: [
          {
            id: "child-1",
          },
        ],
      },
    ]);

    const { user, getByRole, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).to.not.be.null;
    expect(queryByText("child-1")).to.be.null;

    const expandButton = within(getByRole("treeitem", { expanded: false })).getByRole("button", { name: "Expand" });

    act(() => {
      expandButton.focus();
    });
    await user.keyboard("{Enter}");
    expect(expandNode).to.be.calledOnceWith("root-1", true);
    expect(selectNodes).to.not.be.called;
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
    expect(setHierarchyLevelFilter).to.be.calledOnceWith("root-1", undefined);
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
        resultSetSizeLimit: 100,
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText(/there are more items than allowed limit of 100/i)).to.not.be.null;
  });

  it("calls `onFilterClick` if node is `ResultSetTooLarge` info node", async () => {
    const rootNodes = createNodes([
      {
        id: "info-node",
        parentNodeId: "parent-id",
        type: "ResultSetTooLarge",
        resultSetSizeLimit: 100,
      },
    ]);

    const { user, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText(/there are more items than allowed limit of 100/i)).to.not.be.null;
    await user.click(getByText("additional filtering"));
    expect(onFilterClick).to.be.calledOnceWith("parent-id");
  });

  it("calls 'setHierarchyLevelLimit' to override hierarchy size limit", async () => {
    const rootNodes = createNodes([
      {
        id: "info-node",
        parentNodeId: "parent-id",
        type: "ResultSetTooLarge",
        resultSetSizeLimit: MAX_LIMIT_OVERRIDE / 2 + 500,
      },
    ]);

    const { user, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText(/there are more items than allowed limit of/i)).to.not.be.null;
    await user.click(getByText(/Increase hierarchy level size limit/i));
    expect(setHierarchyLevelLimit).to.be.calledOnceWith("parent-id", MAX_LIMIT_OVERRIDE);
  });

  it("does not allow to increase hierarchy limit past max limit override", async () => {
    const rootNodes = createNodes([
      {
        id: "info-node",
        parentNodeId: "parent-id",
        type: "ResultSetTooLarge",
        resultSetSizeLimit: MAX_LIMIT_OVERRIDE,
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText(/there are more items than allowed limit of/i)).to.not.be.null;
    expect(queryByText(/Increase hierarchy level size limit/i)).to.be.null;
  });

  it("renders placeholder node if children is loading", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isExpanded: true,
        isLoading: true,
        children: true,
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    await waitFor(() => {
      expect(queryByText("root-1")).to.not.be.null;
      expect(queryByText("Loading...")).to.not.be.null;
    });
  });

  it("renders unknown info node", async () => {
    const rootNodes = createNodes([
      {
        id: "info-node",
        parentNodeId: undefined,
        type: "Unknown",
        message: "Some Error",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    await waitFor(() => expect(queryByText("Some Error")).to.not.be.null);
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
      nodeData: node.nodeData ?? createTestHierarchyNode({ id: node.id }),
    };
    return presentationNode;
  });
}

function isInfoNode(node: PartialHierarchyNode | PresentationInfoNode): node is PresentationInfoNode {
  return "type" in node;
}

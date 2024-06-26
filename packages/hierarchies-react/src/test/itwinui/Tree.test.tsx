/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ComponentPropsWithoutRef } from "react";
import { MAX_LIMIT_OVERRIDE } from "../../presentation-hierarchies-react/internal/Utils";
import { TreeRenderer } from "../../presentation-hierarchies-react/itwinui/TreeRenderer";
import { PresentationHierarchyNode, PresentationInfoNode, PresentationTreeNode } from "../../presentation-hierarchies-react/TreeNode";
import { HierarchyLevelDetails } from "../../presentation-hierarchies-react/UseTree";
import { act, createStub, createTestHierarchyNode, render, waitFor, within } from "../TestUtils";

type RequiredTreeProps = Required<ComponentPropsWithoutRef<typeof TreeRenderer>>;

describe("Tree", () => {
  const onFilterClick = createStub<RequiredTreeProps["onFilterClick"]>();
  const expandNode = createStub<RequiredTreeProps["expandNode"]>();
  const selectNodes = createStub<RequiredTreeProps["selectNodes"]>();
  const isNodeSelected = createStub<RequiredTreeProps["isNodeSelected"]>();
  const getHierarchyLevelDetails = createStub<RequiredTreeProps["getHierarchyLevelDetails"]>();
  const reloadTree = createStub<RequiredTreeProps["reloadTree"]>();

  const initialProps = {
    onFilterClick,
    expandNode,
    selectNodes,
    isNodeSelected,
    getHierarchyLevelDetails,
    reloadTree,
  };

  beforeEach(() => {
    onFilterClick.reset();
    expandNode.reset();
    selectNodes.reset();
    isNodeSelected.reset();
    getHierarchyLevelDetails.reset();
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

  it("renders unselectable nodes when selection callbacks are not provided", async () => {
    const rootNodes = createNodes([
      {
        id: "test node",
      },
    ]);

    const { user, getByRole } = render(<TreeRenderer rootNodes={rootNodes} expandNode={initialProps.expandNode} selectionMode={"single"} />);

    const node = getByRole("treeitem");
    expect(within(node).queryByText("test node")).to.not.be.null;
    expect(node.ariaSelected).to.eq("false");

    await user.click(node);
    expect(node.ariaSelected).to.eq("false");
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

  it("focuses node buttons with keyboard", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isExpanded: false,
        isFilterable: true,
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

    await user.tab();

    const rootNode = getByRole("treeitem", { expanded: false });

    await user.tab();

    const expandButton = within(rootNode).getByRole("button", { name: "Expand" });
    expect(expandButton.matches(":focus")).to.be.true;

    await user.tab();
    const applyFilterButton = within(rootNode).getByRole("button", { name: "Apply filter" });
    expect(applyFilterButton.matches(":focus")).to.be.true;
  });

  it("focuses filtered node buttons with keyboard", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isExpanded: false,
        isFilterable: true,
        isFiltered: true,
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

    await user.tab();

    const rootNode = getByRole("treeitem", { expanded: false });

    await user.tab();
    const expandButton = within(rootNode).getByRole("button", { name: "Expand" });
    expect(expandButton.matches(":focus")).to.be.true;

    await user.tab();
    await user.tab();
    const applyFilterButton = within(rootNode).getByRole("button", { name: "Apply filter" });
    expect(applyFilterButton.matches(":focus")).to.be.true;

    await user.tab({ shift: true });
    const clearFilterButton = within(rootNode).getByRole("button", { name: "Clear active filter" });
    expect(clearFilterButton.matches(":focus")).to.be.true;

    await user.keyboard("{Enter}");
    expect(clearFilterButton.matches(":focus")).to.be.false;
    expect(applyFilterButton.matches(":focus")).to.be.true;
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

  it("renders custom label", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} getLabel={() => <div>Label</div>} />);

    expect(queryByText("root-1")).to.be.null;
    expect(queryByText("Label")).to.not.be.null;
  });

  it("renders sublabel", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} getSublabel={() => <div>Sublabel</div>} />);

    expect(queryByText("root-1")).to.not.be.null;
    expect(queryByText("Sublabel")).to.not.be.null;
  });

  it("clears active filter", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isFiltered: true,
        isFilterable: true,
      },
    ]);

    const setInstanceFilter = createStub();
    getHierarchyLevelDetails.returns({
      setInstanceFilter,
    } as unknown as HierarchyLevelDetails);

    const { user, queryByText, getByRole } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).to.not.be.null;
    await user.click(getByRole("button", { name: "Clear active filter" }));
    expect(getHierarchyLevelDetails).to.be.calledOnceWith("root-1");
    expect(setInstanceFilter).to.be.calledOnceWith(undefined);
  });

  it("calls `onFilterClick` if node is filterable", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isFilterable: true,
      },
    ]);

    const hierarchyLevelDetails = {} as unknown as HierarchyLevelDetails;
    getHierarchyLevelDetails.returns(hierarchyLevelDetails);

    const { user, queryByText, getByRole } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).to.not.be.null;
    await user.click(getByRole("button", { name: "Apply filter" }));
    expect(onFilterClick).to.be.calledOnceWith(hierarchyLevelDetails);
  });

  describe("`ResultSetTooLarge` node", () => {
    it("renders `ResultSetTooLarge` node with filtering and override support", async () => {
      const rootNodes = createNodes([
        {
          id: "info-node",
          parentNodeId: "parent-id",
          type: "ResultSetTooLarge",
          resultSetSizeLimit: 100,
        },
      ]);
      const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);
      expect(queryByText(/Please provide/)).to.not.be.null;
      expect(queryByText(/additional filtering/)).to.not.be.null;
      expect(queryByText(/there are more items than allowed limit of 100/)).to.not.be.null;
      expect(queryByText(/increase the hierarchy level size limit to /)).to.not.be.null;
    });

    it("renders `ResultSetTooLarge` node with only filtering support", async () => {
      const rootNodes = createNodes([
        {
          id: "info-node",
          parentNodeId: "parent-id",
          type: "ResultSetTooLarge",
          resultSetSizeLimit: 100,
        },
      ]);
      const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} getHierarchyLevelDetails={undefined} />);
      expect(queryByText(/Please provide/)).to.not.be.null;
      expect(queryByText(/additional filtering/)).to.not.be.null;
      expect(queryByText(/there are more items than allowed limit of 100/)).to.not.be.null;
      expect(queryByText(/increase the hierarchy level size limit to /)).to.be.null;
    });

    it("renders `ResultSetTooLarge` node with only override support", async () => {
      const rootNodes = createNodes([
        {
          id: "info-node",
          parentNodeId: "parent-id",
          type: "ResultSetTooLarge",
          resultSetSizeLimit: 100,
        },
      ]);
      const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} onFilterClick={undefined} />);
      expect(queryByText(/Please provide/)).to.be.null;
      expect(queryByText(/additional filtering/)).to.be.null;
      expect(queryByText(/There are more items than allowed limit of 100/)).to.not.be.null;
      expect(queryByText(/Increase the hierarchy level size limit to /)).to.not.be.null;
    });

    it("renders `ResultSetTooLarge` node without filtering or override support", async () => {
      const rootNodes = createNodes([
        {
          id: "info-node",
          parentNodeId: "parent-id",
          type: "ResultSetTooLarge",
          resultSetSizeLimit: 100,
        },
      ]);
      const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} expandNode={initialProps.expandNode} />);
      expect(queryByText(/Please provide/)).to.be.null;
      expect(queryByText(/additional filtering/)).to.be.null;
      expect(queryByText(/There are more items than allowed limit of 100/)).to.not.be.null;
      expect(queryByText(/Increase the hierarchy level size limit to /i)).to.be.null;
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

      const hierarchyLevelDetails = {} as unknown as HierarchyLevelDetails;
      getHierarchyLevelDetails.returns(hierarchyLevelDetails);
      const { user, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

      expect(queryByText(/there are more items than allowed limit of 100/i)).to.not.be.null;
      await user.click(getByText("additional filtering"));
      expect(onFilterClick).to.be.calledOnceWith(hierarchyLevelDetails);
    });

    it("overrides hierarchy level size limit", async () => {
      const rootNodes = createNodes([
        {
          id: "info-node",
          parentNodeId: "parent-id",
          type: "ResultSetTooLarge",
          resultSetSizeLimit: MAX_LIMIT_OVERRIDE / 2 + 500,
        },
      ]);

      const setSizeLimit = createStub();
      getHierarchyLevelDetails.returns({
        setSizeLimit,
      } as unknown as HierarchyLevelDetails);

      const { user, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

      expect(queryByText(/there are more items than allowed limit of/i)).to.not.be.null;
      await user.click(getByText(/Increase the hierarchy level size limit/i));
      expect(getHierarchyLevelDetails).to.be.calledOnceWith("parent-id");
      expect(setSizeLimit).to.be.calledOnceWith(MAX_LIMIT_OVERRIDE);
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
      expect(queryByText(/Increase the hierarchy level size limit/i)).to.be.null;
    });
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

    const { queryByText, queryByTitle } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    await waitFor(() => {
      expect(queryByText("root-1")).to.not.be.null;
      expect(queryByTitle("Loading...")).to.not.be.null;
    });
  });

  it("renders NoFilterMatches info node", async () => {
    const rootNodes = createNodes([
      {
        id: "info-node",
        parentNodeId: undefined,
        type: "NoFilterMatches",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    await waitFor(() => {
      expect(queryByText("No child nodes match current filter")).to.not.be.null;
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

    await waitFor(() => {
      expect(queryByText("Some Error")).to.not.be.null;
    });
  });

  it("allows to reload subtree with error", async () => {
    const rootNodes = createNodes([
      {
        id: "info-node",
        parentNodeId: "parent-id",
        type: "Unknown",
        message: "Some Error",
      },
    ]);

    const { queryByText, getByText, user } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    await waitFor(() => {
      expect(queryByText("Some Error")).to.not.be.null;
    });

    await user.click(getByText("Retry"));

    await waitFor(() => {
      expect(reloadTree).to.be.calledOnceWith({ parentNodeId: "parent-id", state: "reset" });
    });
  });

  it("does not render `Retry` button if `reloadTree` callback is not provided", async () => {
    const rootNodes = createNodes([
      {
        id: "info-node",
        parentNodeId: "parent-id",
        type: "Unknown",
        message: "Some Error",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} reloadTree={undefined} />);

    await waitFor(() => {
      expect(queryByText("Some Error")).to.not.be.null;
      expect(queryByText("Retry")).to.be.null;
    });
  });

  it("uses localization", async () => {
    const rootNodes = createNodes([
      {
        id: "filtered-node",
        isFiltered: true,
        isFilterable: true,
      },
      {
        id: "info-node-1",
        isExpanded: true,
        isLoading: true,
        children: true,
      },
      {
        id: "info-node-2",
        parentNodeId: "parent-id",
        type: "NoFilterMatches",
      },
      {
        id: "info-node-3",
        parentNodeId: "parent-id",
        type: "ResultSetTooLarge",
        resultSetSizeLimit: 100,
      },
      {
        id: "info-node-4",
        parentNodeId: undefined,
        type: "Unknown",
        message: "Some Error",
      },
    ]);

    const localizedStrings = {
      loading: "Custom loading...",
      filterHierarchyLevel: "Custom apply filter",
      clearHierarchyLevelFilter: "Custom clear active filter",
      noFilteredChildren: "Custom no child nodes match current filter",
      resultLimitExceeded: "Custom there are more items than allowed limit of {{limit}}.",
      resultLimitExceededWithFiltering:
        "Custom please provide <link>Custom additional filtering</link> - Custom there are more items than allowed limit of {{limit}}.",
      increaseHierarchyLimit: "<link>Custom increase the hierarchy level size limit to {{limit}}.</link>",
      increaseHierarchyLimitWithFiltering: "Custom or, <link>Custom increase the hierarchy level size limit to {{limit}}.</link>",
    };

    const { queryByText, queryByTitle, rerender } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    await waitFor(() => {
      expect(queryByText(/Some Error/)).to.not.be.null;
      expect(queryByText(/Loading.../)).to.not.be.null;
      expect(queryByTitle(/Apply filter/)).to.not.be.null;
      expect(queryByTitle(/Clear active filter/)).to.not.be.null;
      expect(queryByText(/No child nodes match current filter/)).to.not.be.null;
      expect(queryByText(/Please provide/)).to.not.be.null;
      expect(queryByText(/additional filtering/)).to.not.be.null;
      expect(queryByText(/there are more items than allowed limit of 100./)).to.not.be.null;
      expect(queryByText(/Or,/)).to.not.be.null;
      expect(queryByText(/increase the hierarchy level size limit to /)).to.not.be.null;
      expect(
        queryByTitle(/Please provide additional filtering - there are more items than allowed limit of 100. Or, increase the hierarchy level size limit to/),
      ).to.not.be.null;
    });

    rerender(<TreeRenderer rootNodes={rootNodes} {...initialProps} localizedStrings={localizedStrings} />);

    await waitFor(() => {
      expect(queryByText(/Some Error/)).to.not.be.null;
      expect(queryByText(/Custom loading.../)).to.not.be.null;
      expect(queryByTitle(/Custom apply filter/)).to.not.be.null;
      expect(queryByTitle(/Custom clear active filter/)).to.not.be.null;
      expect(queryByText(/Custom no child nodes match current filter/)).to.not.be.null;
      expect(queryByText(/Custom please provide/)).to.not.be.null;
      expect(queryByText(/Custom additional filtering/)).to.not.be.null;
      expect(queryByText(/Custom there are more items than allowed limit of 100./)).to.not.be.null;
      expect(queryByText(/Custom or,/)).to.not.be.null;
      expect(queryByText(/Custom increase the hierarchy level size limit to /)).to.not.be.null;
      expect(
        queryByTitle(
          /Custom please provide Custom additional filtering - Custom there are more items than allowed limit of 100. Custom or, Custom increase the hierarchy level size limit to/,
        ),
      ).to.not.be.null;
    });
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

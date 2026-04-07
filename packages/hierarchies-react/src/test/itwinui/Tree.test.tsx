/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { MAX_LIMIT_OVERRIDE } from "../../presentation-hierarchies-react/internal/Utils.js";
import { TreeRenderer } from "../../presentation-hierarchies-react/itwinui/TreeRenderer.js";
import { PresentationHierarchyNode, PresentationInfoNode, PresentationTreeNode } from "../../presentation-hierarchies-react/TreeNode.js";
import { HierarchyLevelDetails } from "../../presentation-hierarchies-react/UseTree.js";
import { act, createTestHierarchyNode, render, stubVirtualization, waitFor, within } from "../TestUtils.js";

type RequiredTreeProps = Required<ComponentPropsWithoutRef<typeof TreeRenderer>>;

describe("Tree", () => {
  const onFilterClick = vi.fn<RequiredTreeProps["onFilterClick"]>();
  const expandNode = vi.fn<RequiredTreeProps["expandNode"]>();
  const selectNodes = vi.fn<RequiredTreeProps["selectNodes"]>();
  const isNodeSelected = vi.fn<RequiredTreeProps["isNodeSelected"]>();
  const getHierarchyLevelDetails = vi.fn<RequiredTreeProps["getHierarchyLevelDetails"]>();
  const reloadTree = vi.fn<RequiredTreeProps["reloadTree"]>();

  const initialProps = {
    onFilterClick,
    expandNode,
    selectNodes,
    isNodeSelected,
    getHierarchyLevelDetails,
    reloadTree,
  };

  stubVirtualization();

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

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("root-2")).not.toBeNull();
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

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("child-1")).not.toBeNull();
    expect(queryByText("root-2")).not.toBeNull();
    expect(queryByText("child-2")).toBeNull();

    const collapseButton = within(getByRole("treeitem", { expanded: true })).getByRole("button", { name: "Collapse" });
    const expandButton = within(getByRole("treeitem", { expanded: false })).getByRole("button", { name: "Expand" });

    await user.click(collapseButton);
    expect(expandNode).toHaveBeenCalledExactlyOnceWith("root-1", false);
    expandNode.mockReset();

    await user.click(expandButton);
    expect(expandNode).toHaveBeenCalledExactlyOnceWith("root-2", true);
  });

  it("renders unselectable nodes when selection callbacks are not provided", async () => {
    const rootNodes = createNodes([
      {
        id: "test node",
      },
    ]);

    const { user, getByRole } = render(<TreeRenderer rootNodes={rootNodes} expandNode={initialProps.expandNode} selectionMode={"single"} />);

    const node = getByRole("treeitem");
    expect(within(node).queryByText("test node")).not.toBeNull();
    expect(node.getAttribute("aria-selected")).toBe("false");

    await user.click(node);
    expect(node.getAttribute("aria-selected")).toBe("false");
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

    isNodeSelected.mockImplementation((nodeId) => nodeId === "root-1");

    const { user, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} selectionMode={"single"} />);

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("root-2")).not.toBeNull();

    await user.click(getByText("root-1"));
    expect(selectNodes).toHaveBeenCalledExactlyOnceWith(["root-1"], "remove");
    selectNodes.mockReset();

    await user.click(getByText("root-2"));
    expect(selectNodes).toHaveBeenCalledExactlyOnceWith(["root-2"], "replace");
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

    isNodeSelected.mockImplementation((nodeId) => nodeId === "root-1");

    const { user, getAllByRole, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} selectionMode={"single"} />);

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("root-2")).not.toBeNull();

    const node1 = getAllByRole("treeitem")[0];
    act(() => {
      node1.focus();
    });
    await user.keyboard("{Enter}");
    expect(selectNodes).toHaveBeenCalledExactlyOnceWith(["root-1"], "remove");
    selectNodes.mockReset();

    const node2 = getAllByRole("treeitem")[1];
    act(() => {
      node2.focus();
    });
    await user.keyboard("{Enter}");
    expect(selectNodes).toHaveBeenCalledExactlyOnceWith(["root-2"], "replace");
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

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("child-1")).toBeNull();

    const expandButton = within(getByRole("treeitem", { expanded: false })).getByRole("button", { name: "Expand" });

    act(() => {
      expandButton.focus();
    });
    await user.keyboard("{Enter}");
    expect(expandNode).toHaveBeenCalledExactlyOnceWith("root-1", true);
    expect(selectNodes).not.toHaveBeenCalled();
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

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("child-1")).toBeNull();

    await user.tab();

    const rootNode = getByRole("treeitem", { expanded: false });

    await user.tab();

    const expandButton = within(rootNode).getByRole("button", { name: "Expand" });
    expect(expandButton.matches(":focus")).toBe(true);

    await user.tab();
    const applyFilterButton = within(rootNode).getByRole("button", { name: "Apply filter" });
    expect(applyFilterButton.matches(":focus")).toBe(true);
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

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("child-1")).toBeNull();

    await user.tab();

    const rootNode = getByRole("treeitem", { expanded: false });

    await user.tab();
    const expandButton = within(rootNode).getByRole("button", { name: "Expand" });
    expect(expandButton.matches(":focus")).toBe(true);

    await user.tab();
    await user.tab();
    const applyFilterButton = within(rootNode).getByRole("button", { name: "Apply filter" });
    expect(applyFilterButton.matches(":focus")).toBe(true);

    await user.tab({ shift: true });
    const clearFilterButton = within(rootNode).getByRole("button", { name: "Clear active filter" });
    expect(clearFilterButton.matches(":focus")).toBe(true);

    await user.keyboard("{Enter}");
    expect(clearFilterButton.matches(":focus")).toBe(false);
    expect(applyFilterButton.matches(":focus")).toBe(true);
  });

  it("focuses `Apply filter` button when node becomes filtered", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isExpanded: false,
        isFilterable: true,
        isFiltered: false,
        children: [
          {
            id: "child-1",
          },
        ],
      },
    ]);

    const { rerender, getByRole, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("child-1")).toBeNull();

    const rootNode = getByRole("treeitem", { expanded: false });
    expect(within(rootNode).getByRole("button", { name: "Apply filter" }).matches(":focus")).toBe(false);

    const filteredRootNodes = createNodes([
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
    rerender(<TreeRenderer rootNodes={filteredRootNodes} {...initialProps} />);

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("child-1")).toBeNull();

    const filteredRootNode = getByRole("treeitem", { expanded: false });
    expect(within(filteredRootNode).getByRole("button", { name: "Apply filter" }).matches(":focus")).toBe(true);
  });

  it("renders icon", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} getIcon={() => <div>Icon</div>} />);

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("Icon")).not.toBeNull();
  });

  it("renders custom label", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} getLabel={() => <div>Label</div>} />);

    expect(queryByText("root-1")).toBeNull();
    expect(queryByText("Label")).not.toBeNull();
  });

  it("renders sublabel", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
      },
    ]);

    const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} getSublabel={() => <div>Sublabel</div>} />);

    expect(queryByText("root-1")).not.toBeNull();
    expect(queryByText("Sublabel")).not.toBeNull();
  });

  it("clears active filter", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isFiltered: true,
        isFilterable: true,
      },
    ]);

    const setInstanceFilter = vi.fn();
    getHierarchyLevelDetails.mockReturnValue({
      setInstanceFilter,
    } as unknown as HierarchyLevelDetails);

    const { user, queryByText, getByRole } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).not.toBeNull();
    await user.click(getByRole("button", { name: "Clear active filter" }));
    expect(getHierarchyLevelDetails).toHaveBeenCalledExactlyOnceWith("root-1");
    expect(setInstanceFilter).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("calls `onFilterClick` if node is filterable", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isFilterable: true,
      },
    ]);

    const hierarchyLevelDetails = {} as unknown as HierarchyLevelDetails;
    getHierarchyLevelDetails.mockReturnValue(hierarchyLevelDetails);

    const { user, queryByText, getByRole } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    expect(queryByText("root-1")).not.toBeNull();
    await user.click(getByRole("button", { name: "Apply filter" }));
    expect(onFilterClick).toHaveBeenCalledExactlyOnceWith(hierarchyLevelDetails);
  });

  it("renders filter button when filter buttons are hidden, but node is filtered", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isFilterable: true,
        isFiltered: true,
      },
    ]);

    const hierarchyLevelDetails = {} as unknown as HierarchyLevelDetails;
    getHierarchyLevelDetails.mockReturnValue(hierarchyLevelDetails);

    const { user, queryByText, getByRole } = render(<TreeRenderer rootNodes={rootNodes} filterButtonsVisibility={"hide"} {...initialProps} />);

    expect(queryByText("root-1")).not.toBeNull();
    await user.click(getByRole("button", { name: "Apply filter" }));
    expect(onFilterClick).toHaveBeenCalledExactlyOnceWith(hierarchyLevelDetails);
  });

  it("renders single additional action inline", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isFilterable: true,
      },
    ]);

    const hierarchyLevelDetails = {} as unknown as HierarchyLevelDetails;
    getHierarchyLevelDetails.mockReturnValue(hierarchyLevelDetails);

    const actionSpy = vi.fn();
    const getActions: RequiredTreeProps["getActions"] = () => [
      {
        label: "Custom action",
        onClick: actionSpy,
        icon: <></>,
      },
    ];

    const { user, getByRole } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} getActions={getActions} />);

    const actionButton = getByRole("button", { name: "Custom action" });
    await user.click(actionButton);
    expect(actionSpy).toHaveBeenCalledOnce();
  });

  it("renders additional actions in dropdown menu", async () => {
    const rootNodes = createNodes([
      {
        id: "root-1",
        isFilterable: true,
      },
    ]);

    const hierarchyLevelDetails = {} as unknown as HierarchyLevelDetails;
    getHierarchyLevelDetails.mockReturnValue(hierarchyLevelDetails);

    const actionSpy1 = vi.fn();
    const actionSpy2 = vi.fn();
    const getActions: RequiredTreeProps["getActions"] = () => [
      {
        label: "Custom action 1",
        onClick: actionSpy1,
        icon: <></>,
      },
      {
        label: "Custom action 2",
        onClick: actionSpy2,
        icon: <></>,
      },
    ];

    const { user, getByRole, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} getActions={getActions} />);

    const moreButton = getByRole("button", { name: "More" });
    await user.click(moreButton);
    const actionButton1 = getByText("Custom action 1");
    await user.click(actionButton1);
    expect(actionSpy1).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(queryByText("Custom action 1")).toBeNull();
    });

    await user.click(moreButton);
    const actionButton2 = getByText("Custom action 2");
    await user.click(actionButton2);
    expect(actionSpy2).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(queryByText("Custom action 2")).toBeNull();
    });
  });

  describe("`ResultSetTooLarge` node", () => {
    it("renders `ResultSetTooLarge` node with filtering and override support", async () => {
      const hierarchyLevelDetails = {
        hierarchyNode: createTestHierarchyNode({ id: "parent-id", supportsFiltering: true }),
      } as unknown as HierarchyLevelDetails;
      getHierarchyLevelDetails.mockReturnValue(hierarchyLevelDetails);
      const rootNodes = createNodes([
        {
          id: "info-node",
          parentNodeId: "parent-id",
          type: "ResultSetTooLarge",
          resultSetSizeLimit: 100,
        },
      ]);
      const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);
      expect(queryByText(/Please provide/)).not.toBeNull();
      expect(queryByText(/additional filtering/)).not.toBeNull();
      expect(queryByText(/there are more items than allowed limit of 100/)).not.toBeNull();
      expect(queryByText(/increase the hierarchy level size limit to /)).not.toBeNull();
    });

    it("renders `ResultSetTooLarge` node with only override support", async () => {
      const hierarchyLevelDetails = {
        hierarchyNode: createTestHierarchyNode({ id: "parent-id", supportsFiltering: true }),
      } as unknown as HierarchyLevelDetails;
      getHierarchyLevelDetails.mockReturnValue(hierarchyLevelDetails);
      const rootNodes = createNodes([
        {
          id: "info-node",
          parentNodeId: "parent-id",
          type: "ResultSetTooLarge",
          resultSetSizeLimit: 100,
        },
      ]);
      const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} onFilterClick={undefined} />);
      expect(queryByText(/Please provide/)).toBeNull();
      expect(queryByText(/additional filtering/)).toBeNull();
      expect(queryByText(/There are more items than allowed limit of 100/)).not.toBeNull();
      expect(queryByText(/Increase the hierarchy level size limit to /)).not.toBeNull();
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
      const { queryByText } = render(<TreeRenderer rootNodes={rootNodes} expandNode={initialProps.expandNode} getHierarchyLevelDetails={undefined} />);
      expect(queryByText(/Please provide/)).toBeNull();
      expect(queryByText(/additional filtering/)).toBeNull();
      expect(queryByText(/There are more items than allowed limit of 100/)).not.toBeNull();
      expect(queryByText(/Increase the hierarchy level size limit to /i)).toBeNull();
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

      const hierarchyLevelDetails = {
        hierarchyNode: createTestHierarchyNode({ id: "parent-id", supportsFiltering: true }),
      } as unknown as HierarchyLevelDetails;
      getHierarchyLevelDetails.mockReturnValue(hierarchyLevelDetails);
      const { user, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

      expect(queryByText(/there are more items than allowed limit of 100/i)).not.toBeNull();
      await user.click(getByText("additional filtering"));
      expect(onFilterClick).toHaveBeenCalledExactlyOnceWith(hierarchyLevelDetails);
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

      const setSizeLimit = vi.fn();
      getHierarchyLevelDetails.mockReturnValue({
        setSizeLimit,
      } as unknown as HierarchyLevelDetails);

      const { user, getByText, queryByText } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

      expect(queryByText(/there are more items than allowed limit of/i)).not.toBeNull();
      await user.click(getByText(/Increase the hierarchy level size limit/i));
      expect(getHierarchyLevelDetails).toHaveBeenCalledWith("parent-id");
      expect(setSizeLimit).toHaveBeenCalledExactlyOnceWith(MAX_LIMIT_OVERRIDE);
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

      expect(queryByText(/there are more items than allowed limit of/i)).not.toBeNull();
      expect(queryByText(/Increase the hierarchy level size limit/i)).toBeNull();
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
      expect(queryByText("root-1")).not.toBeNull();
      expect(queryByTitle("Loading...")).not.toBeNull();
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
      expect(queryByText("No child nodes match current filter")).not.toBeNull();
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
      expect(queryByText("Some Error")).not.toBeNull();
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
      expect(queryByText("Some Error")).not.toBeNull();
    });

    await user.click(getByText("Retry"));

    await waitFor(() => {
      expect(reloadTree).toHaveBeenCalledExactlyOnceWith({ parentNodeId: "parent-id", state: "reset" });
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
      expect(queryByText("Some Error")).not.toBeNull();
      expect(queryByText("Retry")).toBeNull();
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

    const hierarchyLevelDetails = {
      hierarchyNode: createTestHierarchyNode({ id: "parent-id", supportsFiltering: true }),
    } as unknown as HierarchyLevelDetails;
    getHierarchyLevelDetails.mockReturnValue(hierarchyLevelDetails);
    const { queryByText, queryByRole, queryByTitle, rerender } = render(<TreeRenderer rootNodes={rootNodes} {...initialProps} />);

    await waitFor(() => {
      expect(queryByText(/Some Error/)).not.toBeNull();
      expect(queryByText(/Loading.../)).not.toBeNull();
      expect(queryByRole("button", { name: "Apply filter" })).not.toBeNull();
      expect(queryByRole("button", { name: "Clear active filter" })).not.toBeNull();
      expect(queryByText(/No child nodes match current filter/)).not.toBeNull();
      expect(queryByText(/Please provide/)).not.toBeNull();
      expect(queryByText(/additional filtering/)).not.toBeNull();
      expect(queryByText(/there are more items than allowed limit of 100./)).not.toBeNull();
      expect(queryByText(/Or,/)).not.toBeNull();
      expect(queryByText(/increase the hierarchy level size limit to /)).not.toBeNull();
      expect(
        queryByTitle(/Please provide additional filtering - there are more items than allowed limit of 100. Or, increase the hierarchy level size limit to/),
      ).not.toBeNull();
    });

    rerender(<TreeRenderer rootNodes={rootNodes} {...initialProps} localizedStrings={localizedStrings} />);

    await waitFor(() => {
      expect(queryByText(/Some Error/)).not.toBeNull();
      expect(queryByText(/Custom loading.../)).not.toBeNull();
      expect(queryByRole("button", { name: "Custom apply filter" })).not.toBeNull();
      expect(queryByRole("button", { name: "Custom clear active filter" })).not.toBeNull();
      expect(queryByText(/Custom no child nodes match current filter/)).not.toBeNull();
      expect(queryByText(/Custom please provide/)).not.toBeNull();
      expect(queryByText(/Custom additional filtering/)).not.toBeNull();
      expect(queryByText(/Custom there are more items than allowed limit of 100./)).not.toBeNull();
      expect(queryByText(/Custom or,/)).not.toBeNull();
      expect(queryByText(/Custom increase the hierarchy level size limit to /)).not.toBeNull();
      expect(
        queryByTitle(
          /Custom please provide Custom additional filtering - Custom there are more items than allowed limit of 100. Custom or, Custom increase the hierarchy level size limit to/,
        ),
      ).not.toBeNull();
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

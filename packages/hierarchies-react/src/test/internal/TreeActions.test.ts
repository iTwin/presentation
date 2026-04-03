/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator, throwingAsyncIterator } from "presentation-test-utilities";
import { firstValueFrom, Subject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenericInstanceFilter, GetHierarchyNodesProps, HierarchyNode, HierarchyNodeKey, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { TreeActions } from "../../presentation-hierarchies-react/internal/TreeActions.js";
import { TreeModel } from "../../presentation-hierarchies-react/internal/TreeModel.js";
import { createNodeId } from "../../presentation-hierarchies-react/internal/Utils.js";
import { createTestGroupingNode, createTestHierarchyNode, createTreeModel, getHierarchyNode, waitFor } from "../TestUtils.js";

describe("TreeActions", () => {
  const provider = {
    getNodes: vi.fn<HierarchyProvider["getNodes"]>(),
  };
  const onModelChangedStub = vi.fn<(model: TreeModel) => void>();
  const onLoadStub = vi.fn<(type: "initial-load" | "hierarchy-level-load" | "reload", duration: number) => void>();
  const onHierarchyLoadErrorStub = vi.fn<(props: { parentId?: string; type: "timeout" | "unknown"; error: any }) => void>();

  function createActions(seed: TreeModel) {
    const actions = new TreeActions(
      onModelChangedStub,
      onLoadStub,
      () => {},
      onHierarchyLoadErrorStub,
      (n) => (HierarchyNode.isGeneric(n) ? n.key.id : createNodeId(n)),
      seed,
    );
    actions.setHierarchyProvider(provider as unknown as HierarchyProvider);
    return actions;
  }

  beforeEach(() => {
    provider.getNodes.mockImplementation(() => createAsyncIterator([]));
  });

  describe("reset", () => {
    it("cancels ongoing node load", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: undefined,
        },
      ]);

      const firstLoad = new Subject<HierarchyNode>();
      provider.getNodes.mockImplementation(async function* () {
        yield await firstValueFrom(firstLoad);
      });

      const actions = createActions(model);

      actions.expandNode("root-1", true);

      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalledOnce();
        const newModel = onModelChangedStub.mock.calls[0][0];
        expect(getHierarchyNode(newModel, "root-1")?.isLoading).toBe(true);
        expect(getHierarchyNode(newModel, "root-1")?.children).toBe(true);
        expect(provider.getNodes).toHaveBeenCalledOnce();
      });
      onModelChangedStub.mockClear();

      actions.reset();
      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalledOnce();
        const newModel = onModelChangedStub.mock.calls[0][0];
        expect(getHierarchyNode(newModel, "root-1")?.isLoading).toBe(false);
        expect(getHierarchyNode(newModel, "root-1")?.children).toBe(true);
      });
      onModelChangedStub.mockClear();

      firstLoad.next(createTestHierarchyNode({ id: "child-1" }));
      firstLoad.complete();
      await waitFor(() => {
        expect(onModelChangedStub).not.toHaveBeenCalled();
      });
    });

    it("does not clear tree model after reload is canceled", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: undefined,
        },
      ]);

      const nodes = new Subject<HierarchyNode>();
      provider.getNodes.mockImplementation(async function* () {
        yield await firstValueFrom(nodes);
      });

      const actions = createActions(model);

      actions.reloadTree();

      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalledOnce();
        const newModel = onModelChangedStub.mock.calls[0][0];
        expect(newModel.rootNode.isLoading).toBe(true);
        expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
      });

      onModelChangedStub.mockClear();
      actions.reset();

      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalledOnce();
        const newModel = onModelChangedStub.mock.calls[0][0];
        expect(newModel.rootNode.isLoading).toBe(false);
        expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
      });

      nodes.next(createTestHierarchyNode({ id: "updated-root-1" }));
      nodes.complete();
      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalledOnce();
        const newModel = onModelChangedStub.mock.calls[0][0];
        expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
        expect(getHierarchyNode(newModel, "updated-root-1")).toBeUndefined();
      });
    });
  });

  describe("selectNodes", () => {
    it("calls `onModelChanged` after node is selected", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isSelected: false,
          children: [],
        },
      ]);

      const actions = createActions(model);

      actions.selectNodes(["root-1"], "add");

      expect(onModelChangedStub).toHaveBeenCalledOnce();
      const newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.isSelected).toBe(true);
    });

    it("calls `onModelChanged` after node is unselected", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isSelected: true,
          children: [],
        },
      ]);

      const actions = createActions(model);

      actions.selectNodes(["root-1"], "remove");

      expect(onModelChangedStub).toHaveBeenCalledOnce();
      const newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.isSelected).toBe(false);
    });

    it("does not call `onModelChanged` after selected node is selected", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isSelected: true,
          children: [],
        },
      ]);

      const actions = createActions(model);

      actions.selectNodes(["root-1"], "add");

      expect(onModelChangedStub).not.toHaveBeenCalled();
    });
  });

  describe("expandNode", () => {
    it("calls `onModelChanged` after node is expanded", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      const actions = createActions(model);

      actions.expandNode("root-1", true);

      expect(onModelChangedStub).toHaveBeenCalledOnce();
      const newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.isExpanded).toBe(true);
    });

    it("calls `onModelChanged` after node is collapsed", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: true,
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      const actions = createActions(model);

      actions.expandNode("root-1", false);

      expect(onModelChangedStub).toHaveBeenCalledOnce();
      const newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.isExpanded).toBe(false);
    });

    it("loads nodes correctly when different nodes are being expanded at the same time", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: undefined,
        },
        {
          id: "root-2",
          isExpanded: false,
          children: undefined,
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-2" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await Promise.all([
        actions.expandNode("root-1", true)?.complete,
        actions.expandNode("root-2", true)?.complete,
        actions.expandNode("root-1", false)?.complete,
        actions.expandNode("root-1", true)?.complete,
      ]);

      expect(provider.getNodes).toHaveBeenCalledTimes(2);
      let newModel = onModelChangedStub.mock.calls[0][0];
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, ignoreCache: false }));
      newModel = onModelChangedStub.mock.calls[1][0];
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-2")?.nodeData, ignoreCache: false }));
    });

    it("does not call `onModelChanged` after expanding expanded node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: true,
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      const actions = createActions(model);

      actions.expandNode("root-1", true);
      expect(onModelChangedStub).not.toHaveBeenCalled();
    });

    it("loads child nodes after expanded node with unloaded children", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: undefined,
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        return createAsyncIterator(
          props.parentNode && HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })
            ? [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })]
            : [],
        );
      });

      const actions = createActions(model);

      await actions.expandNode("root-1", true)?.complete;

      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      let newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.isExpanded).toBe(true);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).toBe(true);
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, ignoreCache: false }));

      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).toBe(false);
      expect(getHierarchyNode(newModel, "child-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-2")).toBeDefined();
    });

    it("loads grouping node children with tree root filter", async () => {
      const filter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };
      const groupingNode = createTestGroupingNode({ id: "grouping-node" });
      const model = createTreeModel([
        {
          id: undefined,
          instanceFilter: filter,
          children: ["grouping-node"],
        },
        {
          id: "grouping-node",
          isExpanded: false,
          nodeData: groupingNode,
          children: undefined,
        },
      ]);

      const actions = createActions(model);

      await actions.expandNode("grouping-node", true)?.complete;

      expect(provider.getNodes).toHaveBeenCalledWith(
        createGetNodesProps({ parentNode: getHierarchyNode(model, "grouping-node")?.nodeData, instanceFilter: filter, ignoreCache: false }),
      );
    });

    it("loads grouping node children with non grouping parent filter", async () => {
      const filter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };
      const nonGroupingNode = createTestHierarchyNode({ id: "root-1" });
      const groupingNode = createTestGroupingNode({ id: "grouping-node", nonGroupingAncestor: nonGroupingNode });
      const model = createTreeModel([
        {
          id: undefined,
          instanceFilter: filter,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: true,
          instanceFilter: filter,
          nodeData: nonGroupingNode,
          children: ["grouping-node"],
        },
        {
          id: "grouping-node",
          isExpanded: false,
          nodeData: groupingNode,
          children: undefined,
        },
      ]);

      const actions = createActions(model);

      await actions.expandNode("grouping-node", true)?.complete;

      expect(provider.getNodes).toHaveBeenCalledWith(
        createGetNodesProps({ parentNode: getHierarchyNode(model, "grouping-node")?.nodeData, instanceFilter: filter, ignoreCache: false }),
      );
    });
  });

  describe("setHierarchyLimit", () => {
    it("calls `onModelChanged` after setting hierarchy limit", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      const actions = createActions(model);

      await actions.setHierarchyLimit("root-1", 100)?.complete;

      expect(onModelChangedStub).toHaveBeenCalledOnce();
      const newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.hierarchyLimit).toBe(100);
    });

    it("loads children after setting hierarchy limit on expanded node", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: true,
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      const actions = createActions(model);

      await actions.setHierarchyLimit("root-1", 100)?.complete;

      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      let newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.hierarchyLimit).toBe(100);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).toBe(true);

      await waitFor(() => {
        expect(provider.getNodes).toHaveBeenCalledWith(
          createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, hierarchyLevelSizeLimit: 100 }),
        );
      });

      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).toBe(false);
    });

    it("does not load children after setting hierarchy limit on collapsed node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      const actions = createActions(model);

      actions.setHierarchyLimit("root-1", 100);
      expect(onModelChangedStub).toHaveBeenCalledOnce();
      const newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.hierarchyLimit).toBe(100);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).toBeUndefined();

      expect(provider.getNodes).not.toHaveBeenCalled();
    });

    it("sets hierarchy limit for tree root and reloads subtree", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: [],
        },
      ]);

      const actions = createActions(model);

      await actions.setHierarchyLimit(undefined, 100)?.complete;

      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      const newModel = onModelChangedStub.mock.calls[0][0];
      expect(newModel.rootNode?.hierarchyLimit).toBe(100);

      await waitFor(() => {
        expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: newModel.rootNode.nodeData, hierarchyLevelSizeLimit: 100 }));
      });
    });
  });

  describe("setInstanceFilter", () => {
    const filter: GenericInstanceFilter = {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { operator: "and", rules: [] },
    };

    it("calls `onModelChanged` after setting hierarchy filter and removes subtree", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      const actions = createActions(model);

      await actions.setInstanceFilter("root-1", filter)?.complete;

      () => expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      const newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).toBe(filter);
      expect(getHierarchyNode(newModel, "child-1")).toBeUndefined();
    });

    it("reloads tree after setting hierarchy filter node", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-A"],
        },
        {
          id: "root-A",
          isExpanded: true,
          children: ["child-A"],
        },
        {
          id: "child-A",
          children: [],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        return createAsyncIterator(
          props.parentNode && HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-A" })
            ? [createTestHierarchyNode({ id: "child-B" })]
            : [],
        );
      });

      const actions = createActions(model);

      await actions.setInstanceFilter("root-A", filter)?.complete;

      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      let newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-A")?.instanceFilter).toBe(filter);
      expect(getHierarchyNode(newModel, "root-A")?.isLoading).toBe(true);
      expect(provider.getNodes).toHaveBeenCalledWith(
        createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-A")?.nodeData, instanceFilter: filter }),
      );
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-A")?.isLoading).toBe(false);
      expect(getHierarchyNode(newModel, "child-A")).toBeUndefined();
      expect(getHierarchyNode(newModel, "child-B")).toBeDefined();
    });

    it("loads children after setting hierarchy filter on collapsed node", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        return createAsyncIterator(
          props.parentNode && HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })
            ? [createTestHierarchyNode({ id: "child-1" })]
            : [],
        );
      });

      const actions = createActions(model);

      await actions.setInstanceFilter("root-1", filter)?.complete;

      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      let newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).toBe(filter);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).toBe(true);
      expect(provider.getNodes).toHaveBeenCalledOnce();
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).toBe(false);
      expect(getHierarchyNode(newModel, "child-1")).toBeDefined();
    });

    it("sets instance filter for tree root and reloads subtree", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: [],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-2" })] : []);
      });

      const actions = createActions(model);

      await actions.setInstanceFilter(undefined, filter)?.complete;

      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      let newModel = onModelChangedStub.mock.calls[0][0];
      expect(newModel.rootNode?.instanceFilter).toBe(filter);
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: newModel.rootNode.nodeData, instanceFilter: filter }));
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")).toBeUndefined();
      expect(getHierarchyNode(newModel, "root-2")).toBeDefined();
    });

    it("sets instance filter and creates `NoFilterMatchingNodes` info nodes if there are no children", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: true,
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: [],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation(() => {
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.setInstanceFilter("root-1", filter)?.complete;

      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      let newModel = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).toBe(filter);
      expect(provider.getNodes).toHaveBeenCalledWith(
        createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, instanceFilter: filter }),
      );
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
      newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-1")).toBeUndefined();
      expect(newModel.idToNode.get("root-1-no-filter-matches")).toBeDefined();
    });

    it("does nothing when called on invalid node", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: [],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation(() => {
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      actions.setInstanceFilter("invalid", filter);

      await waitFor(() => {
        expect(onModelChangedStub).not.toHaveBeenCalled();
        expect(provider.getNodes).not.toHaveBeenCalled();
      });
    });
  });

  describe("reloadTree", () => {
    it("reloads nodes once when multiple request are made at the same time", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: true,
          children: ["child-1"],
        },
        {
          id: "root-2",
          children: ["child-2"],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      actions.reloadTree({ state: "keep" });
      actions.reloadTree({ state: "keep" });
      await actions.reloadTree({ state: "keep" })?.complete;

      expect(provider.getNodes).toHaveBeenCalledTimes(2); // once for root node, once for child node
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
    });

    it("reloads nodes once with discarded state when multiple request are made at the same time and one of them had reset state", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: true,
          children: ["child-1"],
        },
        {
          id: "root-2",
          children: ["child-2"],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await Promise.all([
        actions.reloadTree({ state: "keep" })?.complete,
        actions.reloadTree({ state: "discard" })?.complete,
        actions.reloadTree({ state: "keep" })?.complete,
      ]);

      expect(provider.getNodes).toHaveBeenCalledOnce(); // state discarded loaded only root node
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);
    });

    it("reloads expanded nodes", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: true,
          children: ["child-1"],
        },
        {
          id: "root-2",
          children: ["child-2"],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree(undefined)?.complete;

      expect(provider.getNodes).toHaveBeenCalledTimes(2);
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: getHierarchyNode(model, "root-1")?.nodeData, ignoreCache: false }));
      // one call is made before reloading to set `rootNode.isLoading`
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);

      const newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "root-2")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-1-2")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-1")).toBeUndefined();
      expect(getHierarchyNode(newModel, "child-2")).toBeUndefined();
    });

    it("reloads expanded nodes if `state` = `keep`", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: true,
          children: ["child-1"],
        },
        {
          id: "root-2",
          children: ["child-2"],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree({ state: "keep" })?.complete;

      expect(provider.getNodes).toHaveBeenCalledTimes(2);
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);

      const newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "root-2")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-1-2")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-1")).toBeUndefined();
      expect(getHierarchyNode(newModel, "child-2")).toBeUndefined();
    });

    it("reloads auto expanded nodes", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          children: ["child-1"],
          nodeData: createTestHierarchyNode({ id: "root-1", autoExpand: true }),
        },
        {
          id: "root-2",
          children: ["child-2"],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1", autoExpand: true }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree(undefined)?.complete;

      expect(provider.getNodes).toHaveBeenCalledTimes(2);
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: getHierarchyNode(model, "root-1")?.nodeData, ignoreCache: false }));
      // one call is made before reloading to set `rootNode.isLoading`
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);

      const newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "root-2")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-2")).toBeUndefined();
    });

    it("does not reload auto expanded collapsed nodes", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: ["child-1"],
        },
        {
          id: "root-2",
          children: ["child-2"],
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1", autoExpand: true }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree(undefined)?.complete;

      expect(provider.getNodes).toHaveBeenCalledOnce();
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      // one call is made before reloading to set `rootNode.isLoading`
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);

      const newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "root-2")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-1")).toBeUndefined();
      expect(getHierarchyNode(newModel, "child-2")).toBeUndefined();
    });

    it("reloads nodes with additional attributes", async () => {
      const instanceFilter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          hierarchyLimit: 100,
        },
        {
          id: "root-2",
          instanceFilter,
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree(undefined)?.complete;

      expect(provider.getNodes).toHaveBeenCalledOnce();
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      // one call is made before reloading to set `rootNode.isLoading`
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);

      const newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "root-1")?.hierarchyLimit).toBe(100);
      expect(getHierarchyNode(newModel, "root-2")).toBeDefined();
      expect(getHierarchyNode(newModel, "root-2")?.instanceFilter).toBe(instanceFilter);
    });

    it("removes subtree before reload if `state` = `reset`", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: ["info-node"],
        },
        {
          id: "info-node",
          type: "Unknown",
          message: "Info node",
        },
      ]);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        if (props.parentNode !== undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree({ parentNodeId: "root-1", state: "reset" })?.complete;

      expect(provider.getNodes).toHaveBeenCalledOnce();
      expect(provider.getNodes).toHaveBeenCalledWith(createGetNodesProps({ parentNode: getHierarchyNode(model, "root-1")?.nodeData, ignoreCache: true }));
      // one call is made before reloading to set `rootNode.isLoading` and remove sub tree
      expect(onModelChangedStub).toHaveBeenCalledTimes(2);

      const modelBeforeReload = onModelChangedStub.mock.calls[0][0];
      expect(getHierarchyNode(modelBeforeReload, "root-1")).toBeDefined();
      expect(modelBeforeReload.idToNode.get("info-node")).toBeUndefined();

      const newModel = onModelChangedStub.mock.calls[1][0];
      expect(getHierarchyNode(newModel, "root-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-1")).toBeDefined();
      expect(getHierarchyNode(newModel, "child-2")).toBeDefined();
    });
  });

  describe("performance reporting", () => {
    it("reports initial load", async () => {
      const actions = createActions(createTreeModel([]));

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation(() => {
        return createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]);
      });

      await actions.reloadTree()?.complete;

      expect(onModelChangedStub).toHaveBeenCalled();
      expect(onLoadStub).toHaveBeenCalledWith("initial-load", expect.any(Number));
    });

    it("reports timeout on initial load", async () => {
      const actions = createActions(createTreeModel([]));

      provider.getNodes.mockReset();
      const error = new Error("query too long to execute or server is too busy");
      provider.getNodes.mockImplementation(() => {
        return throwingAsyncIterator(error);
      });

      await actions.reloadTree()?.complete;

      expect(onModelChangedStub).toHaveBeenCalled();
      expect(onLoadStub).toHaveBeenCalledWith("initial-load", Number.MAX_SAFE_INTEGER);
      expect(onHierarchyLoadErrorStub).toHaveBeenCalledWith({ parentId: undefined, type: "timeout", error });
    });

    it("reports hierarchy level load", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: undefined,
        },
      ]);
      const actions = createActions(model);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        return createAsyncIterator(props.parentNode !== undefined ? [createTestHierarchyNode({ id: "child-1" })] : []);
      });

      actions.expandNode("root-1", true);

      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalled();
        expect(onLoadStub).toHaveBeenCalledWith("hierarchy-level-load", expect.any(Number));
      });
    });

    it("reports timeout on hierarchy level load", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: undefined,
        },
      ]);
      const actions = createActions(model);

      provider.getNodes.mockReset();
      const error = new Error("query too long to execute or server is too busy");
      provider.getNodes.mockImplementation(() => {
        return throwingAsyncIterator(error);
      });

      actions.expandNode("root-1", true);

      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalled();
        expect(onLoadStub).toHaveBeenCalledWith("hierarchy-level-load", Number.MAX_SAFE_INTEGER);
        expect(onHierarchyLoadErrorStub).toHaveBeenCalledWith({ parentId: "root-1", type: "timeout", error });
      });
    });

    it("reports tree reload", async () => {
      const actions = createActions(
        createTreeModel([
          {
            id: undefined,
            children: ["root-1"],
          },
          {
            id: "root-1",
            children: [],
          },
        ]),
      );

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation((props) => {
        return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-2" })] : []);
      });

      actions.reloadTree();

      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalled();
        expect(onLoadStub).toHaveBeenCalledWith("reload", expect.any(Number));
      });
    });

    it("reports timeout on tree reload", async () => {
      const actions = createActions(
        createTreeModel([
          {
            id: undefined,
            children: ["root-1"],
          },
          {
            id: "root-1",
            children: [],
          },
        ]),
      );

      provider.getNodes.mockReset();
      const error = new Error("query too long to execute or server is too busy");
      provider.getNodes.mockImplementation(() => {
        return throwingAsyncIterator(error);
      });

      actions.reloadTree();

      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalled();
        expect(onLoadStub).toHaveBeenCalledWith("reload", Number.MAX_SAFE_INTEGER);
        expect(onHierarchyLoadErrorStub).toHaveBeenCalledWith({ parentId: undefined, type: "timeout", error });
      });
    });

    it("does not report timeout when no children nodes are loaded", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: undefined,
        },
      ]);
      const actions = createActions(model);

      provider.getNodes.mockReset();
      provider.getNodes.mockImplementation(() => {
        return createAsyncIterator([]);
      });

      actions.expandNode("root-1", true);

      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalled();
        expect(onLoadStub).toHaveBeenCalledWith("hierarchy-level-load", expect.any(Number));
        expect(onHierarchyLoadErrorStub).not.toHaveBeenCalled();
      });
    });

    it("does not report performance when unknown error occurs", async () => {
      const actions = createActions(createTreeModel([]));

      provider.getNodes.mockReset();
      const error = new Error("Test error");
      provider.getNodes.mockImplementation(() => {
        return throwingAsyncIterator(error);
      });

      actions.reloadTree();

      await waitFor(() => {
        expect(onModelChangedStub).toHaveBeenCalled();
        expect(onLoadStub).not.toHaveBeenCalled();
        expect(onHierarchyLoadErrorStub).toHaveBeenCalledWith({ parentId: undefined, type: "unknown", error });
      });
    });
  });
});

function createGetNodesProps(props: Partial<GetHierarchyNodesProps>): GetHierarchyNodesProps {
  return {
    parentNode: undefined,
    hierarchyLevelSizeLimit: undefined,
    instanceFilter: undefined,
    ignoreCache: undefined,
    ...props,
  };
}

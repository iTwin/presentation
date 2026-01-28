/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator, throwingAsyncIterator } from "presentation-test-utilities";
import { firstValueFrom, Subject } from "rxjs";
import { HierarchyNode, HierarchyNodeKey } from "@itwin/presentation-hierarchies";
import { TreeActions } from "../../presentation-hierarchies-react/internal/TreeActions.js";
import { createNodeId } from "../../presentation-hierarchies-react/internal/Utils.js";
import {
  createStub,
  createTestChildrenLoadErrorInfo,
  createTestGroupingNode,
  createTestHierarchyNode,
  createTreeModel,
  getHierarchyNode,
  waitFor,
} from "../TestUtils.js";

import type { GenericInstanceFilter, GetHierarchyNodesProps, HierarchyProvider } from "@itwin/presentation-hierarchies";
import type { TreeModel } from "../../presentation-hierarchies-react/internal/TreeModel.js";

describe("TreeActions", () => {
  const provider = {
    getNodes: createStub<HierarchyProvider["getNodes"]>(),
  };
  const onModelChangedStub = createStub<(model: TreeModel) => void>();
  const onLoadStub = createStub<(type: "initial-load" | "hierarchy-level-load" | "reload", duration: number) => void>();
  const onHierarchyLoadErrorStub = createStub<(props: { parentId?: string; type: "timeout" | "unknown"; error: any }) => void>();

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
    provider.getNodes.reset();
    onModelChangedStub.reset();
    onLoadStub.reset();
    onHierarchyLoadErrorStub.reset();

    provider.getNodes.callsFake(() => {
      return createAsyncIterator([]);
    });
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
      provider.getNodes.callsFake(async function* () {
        yield await firstValueFrom(firstLoad);
      });

      const actions = createActions(model);

      actions.expandNode("root-1", true);

      await waitFor(() => {
        expect(onModelChangedStub).to.be.calledOnce;
        const newModel = onModelChangedStub.firstCall.args[0];
        expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.true;
        expect(getHierarchyNode(newModel, "root-1")?.children).to.be.true;
        expect(provider.getNodes).to.be.calledOnce;
      });
      onModelChangedStub.resetHistory();

      actions.reset();
      await waitFor(() => {
        expect(onModelChangedStub).to.be.calledOnce;
        const newModel = onModelChangedStub.firstCall.args[0];
        expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.false;
        expect(getHierarchyNode(newModel, "root-1")?.children).to.be.true;
      });
      onModelChangedStub.resetHistory();

      firstLoad.next(createTestHierarchyNode({ id: "child-1" }));
      firstLoad.complete();
      await waitFor(() => {
        expect(onModelChangedStub).to.not.be.called;
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
      provider.getNodes.callsFake(async function* () {
        yield await firstValueFrom(nodes);
      });

      const actions = createActions(model);

      actions.reloadTree();

      await waitFor(() => {
        expect(onModelChangedStub).to.be.calledOnce;
        const newModel = onModelChangedStub.firstCall.args[0];
        expect(newModel.rootNode.isLoading).to.be.true;
        expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      });

      onModelChangedStub.resetHistory();
      actions.reset();

      await waitFor(() => {
        expect(onModelChangedStub).to.be.calledOnce;
        const newModel = onModelChangedStub.firstCall.args[0];
        expect(newModel.rootNode.isLoading).to.be.false;
        expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      });

      nodes.next(createTestHierarchyNode({ id: "updated-root-1" }));
      nodes.complete();
      await waitFor(() => {
        expect(onModelChangedStub).to.be.calledOnce;
        const newModel = onModelChangedStub.firstCall.args[0];
        expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
        expect(getHierarchyNode(newModel, "updated-root-1")).to.be.undefined;
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

      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isSelected).to.be.true;
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

      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isSelected).to.be.false;
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

      expect(onModelChangedStub).to.not.be.called;
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

      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isExpanded).to.be.true;
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

      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isExpanded).to.be.false;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
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
        actions.expandNode("root-1", true).complete,
        actions.expandNode("root-2", true).complete,
        actions.expandNode("root-1", false).complete,
        actions.expandNode("root-1", true).complete,
      ]);

      expect(provider.getNodes).to.be.calledTwice;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, ignoreCache: false }));
      newModel = onModelChangedStub.secondCall.args[0];
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-2")?.nodeData, ignoreCache: false }));
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
      expect(onModelChangedStub).to.not.be.called;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        return createAsyncIterator(
          props.parentNode && HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })
            ? [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })]
            : [],
        );
      });

      const actions = createActions(model);

      await actions.expandNode("root-1", true).complete;

      expect(onModelChangedStub).to.be.calledTwice;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isExpanded).to.be.true;
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.true;
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, ignoreCache: false }));

      expect(onModelChangedStub).to.be.calledTwice;
      newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.false;
      expect(getHierarchyNode(newModel, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-2")).to.not.be.undefined;
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

      await actions.expandNode("grouping-node", true).complete;

      expect(provider.getNodes).to.be.calledWith(
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

      await actions.expandNode("grouping-node", true).complete;

      expect(provider.getNodes).to.be.calledWith(
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

      await actions.setHierarchyLimit("root-1", 100).complete;

      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.hierarchyLimit).to.be.eq(100);
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

      await actions.setHierarchyLimit("root-1", 100).complete;

      expect(onModelChangedStub).to.be.calledTwice;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.hierarchyLimit).to.be.eq(100);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.true;

      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(
          createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, hierarchyLevelSizeLimit: 100 }),
        );
      });

      expect(onModelChangedStub).to.be.calledTwice;
      newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.false;
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
      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.hierarchyLimit).to.be.eq(100);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.undefined;

      expect(provider.getNodes).to.not.be.called;
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

      await actions.setHierarchyLimit(undefined, 100).complete;

      expect(onModelChangedStub).to.be.calledTwice;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(newModel.rootNode.hierarchyLimit).to.be.eq(100);

      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: newModel.rootNode.nodeData, hierarchyLevelSizeLimit: 100 }));
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

      await actions.setInstanceFilter("root-1", filter).complete;

      () => expect(onModelChangedStub).to.be.calledTwice;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).to.be.eq(filter);
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        return createAsyncIterator(
          props.parentNode && HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-A" })
            ? [createTestHierarchyNode({ id: "child-B" })]
            : [],
        );
      });

      const actions = createActions(model);

      await actions.setInstanceFilter("root-A", filter).complete;

      expect(onModelChangedStub).to.be.calledTwice;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-A")?.instanceFilter).to.be.eq(filter);
      expect(getHierarchyNode(newModel, "root-A")?.isLoading).to.be.true;
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-A")?.nodeData, instanceFilter: filter }));
      expect(onModelChangedStub).to.be.calledTwice;
      newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-A")?.isLoading).to.be.false;
      expect(getHierarchyNode(newModel, "child-A")).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-B")).to.not.be.undefined;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        return createAsyncIterator(
          props.parentNode && HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })
            ? [createTestHierarchyNode({ id: "child-1" })]
            : [],
        );
      });

      const actions = createActions(model);

      await actions.setInstanceFilter("root-1", filter).complete;

      expect(onModelChangedStub).to.be.calledTwice;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).to.be.eq(filter);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.true;
      expect(provider.getNodes).to.be.calledOnce;
      expect(onModelChangedStub).to.be.calledTwice;
      newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.false;
      expect(getHierarchyNode(newModel, "child-1")).to.not.be.undefined;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-2" })] : []);
      });

      const actions = createActions(model);

      await actions.setInstanceFilter(undefined, filter).complete;

      expect(onModelChangedStub).to.be.calledTwice;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(newModel.rootNode.instanceFilter).to.be.eq(filter);
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: newModel.rootNode.nodeData, instanceFilter: filter }));
      expect(onModelChangedStub).to.be.calledTwice;
      newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
    });

    it("sets instance filter and sets node error to `NoFilterMatchingNodes`", async () => {
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

      await actions.setInstanceFilter("root-1", filter).complete;

      expect(onModelChangedStub).to.be.calledTwice;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")!.instanceFilter).to.be.eq(filter);
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, instanceFilter: filter }));
      expect(onModelChangedStub).to.be.calledTwice;
      newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
      expect(newModel.idToNode.get("root-1")!.error?.type).to.be.eq("NoFilterMatches");
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

      provider.getNodes.reset();

      const actions = createActions(model);

      actions.setInstanceFilter("invalid", filter);

      await waitFor(() => {
        expect(onModelChangedStub).to.not.be.called;
        expect(provider.getNodes).to.not.be.called;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
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
      await actions.reloadTree({ state: "keep" }).complete;

      expect(provider.getNodes).to.be.calledTwice; // once for root node, once for child node
      expect(onModelChangedStub).to.be.calledTwice;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
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
        actions.reloadTree({ state: "keep" }).complete,
        actions.reloadTree({ state: "discard" }).complete,
        actions.reloadTree({ state: "keep" }).complete,
      ]);

      expect(provider.getNodes).to.be.calledOnce; // state discarded loaded only root node
      expect(onModelChangedStub).to.be.calledTwice;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree(undefined).complete;

      expect(provider.getNodes).to.be.calledTwice;
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(model, "root-1")?.nodeData, ignoreCache: false }));
      // one call is made before reloading to set `rootNode.isLoading`
      expect(onModelChangedStub).to.be.calledTwice;

      const newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-2")).to.be.undefined;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree({ state: "keep" }).complete;

      expect(provider.getNodes).to.be.calledTwice;
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      expect(onModelChangedStub).to.be.calledTwice;

      const newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-2")).to.be.undefined;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1", autoExpand: true }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree(undefined).complete;

      expect(provider.getNodes).to.be.calledTwice;
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(model, "root-1")?.nodeData, ignoreCache: false }));
      // one call is made before reloading to set `rootNode.isLoading`
      expect(onModelChangedStub).to.be.calledTwice;

      const newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-2")).to.be.undefined;
    });

    it("handles expanded nodes with removed children", async () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          children: ["child-1"],
          isExpanded: true,
        },
        {
          id: "root-2",
          children: ["child-2"],
        },
      ]);

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);
      expect(getHierarchyNode(model, "root-1")?.isExpanded).to.be.true;

      await actions.reloadTree(undefined).complete;

      expect(provider.getNodes).to.be.calledTwice;
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      // one call is made before reloading to set `rootNode.isLoading`
      expect(onModelChangedStub).to.be.calledTwice;

      const newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-1")?.isExpanded).to.be.undefined;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1", autoExpand: true }), createTestHierarchyNode({ id: "root-2" })]);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree(undefined).complete;

      expect(provider.getNodes).to.be.calledOnce;
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      // one call is made before reloading to set `rootNode.isLoading`
      expect(onModelChangedStub).to.be.calledTwice;

      const newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-2")).to.be.undefined;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree(undefined).complete;

      expect(provider.getNodes).to.be.calledOnce;
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData, ignoreCache: false }));
      // one call is made before reloading to set `rootNode.isLoading`
      expect(onModelChangedStub).to.be.calledTwice;

      const newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-1")?.hierarchyLimit).to.be.eq(100);
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")?.instanceFilter).to.be.eq(instanceFilter);
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
          error: createTestChildrenLoadErrorInfo({ id: "info-node", message: "Info node" }),
        },
      ]);

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        if (props.parentNode !== undefined) {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      await actions.reloadTree({ parentNodeId: "root-1", state: "reset" }).complete;

      expect(provider.getNodes).to.be.calledOnce;
      expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(model, "root-1")?.nodeData, ignoreCache: true }));
      // one call is made before reloading to set `rootNode.isLoading` and remove sub tree
      expect(onModelChangedStub).to.be.calledTwice;

      const modelBeforeReload = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(modelBeforeReload, "root-1")).to.not.be.undefined;
      expect(modelBeforeReload.idToNode.get("info-node")).to.be.undefined;

      const newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-2")).to.not.be.undefined;
    });
  });

  describe("performance reporting", () => {
    it("reports initial load", async () => {
      const actions = createActions(createTreeModel([]));

      provider.getNodes.reset();
      provider.getNodes.callsFake(() => {
        return createAsyncIterator([createTestHierarchyNode({ id: "root-1" })]);
      });

      await actions.reloadTree().complete;

      expect(onModelChangedStub).to.be.called;
      expect(onLoadStub).to.be.calledWith("initial-load");
    });

    it("reports timeout on initial load", async () => {
      const actions = createActions(createTreeModel([]));

      provider.getNodes.reset();
      const error = new Error("query too long to execute or server is too busy");
      provider.getNodes.callsFake(() => {
        return throwingAsyncIterator(error);
      });

      await actions.reloadTree().complete;

      expect(onModelChangedStub).to.be.called;
      expect(onLoadStub).to.be.calledWith("initial-load", Number.MAX_SAFE_INTEGER);
      expect(onHierarchyLoadErrorStub).to.be.calledWith({ parentId: undefined, type: "timeout", error });
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        return createAsyncIterator(props.parentNode !== undefined ? [createTestHierarchyNode({ id: "child-1" })] : []);
      });

      actions.expandNode("root-1", true);

      await waitFor(() => {
        expect(onModelChangedStub).to.be.called;
        expect(onLoadStub).to.be.calledWith("hierarchy-level-load");
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

      provider.getNodes.reset();
      const error = new Error("query too long to execute or server is too busy");
      provider.getNodes.callsFake(() => {
        return throwingAsyncIterator(error);
      });

      actions.expandNode("root-1", true);

      await waitFor(() => {
        expect(onModelChangedStub).to.be.called;
        expect(onLoadStub).to.be.calledWith("hierarchy-level-load", Number.MAX_SAFE_INTEGER);
        expect(onHierarchyLoadErrorStub).to.be.calledWith({ parentId: "root-1", type: "timeout", error });
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-2" })] : []);
      });

      actions.reloadTree();

      await waitFor(() => {
        expect(onModelChangedStub).to.be.called;
        expect(onLoadStub).to.be.calledWith("reload");
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

      provider.getNodes.reset();
      const error = new Error("query too long to execute or server is too busy");
      provider.getNodes.callsFake(() => {
        return throwingAsyncIterator(error);
      });

      actions.reloadTree();

      await waitFor(() => {
        expect(onModelChangedStub).to.be.called;
        expect(onLoadStub).to.be.calledWith("reload", Number.MAX_SAFE_INTEGER);
        expect(onHierarchyLoadErrorStub).to.be.calledWith({ parentId: undefined, type: "timeout", error });
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

      actions.expandNode("root-1", true);

      await waitFor(() => {
        expect(onModelChangedStub).to.be.called;
        expect(onLoadStub).to.be.calledWith("hierarchy-level-load");
        expect(onHierarchyLoadErrorStub).to.not.be.called;
      });
    });

    it("does not report performance when unknown error occurs", async () => {
      const actions = createActions(createTreeModel([]));

      provider.getNodes.reset();
      const error = new Error("Test error");
      provider.getNodes.callsFake(() => {
        return throwingAsyncIterator(error);
      });

      actions.reloadTree();

      await waitFor(() => {
        expect(onModelChangedStub).to.be.called;
        expect(onLoadStub).to.not.be.called;
        expect(onHierarchyLoadErrorStub).to.be.calledWith({ parentId: undefined, type: "unknown", error });
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

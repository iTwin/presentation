/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
import { firstValueFrom, Subject } from "rxjs";
import { GenericInstanceFilter, GetHierarchyNodesProps, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { TreeActions } from "../../presentation-hierarchies-react/internal/TreeActions";
import { TreeModel } from "../../presentation-hierarchies-react/internal/TreeModel";
import { createStub, createTestGroupingNode, createTestHierarchyNode, createTreeModel, getHierarchyNode, waitFor } from "../TestUtils";

describe("TreeActions", () => {
  const provider = {
    getNodes: createStub<HierarchyProvider["getNodes"]>(),
  };
  const onModelChangedStub = createStub<(model: TreeModel) => void>();

  function createActions(seed: TreeModel) {
    const actions = new TreeActions(onModelChangedStub, seed);
    actions.setHierarchyProvider(provider as unknown as HierarchyProvider);
    return actions;
  }

  beforeEach(() => {
    provider.getNodes.reset();
    onModelChangedStub.reset();

    provider.getNodes.resolves([]);
  });

  describe("dispose", () => {
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
      });
      expect(provider.getNodes).to.be.calledOnce;
      onModelChangedStub.resetHistory();

      actions.dispose();
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
  });

  describe("selectNode", () => {
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

      actions.selectNode(["root-1"], "add");

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

      actions.selectNode(["root-1"], "remove");

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

      actions.selectNode(["root-1"], "add");

      expect(onModelChangedStub).to.not.be.called;
    });
  });

  describe("expandNode", () => {
    it("calls `onModelChanged` after node is expanded", () => {
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

    it("calls `onModelChanged` after node is collapsed", () => {
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
          props.parentNode?.key === "root-1" ? [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })] : [],
        );
      });

      const actions = createActions(model);

      actions.expandNode("root-1", true);

      expect(onModelChangedStub).to.be.calledOnce;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isExpanded).to.be.true;
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.true;

      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, ignoreCache: false }));
      });

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

      actions.expandNode("grouping-node", true);
      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(
          createGetNodesProps({ parentNode: getHierarchyNode(model, "grouping-node")?.nodeData, instanceFilter: filter, ignoreCache: false }),
        );
      });
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

      actions.expandNode("grouping-node", true);
      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(
          createGetNodesProps({ parentNode: getHierarchyNode(model, "grouping-node")?.nodeData, instanceFilter: filter, ignoreCache: false }),
        );
      });
    });
  });

  describe("setHierarchyLimit", () => {
    it("calls `onModelChanged` after setting hierarchy limit", () => {
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

      actions.setHierarchyLimit("root-1", 100);

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

      actions.setHierarchyLimit("root-1", 100);
      expect(onModelChangedStub).to.be.calledOnce;
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

      actions.setHierarchyLimit(undefined, 100);
      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(newModel.rootNode?.hierarchyLimit).to.be.eq(100);

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

    it("calls `onModelChanged` after setting hierarchy filter and removes subtree", () => {
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

      actions.setInstanceFilter("root-1", filter);

      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).to.be.eq(filter);
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
    });

    it("reloads tree after setting hierarchy filter node", async () => {
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

      provider.getNodes.reset();
      provider.getNodes.callsFake((props) => {
        return createAsyncIterator(props.parentNode?.key === "root-1" ? [createTestHierarchyNode({ id: "child-2" })] : []);
      });

      const actions = createActions(model);

      actions.setInstanceFilter("root-1", filter);
      expect(onModelChangedStub).to.be.calledOnce;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).to.be.eq(filter);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.true;

      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, instanceFilter: filter }));
      });

      expect(onModelChangedStub).to.be.calledTwice;
      newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.false;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-2")).to.not.be.undefined;
    });

    it("does not load children after setting hierarchy filter on collapsed node", async () => {
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
        return createAsyncIterator(props.parentNode?.key === "root-1" ? [createTestHierarchyNode({ id: "child-2" })] : []);
      });

      const actions = createActions(model);

      actions.setInstanceFilter("root-1", filter);
      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).to.be.eq(filter);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.undefined;

      await waitFor(() => {
        expect(provider.getNodes).to.not.be.called;
      });

      expect(onModelChangedStub).to.be.calledOnce;
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
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

      actions.setInstanceFilter(undefined, filter);
      expect(onModelChangedStub).to.be.calledOnce;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(newModel.rootNode?.instanceFilter).to.be.eq(filter);

      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: newModel.rootNode.nodeData, instanceFilter: filter }));
      });

      expect(onModelChangedStub).to.be.calledTwice;
      newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
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

      provider.getNodes.reset();
      provider.getNodes.callsFake(() => {
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      actions.setInstanceFilter("root-1", filter);
      expect(onModelChangedStub).to.be.calledOnce;
      let newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).to.be.eq(filter);

      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(newModel, "root-1")?.nodeData, instanceFilter: filter }));
      });

      expect(onModelChangedStub).to.be.calledTwice;
      newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
      expect(newModel.idToNode.get("root-1-no-filter-matches")).to.not.be.undefined;
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
      provider.getNodes.callsFake(() => {
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      actions.setInstanceFilter("invalid", filter);

      await waitFor(() => {
        expect(onModelChangedStub).to.not.be.called;
        expect(provider.getNodes).to.not.be.called;
      });
    });
  });

  describe("reloadTree", () => {
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
        if (props.parentNode.key === "root-1") {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      actions.reloadTree(undefined);

      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData }));
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(model, "root-1")?.nodeData }));
        // one call is made before reloading to set `rootNode.isLoading`
        expect(onModelChangedStub).to.be.calledTwice;
      });

      const newModel = onModelChangedStub.secondCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-2")).to.be.undefined;
    });

    it("does not reload expanded nodes if `discardState` = `true`", async () => {
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
        if (props.parentNode.key === "root-1") {
          return createAsyncIterator([createTestHierarchyNode({ id: "child-1-2" })]);
        }
        return createAsyncIterator([]);
      });

      const actions = createActions(model);

      actions.reloadTree({ discardState: true });

      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData }));
        expect(onModelChangedStub).to.be.calledOnce;
      });

      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(newModel, "child-1-2")).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-2")).to.be.undefined;
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

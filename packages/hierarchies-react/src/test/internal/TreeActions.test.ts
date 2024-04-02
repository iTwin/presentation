/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GenericInstanceFilter, GetHierarchyNodesProps, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { TreeActions } from "../../presentation-hierarchies-react/internal/TreeActions";
import { TreeModel } from "../../presentation-hierarchies-react/internal/TreeModel";
import { createStub, createTestGroupingNode, createTestHierarchyNode, createTreeModel, getHierarchyNode, waitFor } from "../TestUtils";

describe("TreeActions", () => {
  const provider = {
    getNodes: createStub<HierarchyProvider["getNodes"]>(),
  };
  const onModelChangedStub = createStub<(model: TreeModel) => void>();
  const onBeforeReloadStub = createStub<() => void>();

  function createActions(seed: TreeModel) {
    const actions = new TreeActions(onModelChangedStub, onBeforeReloadStub, seed);
    actions.setHierarchyProvider(provider as unknown as HierarchyProvider);
    return actions;
  }

  beforeEach(() => {
    provider.getNodes.reset();
    onModelChangedStub.reset();
    onBeforeReloadStub.reset();

    provider.getNodes.resolves([]);
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

      actions.selectNode("root-1", true);

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

      actions.selectNode("root-1", false);

      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.isSelected).to.be.false;
    });

    it("does not calls `onModelChanged` after selected node is selected", () => {
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

      actions.selectNode("root-1", true);

      expect(onModelChangedStub).to.not.be.calledOnce;
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
      provider.getNodes.callsFake(async (props) => {
        if (props.parentNode?.key === "root-1") {
          return [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];
        }
        return [];
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

    it("reloads reloadTree after setting hierarchy filter on expanded node", async () => {
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
      provider.getNodes.callsFake(async (props) => {
        if (props.parentNode?.key === "root-1") {
          return [createTestHierarchyNode({ id: "child-2" })];
        }
        return [];
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

    it("does not reload subtree after setting hierarchy filter on collapsed node", () => {
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

      actions.setInstanceFilter("root-1", filter);
      expect(onModelChangedStub).to.be.calledOnce;
      const newModel = onModelChangedStub.firstCall.args[0];
      expect(getHierarchyNode(newModel, "root-1")?.instanceFilter).to.be.eq(filter);
      expect(getHierarchyNode(newModel, "root-1")?.isLoading).to.be.undefined;
      expect(getHierarchyNode(newModel, "child-1")).to.be.undefined;

      expect(provider.getNodes).to.not.be.called;
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
      provider.getNodes.callsFake(async (props) => {
        if (props.parentNode === undefined) {
          return [createTestHierarchyNode({ id: "root-2" })];
        }
        return [];
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
      provider.getNodes.callsFake(async (props) => {
        if (props.parentNode === undefined) {
          return [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })];
        }
        if (props.parentNode.key === "root-1") {
          return [createTestHierarchyNode({ id: "child-1-2" })];
        }
        return [];
      });

      const actions = createActions(model);

      actions.reloadTree(undefined);

      await waitFor(() => {
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: model.rootNode.nodeData }));
        expect(provider.getNodes).to.be.calledWith(createGetNodesProps({ parentNode: getHierarchyNode(model, "root-1")?.nodeData }));
        expect(onModelChangedStub).to.be.calledOnce;
      });

      const newModel = onModelChangedStub.firstCall.args[0];
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
      provider.getNodes.callsFake(async (props) => {
        if (props.parentNode === undefined) {
          return [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })];
        }
        if (props.parentNode.key === "root-1") {
          return [createTestHierarchyNode({ id: "child-1-2" })];
        }
        return [];
      });

      const actions = createActions(model);

      actions.reloadTree(undefined, { discardState: true });

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

    it("does not reload tree when called with invalid node", async () => {
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
      provider.getNodes.callsFake(async (props) => {
        if (props.parentNode === undefined) {
          return [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })];
        }
        return [];
      });

      const actions = createActions(model);

      actions.reloadTree("invalid");

      await waitFor(() => {
        expect(provider.getNodes).to.not.be.called;
        expect(onModelChangedStub).to.not.be.called;
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

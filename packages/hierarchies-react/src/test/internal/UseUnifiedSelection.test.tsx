/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { describe } from "mocha";
import { collect, createAsyncIterator } from "presentation-test-utilities";
import { PropsWithChildren } from "react";
import sinon from "sinon";
import { InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createStorage, Selectables, StorageSelectionChangeEventArgs, StorageSelectionChangesListener } from "@itwin/unified-selection";
import { TreeModelNode } from "../../presentation-hierarchies-react/internal/TreeModel";
import { useUnifiedTreeSelection } from "../../presentation-hierarchies-react/internal/UseUnifiedSelection";
import { UnifiedSelectionProvider } from "../../presentation-hierarchies-react/UnifiedSelectionContext";
import { act, createStub, createTestGroupingNode, createTestHierarchyNode, createTreeModelNode, renderHook } from "../TestUtils";

describe("useUnifiesSelection", () => {
  const storage = createStorage();
  const imodelKey = "test-key";
  const source = "test-source";
  const getNode = sinon.stub<[string], TreeModelNode | undefined>();

  const initialProps = {
    imodelKey,
    sourceName: source,
    getNode,
  };

  function Wrapper(props: PropsWithChildren<{}>) {
    return <UnifiedSelectionProvider storage={storage}>{props.children}</UnifiedSelectionProvider>;
  }

  beforeEach(() => {
    storage.clearStorage({ imodelKey });
    getNode.reset();
  });

  describe("isNodeSelected", () => {
    it("always returns false if storage context is not provided", () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [instanceKey],
      };
      const hierarchyNode = createTestHierarchyNode({ id: "node-1", key: instancesNodesKey });
      const node = createTreeModelNode({ id: "node-1", nodeData: hierarchyNode });

      storage.addToSelection({
        imodelKey,
        source,
        selectables: [instanceKey],
      });

      getNode.callsFake((id) => (id === "node-1" ? node : undefined));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });
      expect(result.current.isNodeSelected("node-1")).to.be.false;
      expect(result.current.isNodeSelected("invalid")).to.be.false;
    });

    it("returns true if instance node is selected", () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [instanceKey],
      };
      const instanceKey2 = { id: "0x2", className: "Schema:Name" };
      const instancesNodesKey2: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [instanceKey2],
      };
      const nodes = [
        createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: instancesNodesKey }) }),
        createTreeModelNode({ id: "node-2", nodeData: createTestHierarchyNode({ id: "node-2", key: instancesNodesKey2 }) }),
      ];

      storage.addToSelection({
        imodelKey,
        source,
        selectables: [instanceKey],
      });

      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });
      expect(result.current.isNodeSelected("node-1")).to.be.true;
      expect(result.current.isNodeSelected("node-2")).to.be.false;
      expect(result.current.isNodeSelected("invalid")).to.be.false;
    });

    it("returns true if grouping node is selected", () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [instanceKey],
      };
      const instanceKey2 = { id: "0x2", className: "Schema:Name" };
      const nodes = [
        createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: instancesNodesKey }) }),
        createTreeModelNode({ id: "grouping-node", nodeData: createTestGroupingNode({ id: "grouping-node", groupedInstanceKeys: [instanceKey2] }) }),
      ];

      storage.addToSelection({
        imodelKey,
        source,
        selectables: [{ identifier: "grouping-node", loadInstanceKeys: () => createAsyncIterator([instanceKey2]), data: nodes[1] }],
      });

      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });
      expect(result.current.isNodeSelected("node-1")).to.be.false;
      expect(result.current.isNodeSelected("grouping-node")).to.be.true;
      expect(result.current.isNodeSelected("invalid")).to.be.false;
    });
  });

  describe("selectNodes", () => {
    const changeListener = createStub<StorageSelectionChangesListener>();

    beforeEach(() => {
      changeListener.reset();
      storage.selectionChangeEvent.addListener(changeListener);
    });

    afterEach(() => {
      storage.selectionChangeEvent.removeListener(changeListener);
    });

    it("does nothing if selection storage context is not provided", () => {
      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });
      act(() => {
        result.current.selectNodes(["node-1"], "add");
      });

      expect(getNode).to.not.be.called;
    });

    it("adds instance node to selection", () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [instanceKey],
      };
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: instancesNodesKey }) })];

      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNodes(["node-1"], "add");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "add" &&
            args.source === source &&
            args.imodelKey === imodelKey &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, instanceKey)
          );
        }),
      );

      act(() => {
        result.current.selectNodes(["invalid"], "add");
      });
      expect(changeListener).be.calledOnce;
    });

    it("adds grouping node to selection", async () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const groupingNode = createTestGroupingNode({ id: "grouping-node", groupedInstanceKeys: [instanceKey] });
      const nodes = [createTreeModelNode({ id: "grouping-node", nodeData: groupingNode })];

      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNodes(["grouping-node"], "add");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "add" && args.source === source && args.imodelKey === imodelKey && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("grouping-node");
      const keys = await collect(selectable!.loadInstanceKeys());
      expect(keys).to.have.members([instanceKey]);
      expect(selectable?.data).to.be.eq(groupingNode);

      act(() => {
        result.current.selectNodes(["invalid"], "add");
      });
      expect(changeListener).be.calledOnce;
    });

    it("adds custom node to selection", async () => {
      const hierarchyNode = createTestHierarchyNode({ id: "custom-node" });
      const nodes = [createTreeModelNode({ id: "custom-node", nodeData: hierarchyNode })];
      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNodes(["custom-node"], "add");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "add" && args.source === source && args.imodelKey === imodelKey && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("custom-node");
      const keys = await collect(selectable!.loadInstanceKeys());
      expect(keys).to.be.empty;
      expect(selectable?.data).to.be.eq(hierarchyNode);
    });

    it("removes instance node from selection", () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [instanceKey],
      };
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: instancesNodesKey }) })];
      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      storage.addToSelection({ imodelKey, source, selectables: [instanceKey] });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNodes(["node-1"], "remove");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "remove" &&
            args.source === source &&
            args.imodelKey === imodelKey &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, instanceKey)
          );
        }),
      );

      act(() => {
        result.current.selectNodes(["invalid"], "remove");
      });
      expect(changeListener).be.calledOnce;
    });

    it("removes grouping node from selection", async () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const groupingNode = createTestGroupingNode({ id: "grouping-node", groupedInstanceKeys: [instanceKey] });
      const nodes = [createTreeModelNode({ id: "grouping-node", nodeData: groupingNode })];
      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      storage.addToSelection({
        imodelKey,
        source,
        selectables: [{ identifier: "grouping-node", loadInstanceKeys: () => createAsyncIterator([instanceKey]), data: groupingNode }],
      });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNodes(["grouping-node"], "remove");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "remove" && args.source === source && args.imodelKey === imodelKey && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("grouping-node");
      const keys = await collect(selectable!.loadInstanceKeys());
      expect(keys).to.have.members([instanceKey]);
      expect(selectable?.data).to.be.eq(groupingNode);
    });

    it("removes custom node from selection", async () => {
      const hierarchyNode = createTestHierarchyNode({ id: "custom-node" });
      const nodes = [createTreeModelNode({ id: "custom-node", nodeData: hierarchyNode })];
      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      storage.addToSelection({
        imodelKey,
        source,
        selectables: [{ identifier: "custom-node", loadInstanceKeys: () => createAsyncIterator([]), data: hierarchyNode }],
      });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNodes(["custom-node"], "remove");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "remove" && args.source === source && args.imodelKey === imodelKey && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("custom-node");
      const keys = await collect(selectable!.loadInstanceKeys());
      expect(keys).to.be.empty;
      expect(selectable?.data).to.be.eq(hierarchyNode);
    });

    it("replaces selection with node", () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [instanceKey],
      };
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: instancesNodesKey }) })];

      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNodes(["node-1"], "replace");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "replace" &&
            args.source === source &&
            args.imodelKey === imodelKey &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, instanceKey)
          );
        }),
      );
    });
  });

  describe("selection change", () => {
    it("updates function references when selection changes", () => {
      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });
      const isSelected = result.current.isNodeSelected;
      const selectNodes = result.current.selectNodes;

      act(() => {
        storage.addToSelection({ imodelKey, source: "some-source", selectables: [{ id: "0x1", className: "Schema:Class" }] });
      });

      expect(isSelected).to.not.be.eq(result.current.isNodeSelected);
      expect(selectNodes).to.not.be.eq(result.current.selectNodes);
    });

    it("ignores changes on different iModels", () => {
      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });
      const isSelected = result.current.isNodeSelected;
      const selectNodes = result.current.selectNodes;

      act(() => {
        storage.addToSelection({ imodelKey: "other-imodel", source: "some-source", selectables: [{ id: "0x1", className: "Schema:Class" }] });
      });

      expect(isSelected).to.be.eq(result.current.isNodeSelected);
      expect(selectNodes).to.be.eq(result.current.selectNodes);
    });

    it("ignores changes on lower levels", () => {
      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });
      const isSelected = result.current.isNodeSelected;
      const selectNodes = result.current.selectNodes;

      act(() => {
        storage.addToSelection({ imodelKey, source: "some-source", selectables: [{ id: "0x1", className: "Schema:Class" }], level: 1 });
      });

      expect(isSelected).to.be.eq(result.current.isNodeSelected);
      expect(selectNodes).to.be.eq(result.current.selectNodes);
    });
  });
});

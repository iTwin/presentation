/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { describe } from "mocha";
import { PropsWithChildren } from "react";
import { act } from "react-dom/test-utils";
import sinon from "sinon";
import { InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createStorage, SelectableInstanceKey, Selectables, StorageSelectionChangeEventArgs, StorageSelectionChangesListener } from "@itwin/unified-selection";
import { TreeModelNode } from "../../presentation-hierarchies-react/internal/TreeModel";
import { useUnifiedTreeSelection } from "../../presentation-hierarchies-react/internal/UseUnifiedSelection";
import { UnifiedSelectionProvider } from "../../presentation-hierarchies-react/UnifiedSelectionContext";
import { createStub, createTestGroupingNode, createTestHierarchyNode, createTreeModelNode, renderHook } from "../TestUtils";

describe("useUnifiesSelection", () => {
  const storage = createStorage();
  const iModelKey = "test-key";
  const source = "test-source";
  const getNode = sinon.stub<[string], TreeModelNode | undefined>();

  const initialProps = {
    imodelKey: iModelKey,
    sourceName: source,
    getNode,
  };

  function Wrapper(props: PropsWithChildren<{}>) {
    return <UnifiedSelectionProvider storage={storage}>{props.children}</UnifiedSelectionProvider>;
  }

  beforeEach(() => {
    storage.clearStorage({ iModelKey });
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
        iModelKey,
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
        iModelKey,
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
        iModelKey,
        source,
        selectables: [{ identifier: "grouping-node", loadInstanceKeys: createIterator([instanceKey2]), data: nodes[1] }],
      });

      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });
      expect(result.current.isNodeSelected("node-1")).to.be.false;
      expect(result.current.isNodeSelected("grouping-node")).to.be.true;
      expect(result.current.isNodeSelected("invalid")).to.be.false;
    });
  });

  describe("selectNode", () => {
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
      result.current.selectNode("node-1", true);

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
        result.current.selectNode("node-1", true);
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "add" &&
            args.source === source &&
            args.iModelKey === iModelKey &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, instanceKey)
          );
        }),
      );

      act(() => {
        result.current.selectNode("invalid", true);
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
        result.current.selectNode("grouping-node", true);
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "add" && args.source === source && args.iModelKey === iModelKey && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("grouping-node");
      const keys = await collectKeys(selectable!.loadInstanceKeys());
      expect(keys).to.have.members([instanceKey]);
      expect(selectable?.data).to.be.eq(groupingNode);

      act(() => {
        result.current.selectNode("invalid", true);
      });
      expect(changeListener).be.calledOnce;
    });

    it("adds custom node to selection", async () => {
      const hierarchyNode = createTestHierarchyNode({ id: "custom-node" });
      const nodes = [createTreeModelNode({ id: "custom-node", nodeData: hierarchyNode })];
      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNode("custom-node", true);
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "add" && args.source === source && args.iModelKey === iModelKey && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("custom-node");
      const keys = await collectKeys(selectable!.loadInstanceKeys());
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

      storage.addToSelection({ iModelKey, source, selectables: [instanceKey] });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNode("node-1", false);
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "remove" &&
            args.source === source &&
            args.iModelKey === iModelKey &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, instanceKey)
          );
        }),
      );

      act(() => {
        result.current.selectNode("invalid", false);
      });
      expect(changeListener).be.calledOnce;
    });

    it("removes grouping node from selection", async () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const groupingNode = createTestGroupingNode({ id: "grouping-node", groupedInstanceKeys: [instanceKey] });
      const nodes = [createTreeModelNode({ id: "grouping-node", nodeData: groupingNode })];
      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      storage.addToSelection({
        iModelKey,
        source,
        selectables: [{ identifier: "grouping-node", loadInstanceKeys: createIterator([instanceKey]), data: groupingNode }],
      });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNode("grouping-node", false);
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "remove" && args.source === source && args.iModelKey === iModelKey && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("grouping-node");
      const keys = await collectKeys(selectable!.loadInstanceKeys());
      expect(keys).to.have.members([instanceKey]);
      expect(selectable?.data).to.be.eq(groupingNode);
    });

    it("removes custom node from selection", async () => {
      const hierarchyNode = createTestHierarchyNode({ id: "custom-node" });
      const nodes = [createTreeModelNode({ id: "custom-node", nodeData: hierarchyNode })];
      getNode.callsFake((id) => nodes.find((node) => node.id === id));

      storage.addToSelection({ iModelKey, source, selectables: [{ identifier: "custom-node", loadInstanceKeys: createIterator([]), data: hierarchyNode }] });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });

      act(() => {
        result.current.selectNode("custom-node", false);
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "remove" && args.source === source && args.iModelKey === iModelKey && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("custom-node");
      const keys = await collectKeys(selectable!.loadInstanceKeys());
      expect(keys).to.be.empty;
      expect(selectable?.data).to.be.eq(hierarchyNode);
    });
  });

  describe("selection change", () => {
    it("updates function references when selection changes", () => {
      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });
      const isSelected = result.current.isNodeSelected;
      const selectNode = result.current.selectNode;

      act(() => {
        storage.addToSelection({ iModelKey, source: "some-source", selectables: [{ id: "0x1", className: "Schema:Class" }] });
      });

      expect(isSelected).to.not.be.eq(result.current.isNodeSelected);
      expect(selectNode).to.not.be.eq(result.current.selectNode);
    });

    it("ignores changes on different iModels", () => {
      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });
      const isSelected = result.current.isNodeSelected;
      const selectNode = result.current.selectNode;

      act(() => {
        storage.addToSelection({ iModelKey: "other-imodel", source: "some-source", selectables: [{ id: "0x1", className: "Schema:Class" }] });
      });

      expect(isSelected).to.be.eq(result.current.isNodeSelected);
      expect(selectNode).to.be.eq(result.current.selectNode);
    });

    it("ignores changes on lower levels", () => {
      const { result } = renderHook(useUnifiedTreeSelection, { initialProps, wrapper: Wrapper });
      const isSelected = result.current.isNodeSelected;
      const selectNode = result.current.selectNode;

      act(() => {
        storage.addToSelection({ iModelKey, source: "some-source", selectables: [{ id: "0x1", className: "Schema:Class" }], level: 1 });
      });

      expect(isSelected).to.be.eq(result.current.isNodeSelected);
      expect(selectNode).to.be.eq(result.current.selectNode);
    });
  });
});

function createIterator(keys: SelectableInstanceKey[]): () => AsyncIterableIterator<SelectableInstanceKey> {
  return async function* () {
    for (const key of keys) {
      yield key;
    }
  };
}

async function collectKeys(iterator: AsyncIterableIterator<SelectableInstanceKey>) {
  const keys = [];
  for await (const key of iterator) {
    keys.push(key);
  }
  return keys;
}
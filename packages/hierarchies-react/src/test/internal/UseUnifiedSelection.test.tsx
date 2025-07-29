/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { describe } from "mocha";
import { collect, createAsyncIterator } from "presentation-test-utilities";
import { PropsWithChildren } from "react";
import sinon from "sinon";
import { GenericNodeKey, InstancesNodeKey, NonGroupingHierarchyNode } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";
import { createStorage, Selectables, SelectionStorage, StorageSelectionChangeEventArgs, StorageSelectionChangesListener } from "@itwin/unified-selection";
import { TreeModelNode } from "../../presentation-hierarchies-react/internal/TreeModel.js";
import { useUnifiedTreeSelection } from "../../presentation-hierarchies-react/internal/UseUnifiedSelection.js";
import { UnifiedSelectionProvider as UnifiedSelectionProviderDeprecated } from "../../presentation-hierarchies-react/UnifiedSelectionContext.js";
import { act, createStub, createTestGroupingNode, createTestHierarchyNode, createTreeModelNode, renderHook } from "../TestUtils.js";

describe("useUnifiedSelection", () => {
  let storage: SelectionStorage;
  const imodelKey = "test-key";
  const source = "test-source";
  const getTreeModelNode = sinon.stub<[string], TreeModelNode | undefined>();

  const initialProps = {
    sourceName: source,
    // note: will set the actual value in `beforeEach` below
    selectionStorage: undefined as unknown as SelectionStorage,
    getTreeModelNode,
  };

  beforeEach(() => {
    storage = createStorage();
    initialProps.selectionStorage = storage;
    getTreeModelNode.reset();
  });

  it("returns no-op handlers when unified selection storage is not provided", () => {
    // ensure tree model has a node, which represents a selected instance
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
    getTreeModelNode.callsFake((id) => (id === "node-1" ? node : undefined));

    // test
    const { selectionStorage: _, ...initialPropsWithoutStorage } = initialProps;
    const { result } = renderHook(useUnifiedTreeSelection, { initialProps: initialPropsWithoutStorage });
    act(() => {
      result.current.selectNodes(["node-1"], "add");
    });
    expect(getTreeModelNode).to.not.be.called;
    expect(result.current.isNodeSelected("node-1")).to.be.false;
  });

  it("uses deprecated unified selection context provider if selection storage is not provided directly", () => {
    const instanceKey1 = { id: "0x1", className: "Schema:Name", imodelKey };
    storage.replaceSelection({ imodelKey, source, selectables: [instanceKey1] });

    const storage2 = createStorage();
    const instanceKey2 = { id: "0x2", className: "Schema:Name", imodelKey };
    storage2.replaceSelection({ imodelKey, source, selectables: [instanceKey2] });

    getTreeModelNode.callsFake((id) => {
      switch (id) {
        case "node-1":
          return createTreeModelNode({
            id: "node-1",
            nodeData: createTestHierarchyNode({ id: "node-1", key: { type: "instances", instanceKeys: [instanceKey1] } }),
          });
        case "node-2":
          return createTreeModelNode({
            id: "node-2",
            nodeData: createTestHierarchyNode({ id: "node-2", key: { type: "instances", instanceKeys: [instanceKey2] } }),
          });
      }
      return undefined;
    });

    const { selectionStorage: _, ...initialPropsWithoutStorage } = initialProps;
    const { result } = renderHook(useUnifiedTreeSelection, {
      initialProps: initialPropsWithoutStorage,
      wrapper: (props: PropsWithChildren<{}>) => (
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        <UnifiedSelectionProviderDeprecated storage={storage2}>{props.children}</UnifiedSelectionProviderDeprecated>
      ),
    });
    expect(result.current.isNodeSelected("node-1")).to.be.false;
    expect(result.current.isNodeSelected("node-2")).to.be.true;
  });

  describe("isNodeSelected", () => {
    it("returns true if instance node is selected", () => {
      const selectedInstanceKey = { id: "0x1", className: "Schema:Name" };
      const selectedInstancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [{ ...selectedInstanceKey, imodelKey }],
      };
      const noIModelInstancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [{ id: "0x2", className: "Schema:Name" }],
      };
      const differentIModelInstancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [{ id: "0x3", className: "Schema:Name", imodelKey: "unknown-imodel" }],
      };
      const mergedInstancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [
          { ...selectedInstanceKey, imodelKey },
          { ...selectedInstanceKey, imodelKey: undefined },
          { ...selectedInstanceKey, imodelKey: "unknown-imodel" },
        ],
      };
      const nodes = [
        createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: selectedInstancesNodesKey }) }),
        createTreeModelNode({ id: "node-2", nodeData: createTestHierarchyNode({ id: "node-2", key: noIModelInstancesNodesKey }) }),
        createTreeModelNode({ id: "node-3", nodeData: createTestHierarchyNode({ id: "node-3", key: differentIModelInstancesNodesKey }) }),
        createTreeModelNode({ id: "node-4", nodeData: createTestHierarchyNode({ id: "node-4", key: mergedInstancesNodesKey }) }),
      ];

      storage.addToSelection({
        imodelKey,
        source,
        selectables: [selectedInstanceKey],
      });

      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });
      expect(result.current.isNodeSelected("node-1")).to.be.true;
      expect(result.current.isNodeSelected("node-2")).to.be.false;
      expect(result.current.isNodeSelected("node-3")).to.be.false;
      expect(result.current.isNodeSelected("node-4")).to.be.true;
      expect(result.current.isNodeSelected("invalid")).to.be.false;
    });

    it("returns true if grouping node is selected", () => {
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [{ id: "0x1", className: "Schema:Name" }],
      };
      const selectedInstanceKey = { id: "0x2", className: "Schema:Name" };
      const nodes = [
        createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: instancesNodesKey }) }),
        createTreeModelNode({
          id: "grouping-node",
          nodeData: createTestGroupingNode({ id: "grouping-node", groupedInstanceKeys: [{ ...selectedInstanceKey, imodelKey }] }),
        }),
      ];

      storage.addToSelection({
        imodelKey,
        source,
        selectables: [{ identifier: "grouping-node", loadInstanceKeys: () => createAsyncIterator([selectedInstanceKey]), data: nodes[1] }],
      });

      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });
      expect(result.current.isNodeSelected("node-1")).to.be.false;
      expect(result.current.isNodeSelected("grouping-node")).to.be.true;
      expect(result.current.isNodeSelected("invalid")).to.be.false;
    });

    it("returns true if generic node is selected with default `createSelectableForGenericNode` handler", () => {
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [{ id: "0x1", className: "Schema:Name" }],
      };
      const genericNodeKey: GenericNodeKey = {
        type: "generic",
        id: "generic-node",
      };
      const instancesNode = createTestHierarchyNode({ id: "instances-node", key: instancesNodesKey });
      const genericNode = createTestHierarchyNode({ id: genericNodeKey.id, key: genericNodeKey });

      const modelNodes = [
        createTreeModelNode({ id: "node-1", nodeData: instancesNode }),
        createTreeModelNode({ id: "node-2", nodeData: genericNode }),
        createTreeModelNode({ id: "node-3", nodeData: genericNode }),
      ];
      getTreeModelNode.callsFake((id) => modelNodes.find((modelNode) => modelNode.id === id));

      storage.addToSelection({
        imodelKey: "",
        source,
        selectables: [{ identifier: "node-2", loadInstanceKeys: () => createAsyncIterator([]), data: genericNode }],
      });

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });
      expect(result.current.isNodeSelected("node-1")).to.be.false;
      expect(result.current.isNodeSelected("node-2")).to.be.true;
      expect(result.current.isNodeSelected("node-3")).to.be.false;
      expect(result.current.isNodeSelected("invalid")).to.be.false;
    });

    it("returns true if generic node is selected with custom `createSelectableForGenericNode` handler", () => {
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [{ id: "0x1", className: "Schema:Name" }],
      };
      const genericNodeKey: GenericNodeKey = {
        type: "generic",
        id: "generic-node",
      };
      const instancesNode = createTestHierarchyNode({ id: "instances-node", key: instancesNodesKey });
      const genericNode = createTestHierarchyNode({ id: genericNodeKey.id, key: genericNodeKey }) as NonGroupingHierarchyNode & { key: GenericNodeKey };

      const modelNodes = [
        createTreeModelNode({ id: "node-1", nodeData: instancesNode }),
        createTreeModelNode({ id: "node-2", nodeData: genericNode }),
        createTreeModelNode({ id: "node-3", nodeData: genericNode }),
      ];
      getTreeModelNode.callsFake((id) => modelNodes.find((modelNode) => modelNode.id === id));

      const createSelectableForGenericNode: NonNullable<Props<typeof useUnifiedTreeSelection>["createSelectableForGenericNode"]> = (node) => ({
        identifier: node.key.id,
        loadInstanceKeys: () => createAsyncIterator([]),
        data: node,
      });

      storage.addToSelection({
        imodelKey: "",
        source,
        selectables: [createSelectableForGenericNode(genericNode, "node-2")],
      });

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps: { ...initialProps, createSelectableForGenericNode } });
      expect(result.current.isNodeSelected("node-1")).to.be.false;
      expect(result.current.isNodeSelected("node-2")).to.be.true;
      expect(result.current.isNodeSelected("node-3")).to.be.true;
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

    it("adds instance node to selection", () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [
          { ...instanceKey, imodelKey },
          { ...instanceKey, imodelKey: "another-imodel" },
        ],
      };
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: instancesNodesKey }) })];

      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });

      act(() => {
        result.current.selectNodes(["node-1"], "add");
      });
      expect(changeListener).to.be.calledTwice;
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
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "add" &&
            args.source === source &&
            args.imodelKey === "another-imodel" &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, instanceKey)
          );
        }),
      );

      changeListener.resetHistory();
      act(() => {
        result.current.selectNodes(["invalid"], "add");
      });
      expect(changeListener).to.not.be.called;
    });

    it("adds grouping node to selection", async () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const groupingNode = createTestGroupingNode({
        id: "grouping-node",
        groupedInstanceKeys: [
          { ...instanceKey, imodelKey },
          { ...instanceKey, imodelKey: "another-imodel" },
        ],
      });
      const nodes = [createTreeModelNode({ id: "grouping-node", nodeData: groupingNode })];

      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });

      act(() => {
        result.current.selectNodes(["grouping-node"], "add");
      });
      expect(changeListener).to.be.calledTwice;
      async function validateChangeInvocation(call: ReturnType<typeof changeListener.getCall>, callIModelKey: string) {
        expect(call).be.calledWith(
          sinon.match((args: StorageSelectionChangeEventArgs) => {
            return args.changeType === "add" && args.source === source && args.imodelKey === callIModelKey && Selectables.size(args.selectables) === 1;
          }),
        );
        const selectable = call.args[0].selectables.custom.get("grouping-node");
        const keys = await collect(selectable!.loadInstanceKeys());
        expect(keys).to.have.lengthOf(1).and.containSubset([instanceKey]);
        expect(selectable?.data).to.be.eq(groupingNode);
      }
      await validateChangeInvocation(changeListener.firstCall, imodelKey);
      await validateChangeInvocation(changeListener.secondCall, "another-imodel");

      changeListener.resetHistory();
      act(() => {
        result.current.selectNodes(["invalid"], "add");
      });
      expect(changeListener).to.not.be.called;
    });

    it("adds generic node to selection with default `createSelectableForGenericNode` handler", async () => {
      const hierarchyNode = createTestHierarchyNode({ id: "generic-node" });
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: hierarchyNode }), createTreeModelNode({ id: "node-2", nodeData: hierarchyNode })];
      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });

      act(() => {
        result.current.selectNodes(["node-2"], "add");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "add" && args.source === source && args.imodelKey === "" && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("node-2");
      const keys = await collect(selectable!.loadInstanceKeys());
      expect(keys).to.be.empty;
      expect(selectable!.data).to.eq(hierarchyNode);
    });

    it("adds generic node to selection with custom `createSelectableForGenericNode` handler", async () => {
      const hierarchyNode = createTestHierarchyNode({ id: "generic-node" });
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: hierarchyNode }), createTreeModelNode({ id: "node-2", nodeData: hierarchyNode })];
      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      const createSelectableForGenericNode: NonNullable<Props<typeof useUnifiedTreeSelection>["createSelectableForGenericNode"]> = (node) => ({
        identifier: node.key.id,
        loadInstanceKeys: () => createAsyncIterator([]),
        data: node,
      });

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps: { ...initialProps, createSelectableForGenericNode } });

      act(() => {
        result.current.selectNodes(["node-2"], "add");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "add" && args.source === source && args.imodelKey === "" && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("generic-node");
      const keys = await collect(selectable!.loadInstanceKeys());
      expect(keys).to.be.empty;
      expect(selectable!.data).to.eq(hierarchyNode);
    });

    it("removes instance node from selection", () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [
          { ...instanceKey, imodelKey },
          { ...instanceKey, imodelKey: "another-imodel" },
        ],
      };
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: instancesNodesKey }) })];
      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      instancesNodesKey.instanceKeys.forEach((k) => {
        storage.addToSelection({ imodelKey: k.imodelKey ?? "", source, selectables: [k] });
      });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });

      act(() => {
        result.current.selectNodes(["node-1"], "remove");
      });
      expect(changeListener).to.be.calledTwice;
      expect(changeListener.firstCall).be.calledWith(
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
      expect(changeListener.secondCall).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "remove" &&
            args.source === source &&
            args.imodelKey === "another-imodel" &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, instanceKey)
          );
        }),
      );

      changeListener.resetHistory();
      act(() => {
        result.current.selectNodes(["invalid"], "remove");
      });
      expect(changeListener).to.not.be.called;
    });

    it("removes grouping node from selection", async () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const groupingNode = createTestGroupingNode({
        id: "grouping-node",
        groupedInstanceKeys: [
          { ...instanceKey, imodelKey },
          { ...instanceKey, imodelKey: "another-imodel" },
        ],
      });
      const nodes = [createTreeModelNode({ id: "grouping-node", nodeData: groupingNode })];
      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      groupingNode.groupedInstanceKeys.forEach((key) => {
        storage.addToSelection({
          imodelKey: key.imodelKey ?? "",
          source,
          selectables: [{ identifier: "grouping-node", loadInstanceKeys: () => createAsyncIterator([]), data: groupingNode }],
        });
      });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });

      act(() => {
        result.current.selectNodes(["grouping-node"], "remove");
      });
      expect(changeListener).to.be.calledTwice;
      async function validateChangeInvocation(call: ReturnType<typeof changeListener.getCall>, callIModelKey: string) {
        expect(call).be.calledWith(
          sinon.match((args: StorageSelectionChangeEventArgs) => {
            return args.changeType === "remove" && args.source === source && args.imodelKey === callIModelKey && Selectables.size(args.selectables) === 1;
          }),
        );
        const selectable = call.args[0].selectables.custom.get("grouping-node");
        const keys = await collect(selectable!.loadInstanceKeys());
        expect(keys).to.have.lengthOf(1).and.containSubset([instanceKey]);
        expect(selectable?.data).to.be.eq(groupingNode);
      }
      await validateChangeInvocation(changeListener.firstCall, imodelKey);
      await validateChangeInvocation(changeListener.secondCall, "another-imodel");
    });

    it("removes generic node from selection with default `createSelectableForGenericNode` handler", async () => {
      const hierarchyNode = createTestHierarchyNode({ id: "generic-node" });
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: hierarchyNode }), createTreeModelNode({ id: "node-2", nodeData: hierarchyNode })];
      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      storage.addToSelection({
        imodelKey: "",
        source,
        selectables: [{ identifier: "node-2", loadInstanceKeys: () => createAsyncIterator([]), data: hierarchyNode }],
      });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });

      act(() => {
        result.current.selectNodes(["node-2"], "remove");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "remove" && args.source === source && args.imodelKey === "" && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("node-2");
      const keys = await collect(selectable!.loadInstanceKeys());
      expect(keys).to.be.empty;
      expect(selectable!.data).to.eq(hierarchyNode);
    });

    it("removes generic node from selection with custom `createSelectableForGenericNode` handler", async () => {
      const hierarchyNode = createTestHierarchyNode({ id: "generic-node" }) as NonGroupingHierarchyNode & { key: GenericNodeKey };
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: hierarchyNode }), createTreeModelNode({ id: "node-2", nodeData: hierarchyNode })];
      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      const createSelectableForGenericNode: NonNullable<Props<typeof useUnifiedTreeSelection>["createSelectableForGenericNode"]> = (node) => ({
        identifier: node.key.id,
        loadInstanceKeys: () => createAsyncIterator([]),
        data: node,
      });

      storage.addToSelection({
        imodelKey: "",
        source,
        selectables: [createSelectableForGenericNode(hierarchyNode, "node-2")],
      });
      changeListener.reset();

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps: { ...initialProps, createSelectableForGenericNode } });

      act(() => {
        result.current.selectNodes(["node-2"], "remove");
      });
      expect(changeListener).to.be.calledOnce;
      expect(changeListener).be.calledWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return args.changeType === "remove" && args.source === source && args.imodelKey === "" && Selectables.size(args.selectables) === 1;
        }),
      );
      const selectable = changeListener.firstCall.args[0].selectables.custom.get("generic-node");
      const keys = await collect(selectable!.loadInstanceKeys());
      expect(keys).to.be.empty;
      expect(selectable!.data).to.eq(hierarchyNode);
    });

    it("replaces selection with node", () => {
      const instanceKey = { id: "0x1", className: "Schema:Name" };
      const instancesNodesKey: InstancesNodeKey = {
        type: "instances",
        instanceKeys: [{ ...instanceKey, imodelKey }],
      };
      const nodes = [createTreeModelNode({ id: "node-1", nodeData: createTestHierarchyNode({ id: "node-1", key: instancesNodesKey }) })];

      getTreeModelNode.callsFake((id) => nodes.find((node) => node.id === id));

      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });

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
      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });
      const isSelected = result.current.isNodeSelected;
      const selectNodes = result.current.selectNodes;

      act(() => {
        storage.addToSelection({ imodelKey, source: "some-source", selectables: [{ id: "0x1", className: "Schema:Class" }] });
      });

      expect(isSelected).to.not.be.eq(result.current.isNodeSelected);
      expect(selectNodes).to.not.be.eq(result.current.selectNodes);
    });

    it("ignores changes on lower levels", () => {
      const { result } = renderHook(useUnifiedTreeSelection, { initialProps });
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

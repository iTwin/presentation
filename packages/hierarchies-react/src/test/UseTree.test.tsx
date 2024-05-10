/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator, throwingAsyncIterator } from "presentation-test-utilities";
import { PropsWithChildren } from "react";
import { act } from "react-dom/test-utils";
import sinon from "sinon";
import { GenericInstanceFilter, HierarchyNodeKey, HierarchyProvider, InstancesNodeKey, RowsLimitExceededError } from "@itwin/presentation-hierarchies";
import { createStorage, Selectables, StorageSelectionChangeEventArgs, StorageSelectionChangesListener } from "@itwin/unified-selection";
import { PresentationHierarchyNode, PresentationInfoNode, UnifiedSelectionProvider } from "../presentation-hierarchies-react";
import { createNodeId } from "../presentation-hierarchies-react/internal/Utils";
import { useTree, useUnifiedSelectionTree } from "../presentation-hierarchies-react/UseTree";
import { cleanup, createStub, createTestGroupingNode, createTestHierarchyNode, renderHook, waitFor } from "./TestUtils";

describe("useTree", () => {
  const hierarchyProvider = {
    getNodes: createStub<HierarchyProvider["getNodes"]>(),
  };

  const initialProps = {
    hierarchyProvider: hierarchyProvider as unknown as HierarchyProvider,
  };

  beforeEach(() => {
    hierarchyProvider.getNodes.reset();
  });

  it("loads root nodes", async () => {
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })] : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(2);
    });
  });

  it("expands node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode.key === "root-1") {
        return createAsyncIterator(childNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.be.true;
    });

    act(() => {
      result.current.expandNode("root-1", true);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
    });
  });

  it("selects node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected("root-1")).to.be.false;
    });

    act(() => {
      result.current.selectNode(["root-1"], "add");
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected("root-1")).to.be.true;
    });
  });

  it("sets hierarchy limit", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.hierarchyLevelSizeLimit === undefined) {
        return throwingAsyncIterator(new RowsLimitExceededError(1));
      }
      if (props.parentNode === undefined && props.hierarchyLevelSizeLimit === 50) {
        return createAsyncIterator(rootNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationInfoNode).type).to.be.eq("ResultSetTooLarge");
    });

    act(() => {
      result.current.setHierarchyLevelLimit(undefined, 50);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(2);
    });
  });

  it("applies and removes instance filter on tree root", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(props.instanceFilter === undefined ? rootNodes : rootNodes.slice(0, 1));
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(2);
    });

    const filter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };

    act(() => {
      result.current.setHierarchyLevelFilter(undefined, filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    act(() => {
      result.current.setHierarchyLevelFilter(undefined, undefined);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(2);
    });
  });

  it("applies and removes instance filter", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", autoExpand: true, supportsFiltering: true, children: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode.key === "root-1") {
        return createAsyncIterator(props.instanceFilter === undefined ? childNodes : childNodes.slice(0, 1));
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });

    const filter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };

    act(() => {
      result.current.setHierarchyLevelFilter("root-1", filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
    });

    act(() => {
      result.current.setHierarchyLevelFilter("root-1", undefined);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });
  });

  it("applies instance filter on grouping node parent", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", autoExpand: true, children: true, supportsFiltering: true })];
    const groupingNode = createTestGroupingNode({
      id: "grouping-node",
      key: { type: "class-grouping", className: "Schema:Class" },
      nonGroupingAncestor: rootNodes[0],
      autoExpand: true,
    });
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode.key === "root-1") {
        return createAsyncIterator([groupingNode]);
      }
      if (HierarchyNodeKey.isClassGrouping(props.parentNode.key)) {
        return createAsyncIterator(props.instanceFilter ? childNodes.slice(0, 1) : childNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
      const groupingTreeNode = (result.current.rootNodes![0] as any).children[0] as PresentationHierarchyNode;
      expect(groupingTreeNode.children).to.have.lengthOf(2);
    });

    const filter: GenericInstanceFilter = { propertyClassNames: [], relatedInstances: [], rules: { operator: "and", rules: [] } };

    act(() => {
      result.current.setHierarchyLevelFilter("root-1", filter);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
      const groupingTreeNode = (result.current.rootNodes![0] as any).children[0] as PresentationHierarchyNode;
      expect(groupingTreeNode.children).to.have.lengthOf(1);
    });
  });

  it("`getHierarchyLevelConfiguration` returns undefined for invalid node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    const filterOptions = result.current.getHierarchyLevelConfiguration("invalid");
    expect(filterOptions).to.be.undefined;
  });

  it("`getHierarchyLevelConfiguration` returns undefined for grouping node", async () => {
    const rootNodes = [createTestGroupingNode({ id: "grouping-node", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "grouped-node-1" }), createTestHierarchyNode({ id: "grouped-node-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode !== undefined) {
        return createAsyncIterator(childNodes);
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });
    const nodeId = createNodeId(rootNodes[0]);

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });

    const filterOptions = result.current.getHierarchyLevelConfiguration(nodeId);
    expect(filterOptions).to.be.undefined;
  });

  it("`getHierarchyLevelConfiguration` returns options for hierarchy node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? rootNodes : []);
    });
    const { result } = renderHook(useTree, { initialProps });
    const nodeId = createNodeId(rootNodes[0]);

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    const filterOptions = result.current.getHierarchyLevelConfiguration(nodeId);
    expect(filterOptions).to.not.be.undefined;
    expect(filterOptions?.hierarchyNode).to.be.eq(rootNodes[0]);
  });

  it("reloads tree when `reloadTree` is called", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode !== undefined) {
        return createAsyncIterator(childNodes.slice(0, 1));
      }
      return createAsyncIterator([]);
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
    });

    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode !== undefined) {
        return createAsyncIterator(childNodes);
      }
      return createAsyncIterator([]);
    });

    act(() => {
      result.current.reloadTree();
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });
  });

  it("reloads tree when hierarchy provider changes", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode !== undefined) {
        return createAsyncIterator(childNodes);
      }
      return createAsyncIterator([]);
    });
    const { rerender, result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });

    const newProvider = {
      getNodes: createStub<HierarchyProvider["getNodes"]>(),
    };
    newProvider.getNodes.callsFake((props) => {
      if (props.parentNode === undefined) {
        return createAsyncIterator(rootNodes);
      }
      if (props.parentNode !== undefined) {
        return createAsyncIterator(childNodes.slice(0, 1));
      }
      return createAsyncIterator([]);
    });

    rerender({ hierarchyProvider: newProvider as unknown as HierarchyProvider });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
    });
  });
});

describe("useUnifiedSelectionTree", () => {
  const storage = createStorage();
  const imodelKey = "test-key";
  const sourceName = "test-source";
  const changeListener = createStub<StorageSelectionChangesListener>();

  const hierarchyProvider = {
    getNodes: createStub<HierarchyProvider["getNodes"]>(),
  };

  const initialProps = {
    hierarchyProvider: hierarchyProvider as unknown as HierarchyProvider,
    imodelKey,
    sourceName,
  };

  function Wrapper(props: PropsWithChildren<{}>) {
    return <UnifiedSelectionProvider storage={storage}>{props.children}</UnifiedSelectionProvider>;
  }

  function createNodeKey(id: string) {
    const instanceKey = { id, className: "Schema:Class" };
    const instancesNodeKey: InstancesNodeKey = {
      type: "instances",
      instanceKeys: [instanceKey],
    };
    return { instanceKey, instancesNodeKey };
  }

  function createHierarchyNodeWithKey(id: string, name: string, children = false) {
    const { instanceKey, instancesNodeKey } = createNodeKey(id);
    const node = createTestHierarchyNode({ id: name, key: instancesNodeKey, autoExpand: true, children });
    const nodeId = createNodeId(node);
    return { nodeId, instanceKey, instancesNodeKey, node };
  }

  beforeEach(() => {
    hierarchyProvider.getNodes.reset();
    changeListener.reset();
    storage.selectionChangeEvent.addListener(changeListener);
  });

  afterEach(() => {
    cleanup();
    storage.selectionChangeEvent.removeListener(changeListener);
    storage.clearStorage({ imodelKey });
  });

  it("adds nodes to unified selection", async () => {
    const { nodeId: nodeId, instanceKey: instanceKey, node: node } = createHierarchyNodeWithKey("0x1", "root-1");
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps, wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected(nodeId)).to.be.false;
    });

    act(() => {
      result.current.selectNode([nodeId], "add");
    });

    await waitFor(() => {
      expect(changeListener).to.be.calledOnceWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "add" &&
            args.imodelKey === imodelKey &&
            args.source === sourceName &&
            Selectables.size(args.selectables) === 1 &&
            Selectables.has(args.selectables, instanceKey)
          );
        }),
      );

      expect(result.current.isNodeSelected(nodeId)).to.be.true;
    });
  });

  it("reacts to unified selection changes", async () => {
    const { nodeId: nodeId, instanceKey: instanceKey, node: node } = createHierarchyNodeWithKey("0x1", "root-1");
    hierarchyProvider.getNodes.callsFake((props) => {
      return createAsyncIterator(props.parentNode === undefined ? [node] : []);
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps, wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected(nodeId)).to.be.false;
    });

    act(() => {
      storage.addToSelection({ imodelKey, source: sourceName, selectables: [instanceKey] });
    });

    await waitFor(() => {
      expect(result.current.isNodeSelected(nodeId)).to.be.true;
    });
  });
});

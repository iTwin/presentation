/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
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
    hierarchyProvider.getNodes.callsFake(async (props) => {
      return props.parentNode === undefined ? [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })] : [];
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(2);
    });
  });

  it("expands node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" })];

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      if (props.parentNode.key === "root-1") {
        return childNodes;
      }
      return [];
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

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      return [];
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected("root-1")).to.be.false;
    });

    act(() => {
      result.current.selectNode("root-1", true);
    });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected("root-1")).to.be.true;
    });
  });

  it("sets hierarchy limit", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.hierarchyLevelSizeLimit === undefined) {
        throw new RowsLimitExceededError(1);
      }
      if (props.parentNode === undefined && props.hierarchyLevelSizeLimit === 50) {
        return rootNodes;
      }
      return [];
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

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return props.instanceFilter === undefined ? rootNodes : rootNodes.slice(0, 1);
      }
      return [];
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

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      if (props.parentNode.key === "root-1") {
        return props.instanceFilter === undefined ? childNodes : childNodes.slice(0, 1);
      }
      return [];
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

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      if (props.parentNode.key === "root-1") {
        return [groupingNode];
      }
      if (HierarchyNodeKey.isClassGrouping(props.parentNode.key)) {
        return props.instanceFilter ? childNodes.slice(0, 1) : childNodes;
      }
      return [];
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

  it("`getHierarchyLevelFilteringOptions` returns undefined for invalid node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      return [];
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    const filterOptions = result.current.getHierarchyLevelFilteringOptions("invalid");
    expect(filterOptions).to.be.undefined;
  });

  it("`getHierarchyLevelFilteringOptions` returns undefined for grouping node", async () => {
    const rootNodes = [createTestGroupingNode({ id: "grouping-node", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "grouped-node-1" }), createTestHierarchyNode({ id: "grouped-node-1" })];

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      if (props.parentNode !== undefined) {
        return childNodes;
      }
      return [];
    });
    const { result } = renderHook(useTree, { initialProps });
    const nodeId = createNodeId(rootNodes[0]);

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });

    const filterOptions = result.current.getHierarchyLevelFilteringOptions(nodeId);
    expect(filterOptions).to.be.undefined;
  });

  it("`getHierarchyLevelFilteringOptions` returns options for hierarchy node", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1" })];

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      return [];
    });
    const { result } = renderHook(useTree, { initialProps });
    const nodeId = createNodeId(rootNodes[0]);

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
    });

    const filterOptions = result.current.getHierarchyLevelFilteringOptions(nodeId);
    expect(filterOptions).to.not.be.undefined;
    expect(filterOptions?.hierarchyNode).to.be.eq(rootNodes[0]);
  });

  it("reloads tree when `reloadTree` is called", async () => {
    const rootNodes = [createTestHierarchyNode({ id: "root-1", children: true, autoExpand: true })];
    const childNodes = [createTestHierarchyNode({ id: "child-1" }), createTestHierarchyNode({ id: "child-2" })];

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      if (props.parentNode !== undefined) {
        return childNodes.slice(0, 1);
      }
      return [];
    });
    const { result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(1);
    });

    hierarchyProvider.getNodes.reset();
    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      if (props.parentNode !== undefined) {
        return childNodes;
      }
      return [];
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

    hierarchyProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      if (props.parentNode !== undefined) {
        return childNodes;
      }
      return [];
    });
    const { rerender, result } = renderHook(useTree, { initialProps });

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect((result.current.rootNodes![0] as PresentationHierarchyNode).children).to.have.lengthOf(2);
    });

    const newProvider = {
      getNodes: createStub<HierarchyProvider["getNodes"]>(),
    };
    newProvider.getNodes.callsFake(async (props) => {
      if (props.parentNode === undefined) {
        return rootNodes;
      }
      if (props.parentNode !== undefined) {
        return childNodes.slice(0, 1);
      }
      return [];
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

  beforeEach(() => {
    hierarchyProvider.getNodes.reset();
    changeListener.reset();
    storage.selectionChangeEvent.addListener(changeListener);
  });

  afterEach(() => {
    cleanup();
    storage.selectionChangeEvent.removeListener(changeListener);
    storage.clearStorage({ iModelKey: imodelKey });
  });

  it("adds nodes to unified selection", async () => {
    const instanceKey = { id: "0x1", className: "Schema:Class" };
    const instancesNodeKey: InstancesNodeKey = {
      type: "instances",
      instanceKeys: [instanceKey],
    };
    const nodes = [createTestHierarchyNode({ id: "root-1", key: instancesNodeKey })];
    hierarchyProvider.getNodes.callsFake(async (props) => {
      return props.parentNode === undefined ? nodes : [];
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps, wrapper: Wrapper });
    const nodeId = createNodeId(nodes[0]);

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected(nodeId)).to.be.false;
    });

    act(() => {
      result.current.selectNode(nodeId, true);
    });

    await waitFor(() => {
      expect(changeListener).to.be.calledOnceWith(
        sinon.match((args: StorageSelectionChangeEventArgs) => {
          return (
            args.changeType === "add" &&
            args.iModelKey === imodelKey &&
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
    const instanceKey = { id: "0x1", className: "Schema:Class" };
    const instancesNodeKey: InstancesNodeKey = {
      type: "instances",
      instanceKeys: [instanceKey],
    };
    const nodes = [createTestHierarchyNode({ id: "root-1", key: instancesNodeKey })];
    hierarchyProvider.getNodes.callsFake(async (props) => {
      return props.parentNode === undefined ? nodes : [];
    });

    const { result } = renderHook(useUnifiedSelectionTree, { initialProps, wrapper: Wrapper });
    const nodeId = createNodeId(nodes[0]);

    await waitFor(() => {
      expect(result.current.rootNodes).to.have.lengthOf(1);
      expect(result.current.isNodeSelected(nodeId)).to.be.false;
    });

    act(() => {
      storage.addToSelection({ iModelKey: imodelKey, source: sourceName, selectables: [instanceKey] });
    });

    await waitFor(() => {
      expect(result.current.isNodeSelected(nodeId)).to.be.true;
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Observable } from "rxjs/internal/Observable";
import * as sinon from "sinon";
import * as moq from "typemoq";
import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { DelayLoadedTreeNodeItem, MutableTreeModel, RenderedItemsRange, TreeModelNodeInput, TreeModelSource, UiComponents } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { reloadTree } from "../../../presentation-components/tree/controlled/TreeReloader";
import { IPresentationTreeDataProvider } from "../../../presentation-components/tree/IPresentationTreeDataProvider";

describe("reloadTree", () => {
  let dataProvider: IPresentationTreeDataProvider;

  before(async () => {
    await UiComponents.initialize(new EmptyLocalization());
  });

  after(() => {
    UiComponents.terminate();
  });

  beforeEach(() => {
    dataProvider = {
      imodel: moq.Mock.ofType<IModelConnection>().object,
      rulesetId: "",
      getNodeKey: () => ({ type: "", version: 0, pathFromRoot: [] }),
      getFilteredNodePaths: async () => [],
      getNodesCount: async () => 3,
      getNodes: async (parent, page) => [createDelayLoadedTreeNodeItem(`${parent?.id ?? "root"}-${page?.start ?? 0}`)],
      dispose: () => {},
    };
  });

  it("loads first root node page", async () => {
    const initialTreeModel = new MutableTreeModel();

    const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1));
    const treeModel = modelSource.getModel();

    const rootNodes = treeModel.getChildren(undefined)!;
    expect(rootNodes.getLength()).to.be.equal(3);
    expect(rootNodes.get(0)).to.be.equal("root-0");
    expect(rootNodes.get(1)).to.be.undefined;
    expect(rootNodes.get(2)).to.be.undefined;
  });

  it("loads first page in expanded nodes", async () => {
    const initialTreeModel = new MutableTreeModel();
    initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0"), createTreeModelNodeInput("root-1"), createTreeModelNodeInput("root-2")], 0);
    initialTreeModel.setChildren("root-0", [createTreeModelNodeInput("root-0-0"), createTreeModelNodeInput("root-0-1")], 0);
    initialTreeModel.getNode("root-0")!.isExpanded = true;

    const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1));
    const treeModel = modelSource.getModel();

    const rootNodes = treeModel.getChildren(undefined)!;
    expect(rootNodes.getLength()).to.be.equal(3);
    expect(rootNodes.get(0)).to.be.equal("root-0");
    expect(rootNodes.get(1)).to.be.undefined;
    expect(rootNodes.get(2)).to.be.undefined;

    expect(treeModel.getNode("root-0")!.isExpanded).to.be.true;
    const childNodes = treeModel.getChildren("root-0")!;
    expect(childNodes.getLength()).to.be.equal(3);
    expect(childNodes.get(0)).to.be.equal("root-0-0");
    expect(childNodes.get(1)).to.be.undefined;
    expect(childNodes.get(2)).to.be.undefined;
  });

  it("looks for an expanded node at its original place", async () => {
    const initialTreeModel = new MutableTreeModel();
    initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0"), createTreeModelNodeInput("root-1"), createTreeModelNodeInput("root-2")], 0);
    initialTreeModel.setChildren("root-1", [createTreeModelNodeInput("root-1-0"), createTreeModelNodeInput("root-1-1")], 0);
    initialTreeModel.getNode("root-1")!.isExpanded = true;

    const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1));
    const treeModel = modelSource.getModel();

    const rootNodes = treeModel.getChildren(undefined)!;
    expect(rootNodes.getLength()).to.be.equal(3);
    expect(rootNodes.get(0)).to.be.equal("root-0");
    expect(rootNodes.get(1)).to.be.equal("root-1");
    expect(rootNodes.get(2)).to.be.undefined;

    expect(treeModel.getNode("root-1")!.isExpanded).to.be.true;
    const childNodes = treeModel.getChildren("root-1")!;
    expect(childNodes.getLength()).to.be.equal(3);
    expect(childNodes.get(0)).to.be.equal("root-1-0");
    expect(childNodes.get(1)).to.be.undefined;
    expect(childNodes.get(2)).to.be.undefined;
  });

  it("looks for an expanded node a page before its original position", async () => {
    // Simulating root-1 node moving from second to first index after the update
    const initialTreeModel = new MutableTreeModel();
    initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0")], 0);
    initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-1")], 2);
    initialTreeModel.setChildren("root-1", [createTreeModelNodeInput("root-1-0"), createTreeModelNodeInput("root-1-1")], 0);
    initialTreeModel.getNode("root-1")!.isExpanded = true;

    const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1));
    const treeModel = modelSource.getModel();

    const rootNodes = treeModel.getChildren(undefined)!;
    expect(rootNodes.getLength()).to.be.equal(3);
    expect(rootNodes.get(0)).to.be.equal("root-0");
    expect(rootNodes.get(1)).to.be.equal("root-1");
    expect(rootNodes.get(2)).to.be.equal("root-2");

    expect(treeModel.getNode("root-1")!.isExpanded).to.be.true;
    const childNodes = treeModel.getChildren("root-1")!;
    expect(childNodes.getLength()).to.be.equal(3);
    expect(childNodes.get(0)).to.be.equal("root-1-0");
    expect(childNodes.get(1)).to.be.undefined;
    expect(childNodes.get(2)).to.be.undefined;
  });

  it("looks for an expanded node a page after its original position", async () => {
    // Simulating root-2 node moving from frist to second index after the update
    const initialTreeModel = new MutableTreeModel();
    initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0"), createTreeModelNodeInput("root-2")], 0);
    initialTreeModel.getNode("root-2")!.isExpanded = true;

    const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1));
    const treeModel = modelSource.getModel();

    const rootNodes = treeModel.getChildren(undefined)!;
    expect(rootNodes.getLength()).to.be.equal(3);
    expect(rootNodes.get(0)).to.be.equal("root-0");
    expect(rootNodes.get(1)).to.be.equal("root-1");
    expect(rootNodes.get(2)).to.be.equal("root-2");

    expect(treeModel.getNode("root-2")!.isExpanded).to.be.true;
    const childNodes = treeModel.getChildren("root-2")!;
    expect(childNodes.getLength()).to.be.equal(3);
    expect(childNodes.get(0)).to.be.equal("root-2-0");
    expect(childNodes.get(1)).to.be.undefined;
    expect(childNodes.get(2)).to.be.undefined;
  });

  it("handles not being able to find the expanded node", async () => {
    // Simulating root-3 node being replaced with root-1 node
    const initialTreeModel = new MutableTreeModel();
    initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0"), createTreeModelNodeInput("root-3"), createTreeModelNodeInput("root-2")], 0);
    initialTreeModel.setChildren("root-3", [createTreeModelNodeInput("root-3-0"), createTreeModelNodeInput("root-3-1")], 0);
    initialTreeModel.getNode("root-3")!.isExpanded = true;

    const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1));
    const treeModel = modelSource.getModel();

    const rootNodes = treeModel.getChildren(undefined)!;
    expect(rootNodes.getLength()).to.be.equal(3);
    expect(rootNodes.get(0)).to.be.equal("root-0");
    expect(rootNodes.get(1)).to.be.equal("root-1");
    expect(rootNodes.get(2)).to.be.equal("root-2");

    expect(treeModel.getNode("root-1")!.isExpanded).to.be.false;
    expect(treeModel.getChildren("root-1")).to.be.undefined;
  });

  it("handles failure to retrieve parent node's child count", async () => {
    // Simulate receiving `undefined` child count on root-0
    dataProvider.getNodesCount = async (parent) => (parent === undefined ? 3 : (undefined as any));

    const initialTreeModel = new MutableTreeModel();
    initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0"), createTreeModelNodeInput("root-1"), createTreeModelNodeInput("root-2")], 0);
    initialTreeModel.setChildren("root-0", [createTreeModelNodeInput("root-0-0")], 0);
    initialTreeModel.setChildren("root-0-0", [createTreeModelNodeInput("root-0-0-0")], 0);
    initialTreeModel.getNode("root-0")!.isExpanded = true;
    initialTreeModel.getNode("root-0-0")!.isExpanded = true;

    const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1));
    const treeModel = modelSource.getModel();

    const rootNodes = treeModel.getChildren(undefined)!;
    expect(rootNodes.getLength()).to.be.equal(3);
    expect(rootNodes.get(0)).to.be.equal("root-0");
    expect(rootNodes.get(1)).to.be.undefined;
    expect(rootNodes.get(2)).to.be.undefined;

    expect(treeModel.getNode("root-0")!.numChildren).to.be.undefined;
    expect(treeModel.getNode("root-0")!.isExpanded).to.be.false;
  });

  it("does not search for expanded nodes if parent no longer has any children", async () => {
    const getNodesFake = sinon.fake(async () => [
      {
        ...createTreeModelNodeInput("root-0"),
        item: { ...createDelayLoadedTreeNodeItem("root-0"), hasChildren: false },
      },
    ]);
    dataProvider.getNodes = getNodesFake;
    dataProvider.getNodesCount = async () => 1;

    const initialTreeModel = new MutableTreeModel();
    initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0")], 0);
    initialTreeModel.getNode("root-0")!.isExpanded = true;
    initialTreeModel.setChildren("root-0", [createTreeModelNodeInput("root-0-0")], 0);
    initialTreeModel.getNode("root-0-0")!.isExpanded = true;

    const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1));
    const treeModel = modelSource.getModel();

    expect(getNodesFake).to.have.been.calledOnce;

    const rootNodes = treeModel.getChildren(undefined)!;
    expect(rootNodes.getLength()).to.be.equal(1);
    expect(rootNodes.get(0)).to.be.equal("root-0");

    expect(treeModel.getNode("root-0")!.isExpanded).to.be.false;
  });

  describe("visible range", () => {
    const itemsRange: RenderedItemsRange = { visibleStartIndex: 0, visibleStopIndex: 0, overscanStartIndex: 0, overscanStopIndex: 0 };

    it("reload nodes in visible range", async () => {
      const initialTreeModel = new MutableTreeModel();
      initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0"), createTreeModelNodeInput("root-1"), createTreeModelNodeInput("root-2")], 0);

      // simulate that "root-2" are visible
      const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1, { ...itemsRange, visibleStartIndex: 2, visibleStopIndex: 2 }));
      const treeModel = modelSource.getModel();

      const rootNodes = treeModel.getChildren(undefined)!;
      expect(rootNodes.getLength()).to.be.equal(3);
      expect(rootNodes.get(0)).to.be.equal("root-0");
      expect(rootNodes.get(1)).to.be.undefined;
      expect(rootNodes.get(2)).to.be.equal("root-2");
    });

    it("adjusts visible range when reloading nodes", async () => {
      const initialTreeModel = new MutableTreeModel();
      initialTreeModel.setChildren(
        undefined,
        [createTreeModelNodeInput("root-0"), createTreeModelNodeInput("root-1"), createTreeModelNodeInput("root-2"), createTreeModelNodeInput("root-3")],
        0,
      );

      // simulate that "root-3" is visible
      const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1, { ...itemsRange, visibleStartIndex: 3, visibleStopIndex: 3 }));
      const treeModel = modelSource.getModel();

      // expect visible range to be adjusted and one last node to be loaded
      const rootNodes = treeModel.getChildren(undefined)!;
      expect(rootNodes.getLength()).to.be.equal(3);
      expect(rootNodes.get(0)).to.be.equal("root-0");
      expect(rootNodes.get(1)).to.be.undefined;
      expect(rootNodes.get(2)).to.be.equal("root-2");
    });

    it("reloads child nodes in visible range", async () => {
      const initialTreeModel = new MutableTreeModel();
      initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0"), createTreeModelNodeInput("root-1"), createTreeModelNodeInput("root-2")], 0);
      initialTreeModel.setChildren(
        "root-1",
        [createTreeModelNodeInput("root-1-0"), createTreeModelNodeInput("root-1-1"), createTreeModelNodeInput("root-1-2")],
        0,
      );
      initialTreeModel.getNode("root-1")!.isExpanded = true;

      // simulate visible range:
      // - root-0
      // - root-1
      //   - root-1-0
      //   - root-1-1
      const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1, { ...itemsRange, visibleStartIndex: 0, visibleStopIndex: 3 }));
      const treeModel = modelSource.getModel();

      const rootNodes = treeModel.getChildren(undefined)!;
      expect(rootNodes.getLength()).to.be.equal(3);
      expect(rootNodes.get(0)).to.be.equal("root-0");
      expect(rootNodes.get(1)).to.be.equal("root-1");
      expect(rootNodes.get(2)).to.undefined;

      const childNodes = treeModel.getChildren("root-1")!;
      expect(childNodes.getLength()).to.be.equal(3);
      expect(childNodes.get(0)).to.be.equal("root-1-0");
      expect(childNodes.get(1)).to.be.equal("root-1-1");
      expect(childNodes.get(2)).to.undefined;
    });

    it("handles reload resulting in empty tree", async () => {
      dataProvider.getNodes = async () => [];
      dataProvider.getNodesCount = async () => 0;

      const initialTreeModel = new MutableTreeModel();
      initialTreeModel.setChildren(undefined, [createTreeModelNodeInput("root-0"), createTreeModelNodeInput("root-1"), createTreeModelNodeInput("root-2")], 0);

      // simulate visible range:
      // - root-0
      // - root-1
      // - root-2
      const modelSource = await waitForReload(reloadTree(initialTreeModel, dataProvider, 1, { ...itemsRange, visibleStartIndex: 0, visibleStopIndex: 2 }));
      const treeModel = modelSource.getModel();

      const rootNodes = treeModel.getChildren(undefined)!;
      expect(rootNodes.getLength()).to.be.equal(0);
    });
  });

  function createTreeModelNodeInput(id: string): TreeModelNodeInput {
    return {
      id,
      isExpanded: false,
      isLoading: false,
      isSelected: false,
      item: createDelayLoadedTreeNodeItem(id),
      label: createPropertyRecord(id),
    };
  }

  function createDelayLoadedTreeNodeItem(id: string): DelayLoadedTreeNodeItem {
    return { id, label: createPropertyRecord(id), hasChildren: true };
  }

  function createPropertyRecord(value: string): PropertyRecord {
    return new PropertyRecord({ valueFormat: PropertyValueFormat.Primitive, value }, { name: value, typename: value, displayLabel: value });
  }

  async function waitForReload(observable: Observable<TreeModelSource>): Promise<TreeModelSource> {
    return new Promise((resolve, reject) => {
      let numEmissions = 0;
      let lastEmission: TreeModelSource | undefined;
      observable.subscribe({
        next: (modelSource) => {
          ++numEmissions;
          lastEmission = modelSource;
        },
        error: reject,
        complete: () => {
          expect(numEmissions).to.be.equal(1);
          resolve(lastEmission!);
        },
      });
    });
  }
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { expect } from "chai";
import sinon from "sinon";
import { PageOptions } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { InstanceFilterDefinition, LabelDefinition, NodePathElement } from "@itwin/presentation-common";
import { Presentation, PresentationManager, RulesetVariablesManager } from "@itwin/presentation-frontend";
import { PresentationTreeDataProvider } from "../../presentation-components/tree/DataProvider.js";
import { FilteredPresentationTreeDataProvider } from "../../presentation-components/tree/FilteredDataProvider.js";
import { IPresentationTreeDataProvider } from "../../presentation-components/tree/IPresentationTreeDataProvider.js";
import { createTreeNodeItem } from "../../presentation-components/tree/Utils.js";
import { createTestECInstanceKey } from "../_helpers/Common.js";
import { createTestECInstancesNode, createTestECInstancesNodeKey, createTestNodePathElement } from "../_helpers/Hierarchy.js";
import { createStub } from "../TestUtils.js";

describe("FilteredTreeDataProvider", () => {
  function createTestNodePathElementWithId(id: string) {
    return createTestNodePathElement({
      node: createTestECInstancesNode({
        key: createTestECInstancesNodeKey({
          instanceKeys: [createTestECInstanceKey({ id })],
          pathFromRoot: [id],
        }),
      }),
    });
  }

  function createPaths() {
    /*
    A-1
      A-1-1
    A-2
      A-2-1
      A-2-2
        A-2-2-1
    */
    const nodePaths: NodePathElement[] = [];

    nodePaths[0] = createTestNodePathElementWithId("0x1");
    nodePaths[0].node.label = LabelDefinition.fromLabelString("A-1");

    nodePaths[1] = createTestNodePathElementWithId("0x2");
    nodePaths[1].node.label = LabelDefinition.fromLabelString("A-2");

    nodePaths[0].children = [];
    nodePaths[0].children[0] = createTestNodePathElementWithId("0x3");
    nodePaths[0].children[0].node.label = LabelDefinition.fromLabelString("A-1-1");

    nodePaths[1].children = [];
    nodePaths[1].children[0] = createTestNodePathElementWithId("0x4");
    nodePaths[1].children[0].node.label = LabelDefinition.fromLabelString("A-2-1");

    nodePaths[1].children[1] = createTestNodePathElementWithId("0x5");
    nodePaths[1].children[1].node.label = LabelDefinition.fromLabelString("A-2-2");

    nodePaths[1].children[1].children = [];
    nodePaths[1].children[1].children[0] = createTestNodePathElementWithId("0x6");
    nodePaths[1].children[1].children[0].node.label = LabelDefinition.fromLabelString("A-2-2-1");
    return nodePaths;
  }

  let provider: FilteredPresentationTreeDataProvider;
  let filter: string;
  let paths: NodePathElement[];
  const rulesetId = "test_ruleset_id";
  const imodel = {} as IModelConnection;
  const parentProvider = {
    imodel,
    rulesetId,
    getFilteredNodePaths: createStub<IPresentationTreeDataProvider["getFilteredNodePaths"]>(),
    createRequestOptions: createStub<IPresentationTreeDataProvider["createRequestOptions"]>(),
  };
  const pageOptions: PageOptions = { size: 0, start: 0 };

  beforeEach(() => {
    const onVariableChanged = new BeEvent();
    const presentationManager = sinon.createStubInstance(PresentationManager);
    presentationManager.vars.returns({
      onVariableChanged,
    } as RulesetVariablesManager);
    sinon.stub(Presentation, "presentation").get(() => presentationManager);

    filter = "test_filter";
    paths = createPaths();
    provider = new FilteredPresentationTreeDataProvider({
      parentDataProvider: parentProvider as unknown as IPresentationTreeDataProvider,
      filter,
      paths,
    });
  });

  afterEach(() => {
    parentProvider.getFilteredNodePaths.reset();
    parentProvider.createRequestOptions.reset();
    sinon.restore();
  });

  describe("filter", () => {
    it("returns filter with which it was initialized", () => {
      expect(provider.filter).to.be.equal(filter);
    });
  });

  describe("rulesetId", () => {
    it("returns rulesetId of the parent data provider", () => {
      expect(provider.rulesetId).to.eq(rulesetId);
    });
  });

  describe("imodel", () => {
    it("returns imodel of the parent data provider", () => {
      expect(provider.imodel).to.eq(imodel);
    });
  });

  describe("parentDataProvider", () => {
    it("returns parent data provider", () => {
      expect(provider.parentDataProvider).to.eq(parentProvider);
    });
  });

  describe("getNodes", () => {
    it("returns root nodes", async () => {
      const result = await provider.getNodes(undefined, pageOptions);
      expect(result).to.matchSnapshot();
    });

    it("returns child nodes", async () => {
      const parentNode = createTreeNodeItem(paths[1].node);

      const result = await provider.getNodes(parentNode, pageOptions);
      expect(result).to.matchSnapshot();
    });

    it("applies same node customizations as parent data provider", async () => {
      const customizeStub = sinon.stub();
      const newParentProvider = new PresentationTreeDataProvider({
        imodel,
        ruleset: "test-rules",
        customizeTreeNodeItem: customizeStub,
      });
      const testPaths = [createTestNodePathElement()];
      const filteredProvider = new FilteredPresentationTreeDataProvider({
        parentDataProvider: newParentProvider,
        filter: "Test",
        paths: testPaths,
      });
      await filteredProvider.getNodes(undefined, pageOptions);
      expect(customizeStub).to.be.calledOnce;
    });
  });

  describe("getNodesCount", () => {
    it("returns root nodes count", async () => {
      const result = await provider.getNodesCount();
      expect(result).to.equal(paths.length);
    });

    it("returns child nodes count", async () => {
      const parentNode = createTreeNodeItem(paths[1].node);

      const result = await provider.getNodesCount(parentNode);
      expect(result).to.equal(paths[1].children.length);
    });
  });

  describe("getFilteredNodePaths", () => {
    it("calls parent data provider", async () => {
      parentProvider.getFilteredNodePaths.resolves(paths);

      const result = await provider.getFilteredNodePaths(filter);
      expect(result).to.equal(paths);
      expect(parentProvider.getFilteredNodePaths).to.be.calledWith(filter);
    });
  });

  describe("createRequestOptions", () => {
    it("calls parent data provider", () => {
      const key = createTestECInstancesNodeKey();
      const filterDefinition = {} as InstanceFilterDefinition;

      parentProvider.createRequestOptions.returns({ rulesetOrId: "test_ruleset", imodel: {} as IModelConnection });
      const result = provider.createRequestOptions(key, filterDefinition);
      expect(result.rulesetOrId).to.be.equal("test_ruleset");
      expect(parentProvider.createRequestOptions).to.be.calledWith(key, filterDefinition);
    });
  });

  const constantFilter = "test";
  const filteredNodePaths: NodePathElement[] = [];

  filteredNodePaths[0] = createTestNodePathElementWithId("0x1");
  filteredNodePaths[0].node.label = LabelDefinition.fromLabelString("A-1");
  filteredNodePaths[0].filteringData = { matchesCount: 0, childMatchesCount: 1 };

  filteredNodePaths[0].children = [];
  filteredNodePaths[0].children[0] = createTestNodePathElementWithId("0x2");
  filteredNodePaths[0].children[0].node.label = LabelDefinition.fromLabelString("A-1-1 test");
  filteredNodePaths[0].children[0].filteringData = { matchesCount: 1, childMatchesCount: 0 };

  filteredNodePaths[1] = createTestNodePathElementWithId("0x3");
  filteredNodePaths[1].node.label = LabelDefinition.fromLabelString("A-2 test");
  filteredNodePaths[1].filteringData = { matchesCount: 1, childMatchesCount: 0 };

  filteredNodePaths[1].children = [];
  filteredNodePaths[1].children[0] = createTestNodePathElementWithId("0x4");
  filteredNodePaths[1].children[0].node.label = LabelDefinition.fromLabelString("A-2-1");
  filteredNodePaths[1].children[0].filteringData = { matchesCount: 0, childMatchesCount: 0 };

  filteredNodePaths[1].children[1] = createTestNodePathElementWithId("0x5");
  filteredNodePaths[1].children[1].node.label = LabelDefinition.fromLabelString("A-2-2");
  filteredNodePaths[1].children[1].filteringData = { matchesCount: 0, childMatchesCount: 0 };

  describe("countFilteringResults", () => {
    it("all matches get counted", () => {
      expect(provider.countFilteringResults(filteredNodePaths)).to.be.eq(2);
    });

    it("doesn't count if node paths don't have filtering data", () => {
      paths = [];
      paths[0] = createTestNodePathElement();
      paths[0].node.label = LabelDefinition.fromLabelString("A-1");
      paths[0].filteringData = undefined;
      expect(provider.countFilteringResults(paths)).to.eq(0);
    });
  });

  describe("getActiveMatch", () => {
    it("returns correct match", () => {
      provider = new FilteredPresentationTreeDataProvider({
        parentDataProvider: parentProvider as unknown as IPresentationTreeDataProvider,
        filter: constantFilter,
        paths: filteredNodePaths,
      });
      const result = provider.getActiveMatch(2);

      expect(result).to.not.be.undefined;
      expect(result!.nodeId).to.be.eq(createTreeNodeItem(filteredNodePaths[1].node).id);
      expect(result!.matchIndex).to.be.eq(0);
    });

    it("returns undefined when index is 0 or lower", () => {
      provider = new FilteredPresentationTreeDataProvider({
        parentDataProvider: parentProvider as unknown as IPresentationTreeDataProvider,
        filter: constantFilter,
        paths: filteredNodePaths,
      });
      const result = provider.getActiveMatch(0);
      expect(result).to.be.undefined;
    });
  });

  describe("nodeMatchesFilter", () => {
    it("returns true when node matches filter", () => {
      provider = new FilteredPresentationTreeDataProvider({
        parentDataProvider: parentProvider as unknown as IPresentationTreeDataProvider,
        filter: constantFilter,
        paths: filteredNodePaths,
      });
      const node = createTreeNodeItem(filteredNodePaths[1].node);
      expect(provider.nodeMatchesFilter(node)).to.be.true;
    });

    it("returns false when node matches filter", () => {
      provider = new FilteredPresentationTreeDataProvider({
        parentDataProvider: parentProvider as unknown as IPresentationTreeDataProvider,
        filter: constantFilter,
        paths: filteredNodePaths,
      });
      const node = createTreeNodeItem(filteredNodePaths[0].node);
      expect(provider.nodeMatchesFilter(node)).to.be.false;
    });
  });
});

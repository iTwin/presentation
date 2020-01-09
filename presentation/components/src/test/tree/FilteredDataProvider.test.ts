/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* tslint:disable:no-direct-imports */

import { expect } from "chai";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import * as faker from "faker";
import { createRandomTreeNodeItem } from "../_helpers/UiComponents";
import { createRandomECInstanceNodeKey, createRandomNodePathElement } from "@bentley/presentation-common/lib/test/_helpers/random";
import { NodePathElement } from "@bentley/presentation-common";
import { PageOptions } from "@bentley/ui-components";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { FilteredPresentationTreeDataProvider } from "../../tree/FilteredDataProvider";
import { IPresentationTreeDataProvider } from "../../tree/IPresentationTreeDataProvider";
import { createTreeNodeItem } from "../../tree/Utils";

describe("FilteredTreeDataProvider", () => {

  /*
  A-1
    A-1-1
  A-2
    A-2-1
    A-2-2
      A-2-2-1
  */
  const nodePaths: NodePathElement[] = [];

  nodePaths[0] = createRandomNodePathElement();
  nodePaths[0].node.label = "A-1";

  nodePaths[1] = createRandomNodePathElement();
  nodePaths[1].node.label = "A-2";

  nodePaths[0].children = [];
  nodePaths[0].children[0] = createRandomNodePathElement();
  nodePaths[0].children[0].node.label = "A-1-1";

  nodePaths[1].children = [];
  nodePaths[1].children[0] = createRandomNodePathElement();
  nodePaths[1].children[0].node.label = "A-2-1";

  nodePaths[1].children[1] = createRandomNodePathElement();
  nodePaths[1].children[1].node.label = "A-2-2";

  nodePaths[1].children[1].children = [];
  nodePaths[1].children[1].children[0] = createRandomNodePathElement();
  nodePaths[1].children[1].children[0].node.label = "A-2-2-1";

  let provider: FilteredPresentationTreeDataProvider;
  let filter: string;
  const parentProviderMock = moq.Mock.ofType<IPresentationTreeDataProvider>();
  const imodelMock = moq.Mock.ofType<IModelConnection>();
  const pageOptions: PageOptions = { size: 0, start: 0 };

  beforeEach(() => {
    parentProviderMock.reset();
    filter = faker.random.word();
    provider = new FilteredPresentationTreeDataProvider(parentProviderMock.object, filter, nodePaths);
  });

  describe("filter", () => {

    it("returns filter with which it was initialized", () => {
      expect(provider.filter).to.be.equal(filter);
    });

  });

  describe("rulesetId", () => {

    it("returns rulesetId of the parent data provider", () => {
      const expectedRulesetId = faker.random.word();
      parentProviderMock.setup((x) => x.rulesetId)
        .returns(() => expectedRulesetId)
        .verifiable();
      expect(provider.rulesetId).to.eq(expectedRulesetId);
      parentProviderMock.verifyAll();
    });

  });

  describe("imodel", () => {

    it("returns imodel of the parent data provider", () => {
      parentProviderMock.setup((x) => x.imodel)
        .returns(() => imodelMock.object)
        .verifiable();
      expect(provider.imodel).to.eq(imodelMock.object);
      parentProviderMock.verifyAll();
    });

  });

  describe("parentDataProvider", () => {

    it("returns parent data provider", () => {
      expect(provider.parentDataProvider).to.eq(parentProviderMock.object);
    });

  });

  describe("getNodes", () => {

    it("returns root nodes", async () => {
      const result = await provider.getNodes(undefined, pageOptions);
      expect(result).to.matchSnapshot();
    });

    it("returns child nodes", async () => {
      const parentNode = createTreeNodeItem(nodePaths[1].node);

      const result = await provider.getNodes(parentNode, pageOptions);
      expect(result).to.matchSnapshot();
    });

  });

  describe("getNodesCount", () => {

    it("returns root nodes count", async () => {
      const result = await provider.getNodesCount();
      expect(result).to.equal(nodePaths.length);
    });

    it("returns child nodes count", async () => {
      const parentNode = createTreeNodeItem(nodePaths[1].node);

      const result = await provider.getNodesCount(parentNode);
      expect(result).to.equal(nodePaths[1].children.length);
    });

  });

  describe("getFilteredNodePaths", () => {

    it("calls parent data provider", async () => {
      parentProviderMock.setup((x) => x.getFilteredNodePaths(filter))
        .returns(async () => nodePaths)
        .verifiable();

      const result = await provider.getFilteredNodePaths(filter);
      expect(result).to.equal(nodePaths);
      parentProviderMock.verifyAll();
    });

  });

  describe("getNodeKey", () => {

    it("returns node key", () => {
      const key = createRandomECInstanceNodeKey();
      const treeNode = createRandomTreeNodeItem(key);

      parentProviderMock.setup((x) => x.getNodeKey(treeNode)).returns(() => key);
      const result = provider.getNodeKey(treeNode);
      expect(result).to.deep.equal(key);
    });

  });

  const constantFilter = "test";
  const filteredNodePaths: NodePathElement[] = [];

  filteredNodePaths[0] = createRandomNodePathElement();
  filteredNodePaths[0].node.label = "A-1";
  filteredNodePaths[0].filteringData = { matchesCount: 0, childMatchesCount: 1 };

  filteredNodePaths[0].children = [];
  filteredNodePaths[0].children[0] = createRandomNodePathElement();
  filteredNodePaths[0].children[0].node.label = "A-1-1 test";
  filteredNodePaths[0].children[0].filteringData = { matchesCount: 1, childMatchesCount: 0 };

  filteredNodePaths[1] = createRandomNodePathElement();
  filteredNodePaths[1].node.label = "A-2 test";
  filteredNodePaths[1].filteringData = { matchesCount: 1, childMatchesCount: 0 };

  filteredNodePaths[1].children = [];
  filteredNodePaths[1].children[0] = createRandomNodePathElement();
  filteredNodePaths[1].children[0].node.label = "A-2-1";
  filteredNodePaths[1].children[0].filteringData = { matchesCount: 0, childMatchesCount: 0 };

  filteredNodePaths[1].children[1] = createRandomNodePathElement();
  filteredNodePaths[1].children[1].node.label = "A-2-2";
  filteredNodePaths[1].children[1].filteringData = { matchesCount: 0, childMatchesCount: 0 };

  describe("countFilteringResults", () => {
    it("all matches get counted", () => {
      expect(provider.countFilteringResults(filteredNodePaths)).to.be.eq(2);
    });

    it("doesn't count if node paths don't have filtering data", () => {
      const paths: NodePathElement[] = [];
      paths[0] = createRandomNodePathElement();
      paths[0].node.label = "A-1";
      paths[0].filteringData = undefined;
      expect(provider.countFilteringResults(paths)).to.eq(0);
    });
  });

  describe("getActiveMatch", () => {
    it("returns correct match", () => {
      provider = new FilteredPresentationTreeDataProvider(parentProviderMock.object, constantFilter, filteredNodePaths);
      const result = provider.getActiveMatch(2);

      expect(result).to.not.be.undefined;
      expect(result!.nodeId).to.be.eq(createTreeNodeItem(filteredNodePaths[1].node).id);
      expect(result!.matchIndex).to.be.eq(0);
    });

    it("returns undefined when index is 0 or lower", () => {
      provider = new FilteredPresentationTreeDataProvider(parentProviderMock.object, constantFilter, filteredNodePaths);
      const result = provider.getActiveMatch(0);
      expect(result).to.be.undefined;
    });
  });
});

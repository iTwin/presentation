/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { of } from "rxjs";
import sinon from "sinon";
import { ITreeNodeLoader, PagedTreeNodeLoader, TreeDataProvider, TreeModelNode, TreeNodeItem, TreeNodeLoadResult } from "@itwin/components-react";
import { ReportingTreeNodeLoader } from "../../presentation-components/tree/ReportingTreeNodeLoader";
import { waitFor } from "../TestUtils";

describe("ReportingTreeNodeLoader", () => {
  let reportingNodeLoader: ReportingTreeNodeLoader<TreeDataProvider>;
  const reportStub = sinon.stub<[{ node: string | undefined; duration: number }], void>();
  const nodeLoaderStub = {
    loadNode: sinon.stub<Parameters<ITreeNodeLoader["loadNode"]>, ReturnType<ITreeNodeLoader["loadNode"]>>(),
    modelSource: {},
    dataProvider: {},
  };

  beforeEach(() => {
    nodeLoaderStub.loadNode.returns(
      of(
        { loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult,
        { loadedNodes: [{ id: "node 2" }] } as TreeNodeLoadResult,
        { loadedNodes: [{ id: "node 3" }] } as TreeNodeLoadResult,
      ),
    );
    reportingNodeLoader = new ReportingTreeNodeLoader(nodeLoaderStub as unknown as PagedTreeNodeLoader<TreeDataProvider>, reportStub);
  });

  afterEach(() => {
    nodeLoaderStub.loadNode.reset();
    reportStub.reset();
  });

  describe("loadNode", () => {
    it("reports node loading duration", async () => {
      const performanceStub = sinon.stub(performance, "now");
      performanceStub.onCall(0).returns(0);
      performanceStub.onCall(1).returns(300);

      const observable = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);
      let loadedNodes: TreeNodeItem[] = [];

      observable.subscribe({
        next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]),
      });

      await waitFor(() => {
        expect(loadedNodes).to.not.be.undefined;
        expect(loadedNodes).to.have.lengthOf(3);
        expect(reportStub).to.be.calledWithMatch({ node: "id", duration: 300 });
      });
    });

    it("only reports the first page", async () => {
      const observable = reportingNodeLoader.loadNode({ id: undefined, depth: -1, numChildren: undefined }, 5);
      let loadedNodes: TreeNodeItem[] = [];

      observable.subscribe({
        next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]),
      });

      await waitFor(() => {
        expect(loadedNodes).to.not.be.undefined;
        expect(loadedNodes).to.have.lengthOf(3);
        expect(reportStub).to.not.be.called;
      });
    });
  });
});

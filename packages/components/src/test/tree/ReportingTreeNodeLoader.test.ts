/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Subject } from "rxjs";
import sinon from "sinon";
import {
  ITreeNodeLoader,
  PagedTreeNodeLoader,
  TreeDataProvider,
  TreeModelNode,
  TreeModelRootNode,
  TreeNodeItem,
  TreeNodeLoadResult,
} from "@itwin/components-react";
import { ReportingTreeNodeLoader } from "../../presentation-components/tree/ReportingTreeNodeLoader";
import { waitFor } from "../TestUtils";

describe("ReportingTreeNodeLoader", () => {
  let reportingNodeLoader: ReportingTreeNodeLoader<TreeDataProvider>;
  let loadNodeSubject: Subject<TreeNodeLoadResult>;
  const reportStub = sinon.stub<[{ node: string | undefined; duration: number }], void>();
  const nodeLoaderStub = {
    loadNode: sinon.stub<Parameters<ITreeNodeLoader["loadNode"]>, ReturnType<ITreeNodeLoader["loadNode"]>>(),
    modelSource: {},
    dataProvider: {},
  };

  beforeEach(() => {
    loadNodeSubject = new Subject<TreeNodeLoadResult>();
    nodeLoaderStub.loadNode.returns(loadNodeSubject);
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

      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);
      observable.subscribe({ next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]) });

      loadNodeSubject.next({ loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult);
      loadNodeSubject.next({ loadedNodes: [{ id: "node 2" }] } as TreeNodeLoadResult);
      loadNodeSubject.complete();

      await waitFor(() => {
        expect(loadedNodes).to.have.lengthOf(2);
        expect(reportStub).to.be.calledWithMatch({ node: "id", duration: 300 });
      });
    });

    it("only reports the first page", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: undefined, depth: -1, numChildren: undefined }, 5);
      observable.subscribe({ next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]) });

      loadNodeSubject.next({ loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult);
      loadNodeSubject.complete();

      await waitFor(() => {
        expect(loadedNodes).to.have.lengthOf(1);
        expect(reportStub).to.not.be.called;
      });
    });

    it("does not report the same request twice", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable1 = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);
      const observable2 = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);

      observable1.subscribe({ next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]) });
      observable2.subscribe({ next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]) });

      loadNodeSubject.next({ loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult);
      loadNodeSubject.complete();

      await waitFor(() => {
        expect(loadedNodes).to.have.lengthOf(2);
        expect(reportStub).to.be.calledOnce;
      });
    });

    it("does not report on error", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);

      observable.subscribe({ next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]), error: () => {} });
      loadNodeSubject.error(new Error());

      await waitFor(() => {
        expect(loadedNodes).to.have.lengthOf(0);
        expect(reportStub).to.not.be.called;
      });
    });

    it("does not report if no longer subscribed", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);
      const subscription = observable.subscribe({ next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]) });

      subscription.unsubscribe();
      loadNodeSubject.next({ loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult);
      loadNodeSubject.complete();

      await waitFor(() => {
        expect(loadedNodes).to.have.lengthOf(0);
        expect(reportStub).to.not.be.called;
      });
    });

    it("reports root nodes load event if observable if unsubscribed", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: undefined } as TreeModelRootNode, 0);
      const subscription = observable.subscribe({ next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]) });

      subscription.unsubscribe();
      loadNodeSubject.next({ loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult);
      loadNodeSubject.complete();

      await waitFor(() => {
        expect(loadedNodes).to.have.lengthOf(0);
        expect(reportStub).to.be.calledOnce;
      });
    });
  });
});

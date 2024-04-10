/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { of, Observable as RxjsObservable, take } from "rxjs";
import sinon from "sinon";
import { ITreeNodeLoader, Observable, PagedTreeNodeLoader, TreeDataProvider, TreeModelNode, TreeNodeItem, TreeNodeLoadResult } from "@itwin/components-react";
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

  function toRxjsObservable<T>(source: Observable<T>): RxjsObservable<T> {
    return new RxjsObservable((subscriber) => source.subscribe(subscriber));
  }

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
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: undefined, depth: -1, numChildren: undefined }, 5);

      observable.subscribe({
        next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]),
      });

      await waitFor(() => {
        expect(loadedNodes).to.not.be.undefined;
        expect(loadedNodes).to.have.lengthOf(3);
        expect(reportStub).to.not.be.called;
      });
    });

    it("does not report the same request twice", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable1 = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);
      const observable2 = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);

      observable1.subscribe({
        next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]),
      });

      observable2.subscribe({
        next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]),
      });

      await waitFor(() => {
        expect(loadedNodes).to.not.be.undefined;
        expect(loadedNodes).to.have.lengthOf(6);
        expect(reportStub).to.be.calledOnce;
      });
    });

    it("does not report if no longer subscribed", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);

      toRxjsObservable(observable)
        .pipe(take(1))
        .subscribe({
          next: (result) => {
            loadedNodes = [...loadedNodes, ...result.loadedNodes];
          },
        });

      observable.subscribe({
        next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]),
      });

      await waitFor(() => {
        expect(loadedNodes).to.not.be.undefined;
        expect(loadedNodes).to.have.lengthOf(4);
        expect(reportStub).to.not.be.called;
      });
    });
  });
});

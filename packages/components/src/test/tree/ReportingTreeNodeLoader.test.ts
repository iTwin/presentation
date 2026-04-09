/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportingTreeNodeLoader } from "../../presentation-components/tree/ReportingTreeNodeLoader.js";
import { waitFor } from "../TestUtils.js";

import type {
  ITreeNodeLoader,
  PagedTreeNodeLoader,
  TreeDataProvider,
  TreeModelNode,
  TreeModelRootNode,
  TreeNodeItem,
  TreeNodeLoadResult,
} from "@itwin/components-react";

describe("ReportingTreeNodeLoader", () => {
  let reportingNodeLoader: ReportingTreeNodeLoader<TreeDataProvider>;
  let loadNodeSubject: Subject<TreeNodeLoadResult>;
  const reportStub = vi.fn<(props: { node: string | undefined; duration: number }) => void>();
  const nodeLoaderStub = { loadNode: vi.fn<ITreeNodeLoader["loadNode"]>(), modelSource: {}, dataProvider: {} };

  beforeEach(() => {
    loadNodeSubject = new Subject<TreeNodeLoadResult>();
    nodeLoaderStub.loadNode.mockReturnValue(loadNodeSubject);
    reportingNodeLoader = new ReportingTreeNodeLoader(
      nodeLoaderStub as unknown as PagedTreeNodeLoader<TreeDataProvider>,
      reportStub,
    );
  });

  afterEach(() => {
    nodeLoaderStub.loadNode.mockReset();
    reportStub.mockReset();
  });

  describe("loadNode", () => {
    it("reports node loading duration", async () => {
      vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(300);

      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);
      observable.subscribe({ next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]) });

      loadNodeSubject.next({ loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult);
      loadNodeSubject.next({ loadedNodes: [{ id: "node 2" }] } as TreeNodeLoadResult);
      loadNodeSubject.complete();

      await waitFor(() => {
        expect(loadedNodes).toHaveLength(2);
        expect(reportStub).toHaveBeenCalledWith(expect.objectContaining({ node: "id", duration: 300 }));
      });
    });

    it("only reports the first page", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: undefined, depth: -1, numChildren: undefined }, 5);
      observable.subscribe({ next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]) });

      loadNodeSubject.next({ loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult);
      loadNodeSubject.complete();

      await waitFor(() => {
        expect(loadedNodes).toHaveLength(1);
        expect(reportStub).not.toHaveBeenCalled();
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
        expect(loadedNodes).toHaveLength(2);
        expect(reportStub).toHaveBeenCalledOnce();
      });
    });

    it("does not report on error", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);

      observable.subscribe({
        next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]),
        error: () => {},
      });
      loadNodeSubject.error(new Error());

      await waitFor(() => {
        expect(loadedNodes).toHaveLength(0);
        expect(reportStub).not.toHaveBeenCalled();
      });
    });

    it("does not report if no longer subscribed", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: "id" } as TreeModelNode, 0);
      const subscription = observable.subscribe({
        next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]),
      });

      subscription.unsubscribe();
      loadNodeSubject.next({ loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult);
      loadNodeSubject.complete();

      await waitFor(() => {
        expect(loadedNodes).toHaveLength(0);
        expect(reportStub).not.toHaveBeenCalled();
      });
    });

    it("reports root nodes load event if observable if unsubscribed", async () => {
      let loadedNodes: TreeNodeItem[] = [];
      const observable = reportingNodeLoader.loadNode({ id: undefined } as TreeModelRootNode, 0);
      const subscription = observable.subscribe({
        next: (result) => (loadedNodes = [...loadedNodes, ...result.loadedNodes]),
      });

      subscription.unsubscribe();
      loadNodeSubject.next({ loadedNodes: [{ id: "node 1" }] } as TreeNodeLoadResult);
      loadNodeSubject.complete();

      await waitFor(() => {
        expect(loadedNodes).toHaveLength(0);
        expect(reportStub).toHaveBeenCalledOnce();
      });
    });
  });
});

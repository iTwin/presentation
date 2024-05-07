/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tree
 */

import { share, Subject, tap } from "rxjs";
import { Observable, PagedTreeNodeLoader, TreeDataProvider, TreeModelNode, TreeModelRootNode, TreeNodeLoadResult } from "@itwin/components-react";
import { toRxjsObservable } from "./Utils";

/**
 * Wrapper for `PagedTreeNodeLoader` that reports load times of nodes.
 * @internal
 */
export class ReportingTreeNodeLoader<IPresentationTreeDataProvider extends TreeDataProvider> extends PagedTreeNodeLoader<IPresentationTreeDataProvider> {
  private _nodeLoader: PagedTreeNodeLoader<IPresentationTreeDataProvider>;
  private _onNodeLoaded: (props: { node: string; duration: number }) => void;
  private _trackedRequests: Map<string, Observable<TreeNodeLoadResult>>;

  constructor(nodeLoader: PagedTreeNodeLoader<IPresentationTreeDataProvider>, onNodeLoaded: (props: { node: string; duration: number }) => void) {
    super(nodeLoader.dataProvider, nodeLoader.modelSource, nodeLoader.pageSize);
    this._nodeLoader = nodeLoader;
    this._onNodeLoaded = onNodeLoaded;
    this._trackedRequests = new Map();
  }

  public override loadNode(parent: TreeModelNode | TreeModelRootNode, childIndex: number): Observable<TreeNodeLoadResult> {
    const observable = this._nodeLoader.loadNode(parent, childIndex);
    const parentId = parent.id ?? "root";

    if (childIndex !== 0) {
      return observable;
    }

    let tracked = this._trackedRequests.get(parentId);
    if (!tracked) {
      let time: number;
      tracked = toRxjsObservable(observable).pipe(
        tap({
          subscribe: () => {
            time = performance.now();
          },
          unsubscribe: () => {
            this._trackedRequests.delete(parentId);
          },
          error: () => {
            this._trackedRequests.delete(parentId);
          },
          next: () => {
            this._onNodeLoaded({ node: parentId, duration: performance.now() - time });
          },
          complete: () => {
            this._trackedRequests.delete(parentId);
          },
        }),
        share({ resetOnRefCountZero: true }),
      );

      this._trackedRequests.set(parentId, tracked);
    }

    if (parent.id !== undefined) {
      return tracked;
    }

    // workaround ControlledTree unsubscribing from the observable after nodes are loaded into a tree model
    // but not emitted from observable yet.
    const subject = new Subject<TreeNodeLoadResult>();
    const source = tracked; // reference docs generation fails if `tracked` is used directly.
    return subject.pipe(
      tap({
        subscribe: () => {
          source.subscribe(subject);
        },
      }),
    );
  }
}

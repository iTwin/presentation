/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tree
 */

import { tap } from "rxjs";
import { Observable, PagedTreeNodeLoader, TreeDataProvider, TreeModelNode, TreeModelRootNode, TreeNodeLoadResult } from "@itwin/components-react";
import { toRxjsObservable } from "./Utils";

/**
 * Wrapper for `PagedTreeNodeLoader` that reports load times of nodes.
 * @internal
 */
export class ReportingTreeNodeLoader<IPresentationTreeDataProvider extends TreeDataProvider> extends PagedTreeNodeLoader<IPresentationTreeDataProvider> {
  private _nodeLoader: PagedTreeNodeLoader<IPresentationTreeDataProvider>;
  private _onNodeLoaded: (props: { node: string | undefined; duration: number }) => void;

  constructor(nodeLoader: PagedTreeNodeLoader<IPresentationTreeDataProvider>, onNodeLoaded: (props: { node: string | undefined; duration: number }) => void) {
    super(nodeLoader.dataProvider, nodeLoader.modelSource, nodeLoader.pageSize);
    this._nodeLoader = nodeLoader;
    this._onNodeLoaded = onNodeLoaded;
  }

  public override loadNode(parent: TreeModelNode | TreeModelRootNode, childIndex: number): Observable<TreeNodeLoadResult> {
    const observable = this._nodeLoader.loadNode(parent, childIndex);

    if (childIndex !== 0) {
      return observable;
    }

    let time: number;
    const tracked = toRxjsObservable(observable).pipe(
      tap({
        subscribe: () => (time = performance.now()),
        complete: () => this._onNodeLoaded({ node: parent.id, duration: performance.now() - time }),
      }),
    );
    return tracked;
  }
}

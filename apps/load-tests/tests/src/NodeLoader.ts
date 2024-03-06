/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { BeDuration } from "@itwin/core-bentley";
import { NodeRequestsTracker } from "./NodeRequestsTracker";

const ENABLE_REQUEST_LOGGING = false;
const logRequest = ENABLE_REQUEST_LOGGING ? console.debug : undefined;

export interface NodeProvider<TNode> {
  getChildren(parent: TNode | undefined): Promise<TNode[]>;
  initialHasChildren(node: TNode): boolean;
  fullHasChildren(node: TNode): boolean;
}

export class NodeLoader<TNode> {
  private _nodesCreated = 0;
  private readonly _pendingChildNodesRequests = new Array<TNode>();
  private _nodeHasChildren?: (node: TNode) => boolean;

  constructor(private readonly _provider: NodeProvider<TNode>) {}

  public async loadInitialHierarchy(): Promise<void> {
    this._nodeHasChildren = this._provider.initialHasChildren.bind(this);
    await this.loadNodes();
  }

  public async loadFullHierarchy(): Promise<void> {
    this._nodeHasChildren = this._provider.fullHasChildren.bind(this);
    await this.loadNodes();
  }

  private onNodeLoaded(node: TNode) {
    this._nodesCreated++;
    if (!this._nodeHasChildren!(node)) {
      return;
    }
    NodeRequestsTracker.onStart();
    this._pendingChildNodesRequests.push(node);
  }

  private async loadChildNodes(parentNode: TNode | undefined) {
    const children = await this._provider.getChildren(parentNode);
    logRequest?.(`Got ${children.length} nodes for parent ${parentNode ? JSON.stringify(parentNode) : "<root>"}`);
    children.forEach((node) => this.onNodeLoaded(node));
    NodeRequestsTracker.onComplete();
  }

  private async loadAllChildNodes() {
    while (NodeRequestsTracker.hasPending) {
      if (this._pendingChildNodesRequests.length === 0) {
        await BeDuration.wait(1);
        continue;
      }

      const x = [...this._pendingChildNodesRequests];
      this._pendingChildNodesRequests.length = 0;
      x.forEach(async (node) => this.loadChildNodes(node));
      logRequest?.(`Scheduled children load for ${x.length} parent nodes`);
    }
    logRequest?.(`Done loading hierarchy`);
  }

  private async loadNodes() {
    this._nodesCreated = 0;
    this._pendingChildNodesRequests.length = 0;

    NodeRequestsTracker.onStart();
    void this.loadChildNodes(undefined);

    await this.loadAllChildNodes();
    console.log(`Total nodes created: ${this._nodesCreated}`);
  }
}

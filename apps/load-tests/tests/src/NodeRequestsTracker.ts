/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
export class NodeRequestsTracker {
  private static _pendingNodeRequests = 0;

  public static reset() {
    this._pendingNodeRequests = 0;
  }

  public static onStart() {
    ++this._pendingNodeRequests;
  }

  public static onComplete() {
    --this._pendingNodeRequests;
  }

  public static get hasPending() {
    return !!this._pendingNodeRequests;
  }

  public static logCount(isFinal: boolean) {
    console.debug(`${isFinal ? "Final pending" : "Pending"} node requests: ${this._pendingNodeRequests}`);
  }
}

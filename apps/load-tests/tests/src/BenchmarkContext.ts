/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { NodeRequestsTracker } from "./NodeRequestsTracker";

export class BenchmarkVariables {
  public currentIModelPath = "";
  public tooLargeHierarchyLevelsCount = 0;
  public pendingNodeRequestsCount = 0;

  public get currentIModelName(): string | undefined {
    return this.currentIModelPath && path.basename(this.currentIModelPath);
  }

  public reset() {
    this.tooLargeHierarchyLevelsCount = 0;
    this.pendingNodeRequestsCount = 0;
  }
}

export interface Summary {
  requestName: string;
  count: number;
  max?: number;
  average?: number;
}

export class BenchmarkContext {
  public readonly vars = new BenchmarkVariables();
  private _pendingNodeRequestsLogger?: NodeJS.Timer;

  public start() {
    this.vars.tooLargeHierarchyLevelsCount = 0;

    NodeRequestsTracker.reset();
    this._pendingNodeRequestsLogger = setInterval(() => {
      NodeRequestsTracker.logCount(false);
    }, 1000);
  }

  public stop() {
    clearInterval(this._pendingNodeRequestsLogger);
    console.log(`Total hierarchy levels that exceeded nodes limit: ${this.vars.tooLargeHierarchyLevelsCount}`);
    NodeRequestsTracker.logCount(true);
  }
}

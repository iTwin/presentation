/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { EventEmitter, Next, ScenarioContext } from "artillery";
import { Guid, StopWatch } from "@itwin/core-bentley";
import {
  HierarchyRpcRequestOptions,
  Node,
  NodeJSON,
  PagedResponse,
  PresentationError,
  PresentationRpcResponseData,
  PresentationStatus,
} from "@itwin/presentation-common";
import RULESET_ModelsTree from "../rulesets/ModelsTree-GroupedByClass.PresentationRuleSet.json";
import { doRequest, getCurrentIModelName, getCurrentIModelPath, loadNodes, nodeRequestsTracker } from "./common";

export function initScenario(context: ScenarioContext, _events: EventEmitter, next: Next) {
  context.vars.tooLargeHierarchyLevelsCount = 0;
  context.vars.pendingNodeRequestsLogger = setInterval(() => {
    nodeRequestsTracker.logCount(context, false);
  }, 1000);
  nodeRequestsTracker.reset(context);
  next();
}

export function terminateScenario(context: ScenarioContext, _ee: EventEmitter, next: Next) {
  console.log(`Total hierarchy levels that exceeded nodes limit: ${context.vars.tooLargeHierarchyLevelsCount}`);
  context.vars.tooLargeHierarchyLevelsCount = 0;
  clearInterval(context.vars.pendingNodeRequestsLogger as NodeJS.Timeout);
  nodeRequestsTracker.logCount(context, true);
  next();
}

export function loadInitialHierarchy(context: ScenarioContext, events: EventEmitter, next: Next) {
  // we limit loaded hierarchy depth by telling that node has no children if it has `!isExpanded` (root node in models tree is always auto-expanded)
  const timer = new StopWatch(undefined, true);
  void loadNodes(context, events, createProvider(context, events), (node) => !!node.hasChildren && !!node.isExpanded)
    .then(() => {
      events.emit("histogram", `initial-load-${getCurrentIModelName(context)}`, timer.current.milliseconds);
    })
    .then(() => {
      next();
    });
}

export function loadFullHierarchy(context: ScenarioContext, events: EventEmitter, next: Next) {
  const timer = new StopWatch(undefined, true);
  void loadNodes(context, events, createProvider(context, events), (node) => !!node.hasChildren)
    .then(() => {
      events.emit("histogram", `full-load-${getCurrentIModelName(context)}`, timer.current.milliseconds);
    })
    .then(() => {
      next();
    });
}

function createProvider(context: ScenarioContext, events: EventEmitter) {
  const clientId = Guid.createValue();
  return async function (parent: Node | undefined): Promise<Node[]> {
    const requestBody = JSON.stringify([
      {
        iTwinId: Guid.empty,
        iModelId: Guid.empty,
        key: getCurrentIModelPath(context),
        changeset: { index: 0, id: "" },
      },
      {
        clientId,
        rulesetOrId: RULESET_ModelsTree,
        sizeLimit: 1000,
        parentKey: parent?.key,
      } as HierarchyRpcRequestOptions,
    ]);
    async function requestRepeatedly(): Promise<Node[]> {
      return doRequest("PresentationRpcInterface-4.0.0-getPagedNodes", requestBody, events, "nodes").then(async (response) => {
        // eslint-disable-next-line deprecation/deprecation
        const responseBody = response as PresentationRpcResponseData<PagedResponse<NodeJSON>>;
        switch (responseBody.statusCode) {
          case PresentationStatus.Canceled:
            return [];
          case PresentationStatus.ResultSetTooLarge:
            ++(context.vars.tooLargeHierarchyLevelsCount as number);
            return [];
          case PresentationStatus.BackendTimeout:
            return requestRepeatedly();
          case PresentationStatus.Success:
            // eslint-disable-next-line deprecation/deprecation
            return responseBody.result!.items.map(Node.fromJSON);
          default:
            throw new PresentationError(responseBody.statusCode, responseBody.errorMessage);
        }
      });
    }
    return requestRepeatedly();
  };
}

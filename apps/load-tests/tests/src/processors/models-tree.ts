/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { EventEmitter, Next, RequestParams, ScenarioContext } from "artillery";
import { Guid } from "@itwin/core-bentley";
import {
  HierarchyRpcRequestOptions,
  NodeJSON,
  NodeKey,
  PagedResponse,
  PresentationError,
  PresentationRpcResponseData,
  PresentationStatus,
} from "@itwin/presentation-common";
import RULESET_ModelsTree from "../rulesets/ModelsTree-GroupedByClass.PresentationRuleSet.json";

export { createClientId } from "./common";

export function initScenario(context: ScenarioContext, _ee: EventEmitter, next: Next) {
  context.vars.nodesCreated = 0;
  context.vars.tooLargeHierarchyLevelsCount = 0;
  next();
}

export function terminateScenario(context: ScenarioContext, _ee: EventEmitter, next: Next) {
  console.log(`Total nodes created: ${context.vars.nodesCreated}`);
  console.log(`Total hierarchy levels that exceeded nodes limit: ${context.vars.tooLargeHierarchyLevelsCount}`);
  context.vars.nodesCreated = 0;
  context.vars.tooLargeHierarchyLevelsCount = 0;
  next();
}

/**
 * Pops a parent node key from context and creates request params for getting its child nodes.
 */
export function createModelsTreeRequestParams(requestParams: RequestParams, context: ScenarioContext, _ee: EventEmitter, next: Next) {
  const parentNodeKeys = context.vars.parentNodeKeys as Array<NodeKey | undefined> | undefined;
  const parentKey = parentNodeKeys?.pop();
  requestParams.headers = {
    ["X-Correlation-Id"]: Guid.createValue(),
    ["Content-Type"]: "text/plain",
  };
  requestParams.body = JSON.stringify([
    {
      iTwinId: Guid.empty,
      iModelId: Guid.empty,
      key: context.vars.iModelPath,
      changeset: { index: 0, id: "" },
    },
    {
      clientId: context.vars.clientId,
      rulesetOrId: RULESET_ModelsTree,
      sizeLimit: 1000,
      parentKey,
    } as HierarchyRpcRequestOptions,
  ]);
  next();
}

/**
 * Checks if context contains any parent node keys to get children for.
 */
export function hasParentNodeKeys(context: ScenarioContext, next: Next) {
  const parentNodeKeys = context.vars.parentNodeKeys as Array<NodeKey | undefined> | undefined;
  const hasKeys = parentNodeKeys && parentNodeKeys.length > 0;
  return next(hasKeys as any);
}

/**
 * Extracts keys from nodes response and pushes them to context for getting their children (if `hasChildren == true`).
 * In case of the `BackendTimeout` response, pushes the same (requested) parent node key to context to repeat the request ASAP.
 */
export function extractNodeKeysFromNodesResponse(requestConfig: any, response: any, context: ScenarioContext, _ee: EventEmitter, next: Next) {
  let parentNodeKeys = context.vars.parentNodeKeys as Array<NodeKey | undefined> | undefined;
  if (!parentNodeKeys) {
    parentNodeKeys = [];
    context.vars.parentNodeKeys = parentNodeKeys;
  }
  // eslint-disable-next-line deprecation/deprecation
  const body = JSON.parse(response.body) as PresentationRpcResponseData<PagedResponse<NodeJSON>>;
  switch (body.statusCode) {
    case PresentationStatus.Success:
    case PresentationStatus.Canceled:
      // do nothing
      break;
    case PresentationStatus.ResultSetTooLarge:
      ++(context.vars.tooLargeHierarchyLevelsCount as number);
      break;
    case PresentationStatus.BackendTimeout:
      // repeat the request by adding the parent node key back to the list
      const requestParams = JSON.parse(requestConfig.body);
      const nodesRequestParams = requestParams[1] as HierarchyRpcRequestOptions;
      parentNodeKeys.push(nodesRequestParams.parentKey);
      break;
    default:
      throw new PresentationError(body.statusCode, body.errorMessage);
  }
  body.result?.items.forEach((n) => {
    ++(context.vars.nodesCreated as number);
    if (n.hasChildren) {
      // push node's key to a random location in the list
      const location = Math.random() * parentNodeKeys!.length;
      // eslint-disable-next-line deprecation/deprecation
      parentNodeKeys!.splice(location, 0, NodeKey.fromJSON(n.key));
    }
  });
  next();
}

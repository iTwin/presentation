/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

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
      iModelId: context.vars.iModelId,
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
    case PresentationStatus.ResultSetTooLarge:
    case PresentationStatus.Canceled:
      // do nothing
      break;
    case PresentationStatus.BackendTimeout:
      // repeat the request by adding the parent node key back to the list
      const requestParams = JSON.parse(requestConfig.body);
      const nodesRequestParams = requestParams[1] as HierarchyRpcRequestOptions;
      parentNodeKeys.splice(0, 0, nodesRequestParams.parentKey);
      break;
    default:
      throw new PresentationError(body.statusCode, body.errorMessage);
  }
  body.result?.items.forEach((n) => {
    if (n.hasChildren) {
      // eslint-disable-next-line deprecation/deprecation
      parentNodeKeys!.push(NodeKey.fromJSON(n.key));
    }
  });
  next();
}

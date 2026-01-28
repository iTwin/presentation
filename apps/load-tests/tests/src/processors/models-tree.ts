/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { Guid, StopWatch } from "@itwin/core-bentley";
import { PresentationError, PresentationStatus } from "@itwin/presentation-common";
import RULESET_ModelsTree from "../rulesets/ModelsTree-GroupedByClass.PresentationRuleSet.json";
import { doRequest, getCurrentIModelName, loadNodes, loadVariables, openIModelConnectionIfNeeded } from "./common";

import type { VUContext, VUEvents } from "artillery";
import type { HierarchyRpcRequestOptions, Node, PagedResponse, PresentationRpcResponseData } from "@itwin/presentation-common";

/* eslint-disable @typescript-eslint/no-deprecated */

export async function initScenario(context: VUContext, _events: VUEvents) {
  context.vars.tooLargeHierarchyLevelsCount = 0;
  await openIModelConnectionIfNeeded();
  loadVariables(context);
}

export function terminateScenario(context: VUContext, _ee: VUEvents) {
  console.log(`Total hierarchy levels that exceeded nodes limit: ${context.vars.tooLargeHierarchyLevelsCount as number}`);
  context.vars.tooLargeHierarchyLevelsCount = 0;
}

export async function loadInitialHierarchy(context: VUContext, events: VUEvents) {
  // we limit loaded hierarchy depth by telling that node has no children if it has `!isExpanded` (root node in models tree is always auto-expanded)
  const timer = new StopWatch(undefined, true);
  await loadNodes(events, createProvider(context, events), (node) => !!node.hasChildren && !!node.isExpanded);
  events.emit("histogram", `Models Tree initial load: ${getCurrentIModelName(context)}`, timer.current.milliseconds);
}

export async function loadFirstBranch(context: VUContext, events: VUEvents) {
  const timer = new StopWatch(undefined, true);
  await loadNodes(events, createProvider(context, events), (node, index) => !!node.hasChildren && index === 0);
  events.emit("histogram", `Models Tree first branch load:${getCurrentIModelName(context)}`, timer.current.milliseconds);
}

export async function loadFullHierarchy(context: VUContext, events: VUEvents) {
  const timer = new StopWatch(undefined, true);
  await loadNodes(events, createProvider(context, events), (node) => !!node.hasChildren);
  events.emit("histogram", `Models Tree full load:${getCurrentIModelName(context)}`, timer.current.milliseconds);
}

function createProvider(context: VUContext, events: VUEvents) {
  const clientId = Guid.createValue();
  return async function (parent: Node | undefined): Promise<Node[]> {
    const requestBody = JSON.stringify([
      (context.vars.imodelRpcProps as (context: VUContext) => any)(context),
      {
        clientId,
        rulesetOrId: RULESET_ModelsTree,
        sizeLimit: 1000,
        parentKey: parent?.key,
      } as HierarchyRpcRequestOptions,
    ]);
    async function requestRepeatedly(): Promise<Node[]> {
      return doRequest("PresentationRpcInterface-5.0.0-getPagedNodes", requestBody, events, "nodes").then(async (response) => {
        const responseBody = response as PresentationRpcResponseData<PagedResponse<Node>>;
        switch (responseBody.statusCode) {
          case PresentationStatus.Canceled:
            return [];
          case PresentationStatus.ResultSetTooLarge:
            ++(context.vars.tooLargeHierarchyLevelsCount as number);
            return [];
          case PresentationStatus.Success:
            return responseBody.result!.items;
          default:
            throw new PresentationError(responseBody.statusCode, responseBody.errorMessage);
        }
      });
    }
    return requestRepeatedly();
  };
}

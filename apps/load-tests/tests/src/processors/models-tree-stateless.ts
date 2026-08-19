/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @itwin/no-internal */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { createSchemaViewGetter } from "presentation-test-utilities";
import { StopWatch } from "@itwin/core-bentley";
import { ECSqlReader } from "@itwin/core-common";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import {
  createIModelHierarchyProvider,
  createLimitingECSqlQueryExecutor,
  RowsLimitExceededError,
} from "@itwin/presentation-hierarchies";
import { defaultHierarchyConfiguration, ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { doRequest, getCurrentIModelName, loadNodes, loadVariables, openIModelConnectionIfNeeded } from "./common.js";

import type { VUContext, VUEvents } from "artillery";
import type { DbQueryRequest, DbQueryResponse, DbRequestExecutor, QueryBinder, QueryOptions } from "@itwin/core-common";
import type { HierarchyNode } from "@itwin/presentation-hierarchies";

console.log(`Frontend PID: ${process.pid}`);
const ENABLE_REQUESTS_LOGGING = false;

export async function initScenario(context: VUContext, _events: VUEvents) {
  context.vars.tooLargeHierarchyLevelsCount = 0;
  await openIModelConnectionIfNeeded();
  loadVariables(context);
}

export function terminateScenario(context: VUContext, _ee: VUEvents) {
  console.log(
    `Total hierarchy levels that exceeded nodes limit: ${context.vars.tooLargeHierarchyLevelsCount as number}`,
  );
  context.vars.tooLargeHierarchyLevelsCount = 0;
  context.vars.isTestTerminated = true;
}

export async function loadInitialHierarchy(context: VUContext, events: VUEvents) {
  // we limit loaded hierarchy depth by telling that node has no children if it has `!autoExpand` (root node in models tree is always auto-expanded)
  const timer = new StopWatch(undefined, true);
  await loadNodes(events, createModelsTreeProvider(context, events), (node) => node.children && !!node.autoExpand);
  events.emit("histogram", `Models Tree initial load: ${getCurrentIModelName(context)}`, timer.current.milliseconds);
}

export async function loadFirstBranch(context: VUContext, events: VUEvents) {
  const timer = new StopWatch(undefined, true);
  await loadNodes(events, createModelsTreeProvider(context, events), (node, index) => node.children && index === 0);
  events.emit(
    "histogram",
    `Models Tree first branch load: ${getCurrentIModelName(context)}`,
    timer.current.milliseconds,
  );
}

export async function loadFullHierarchy(context: VUContext, events: VUEvents) {
  const timer = new StopWatch(undefined, true);
  await loadNodes(events, createModelsTreeProvider(context, events), (node) => node.children);
  events.emit("histogram", `Models Tree full load: ${getCurrentIModelName(context)}`, timer.current.milliseconds);
}

function createModelsTreeProvider(context: VUContext, events: VUEvents) {
  const imodelRpcProps = (context.vars.imodelRpcProps as (context: VUContext) => any)(context);
  const schedulingQueryExecutor: DbRequestExecutor<DbQueryRequest, DbQueryResponse> = {
    async execute(request: DbQueryRequest): Promise<DbQueryResponse> {
      const timer = new StopWatch(undefined, true);
      const body = JSON.stringify([imodelRpcProps, request]);
      return doRequest("IModelReadRpcInterface-3.7.0-queryRows", body, events, "query_rows").then((response) => {
        ENABLE_REQUESTS_LOGGING &&
          console.log(`Received "query rows" response for \`${request.query}\` in ${timer.current.milliseconds} ms`);
        return response as DbQueryResponse;
      });
    },
  };

  const coreReaderFactory = {
    createQueryReader(ecsql: string, bindings?: QueryBinder, config?: QueryOptions) {
      return new ECSqlReader(schedulingQueryExecutor, ecsql, bindings, config);
    },
  };

  // Loads the whole-schema view blob once via `PRAGMA schema_view` and parses it with `SchemaView.fromBinary`.
  // The blob is self-contained, so a single fetch serves every schema the hierarchy needs.
  const getSchemaView = createSchemaViewGetter(coreReaderFactory);

  const schemaProvider = createECSchemaProvider({ getSchemaView, ...coreReaderFactory });
  const queryExecutor = createECSqlQueryExecutor(coreReaderFactory);
  const imodelAccess = {
    imodelKey: imodelRpcProps.key,
    ...schemaProvider,
    ...createLimitingECSqlQueryExecutor(queryExecutor, 1000),
  };
  const provider = createIModelHierarchyProvider({
    imodelAccess,
    hierarchyDefinition: new ModelsTreeDefinition({ imodelAccess, hierarchyConfig: defaultHierarchyConfiguration }),
  });

  return async (parent: HierarchyNode | undefined) => {
    try {
      const nodes = [];
      for await (const node of provider.getNodes({ parentNode: parent })) {
        nodes.push(node);
      }
      return nodes;
    } catch (e) {
      if (e instanceof RowsLimitExceededError) {
        ++(context.vars.tooLargeHierarchyLevelsCount as number);
        return [];
      }
      throw e;
    }
  };
}

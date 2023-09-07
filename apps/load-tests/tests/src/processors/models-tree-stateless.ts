/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @itwin/no-internal */
/* eslint-disable no-console */

import { EventEmitter, Next, ScenarioContext } from "artillery";
import { Guid, StopWatch } from "@itwin/core-bentley";
import { DbQueryRequest, DbQueryResponse, DbRequestExecutor, ECSqlReader } from "@itwin/core-common";
import { ISchemaLocater, Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType, SchemaProps } from "@itwin/ecschema-metadata";
import { HierarchyNode, HierarchyProvider, ModelsTreeQueryBuilder } from "@itwin/presentation-hierarchy-builder";
import { doRequest, getCurrentIModelName, getCurrentIModelPath, loadNodes, nodeRequestsTracker } from "./common";

console.log(`Frontend PID: ${process.pid}`);
const ENABLE_REQUESTS_LOGGING = false;

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
  // we limit loaded hierarchy depth by telling that node has no children if it has `!autoExpand` (root node in models tree is always auto-expanded)
  const timer = new StopWatch(undefined, true);
  void loadNodes(
    context,
    events,
    createModelsTreeProvider(context, events),
    (node) => (node.children === true || (Array.isArray(node.children) && node.children.length > 0)) && !!node.autoExpand,
  )
    .then(() => {
      events.emit("histogram", `initial-load-${getCurrentIModelName(context)}`, timer.current.milliseconds);
    })
    .then(() => {
      next();
    });
}

export function loadFullHierarchy(context: ScenarioContext, events: EventEmitter, next: Next) {
  const timer = new StopWatch(undefined, true);
  void loadNodes(
    context,
    events,
    createModelsTreeProvider(context, events),
    (node) => node.children === true || (Array.isArray(node.children) && node.children.length > 0),
  )
    .then(() => {
      events.emit("histogram", `full-load-${getCurrentIModelName(context)}`, timer.current.milliseconds);
    })
    .then(() => {
      next();
    });
}

function createModelsTreeProvider(context: ScenarioContext, events: EventEmitter) {
  const pendingSchemaLoads = new Map<string, Promise<SchemaProps>>();
  const imodelArg = {
    iTwinId: Guid.empty,
    iModelId: Guid.empty,
    key: getCurrentIModelPath(context),
    changeset: { index: 0, id: "" },
  };
  async function requestSchemaJson(schemaKey: Readonly<SchemaKey>) {
    const pending = pendingSchemaLoads.get(schemaKey.name);
    if (pending) {
      return pending;
    }
    const body = JSON.stringify([imodelArg, schemaKey.name]);
    const promise = doRequest("ECSchemaRpcInterface-2.0.0-getSchemaJSON", body, events, "schema_json")
      .then((schemaJson) => {
        ENABLE_REQUESTS_LOGGING && console.log(`Received "schema json" response for ${schemaKey.name}`);
        return schemaJson as SchemaProps;
      })
      .finally(() => {
        pendingSchemaLoads.delete(schemaKey.name);
      });
    pendingSchemaLoads.set(schemaKey.name, promise);
    return promise;
  }
  const schedulingSchemaLocater: ISchemaLocater = {
    getSchemaSync<T extends Schema>(_schemaKey: Readonly<SchemaKey>, _matchType: SchemaMatchType, _schemaContext: SchemaContext): T | undefined {
      console.error(`getSchemaSync not implemented`);
      return undefined;
    },
    async getSchemaInfo(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<SchemaInfo | undefined> {
      const schemaJson = await requestSchemaJson(schemaKey);
      const schemaInfo = await Schema.startLoadingFromJson(schemaJson, schemaContext);
      if (schemaInfo !== undefined && schemaInfo.schemaKey.matches(schemaKey, matchType)) {
        return schemaInfo;
      }
      return undefined;
    },
    async getSchema<T extends Schema>(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<T | undefined> {
      await this.getSchemaInfo(schemaKey, matchType, schemaContext);
      const schema = await schemaContext.getCachedSchema(schemaKey, matchType);
      return schema as T;
    },
  };
  const schedulingQueryExecutor: DbRequestExecutor<DbQueryRequest, DbQueryResponse> = {
    async execute(request: DbQueryRequest): Promise<DbQueryResponse> {
      const body = JSON.stringify([imodelArg, request]);
      ENABLE_REQUESTS_LOGGING && console.log(`Scheduled "query rows" request for ${request.query}`);
      return doRequest("IModelReadRpcInterface-3.5.0-queryRows", body, events, "query_rows").then((response) => {
        ENABLE_REQUESTS_LOGGING && console.log(`Received "query rows" response for ${request.query}`);
        return response as DbQueryResponse;
      });
    },
  };

  const schemas = new SchemaContext();
  schemas.addLocater(schedulingSchemaLocater);

  const provider = new HierarchyProvider({
    schemas,
    queryBuilder: new ModelsTreeQueryBuilder({ schemas }),
    queryExecutor: {
      createQueryReader(ecsql, bindings, config) {
        // eslint-disable-next-line @itwin/no-internal
        return new ECSqlReader(schedulingQueryExecutor, ecsql, bindings, config);
      },
    },
  });

  return async (parent: HierarchyNode | undefined) => {
    try {
      const nodes = await provider.getNodes(parent);
      return nodes;
    } catch (e) {
      if (e instanceof Error && e.message === "rows limit exceeded") {
        ++(context.vars.tooLargeHierarchyLevelsCount as number);
        return [];
      }
      throw e;
    }
  };
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @itwin/no-internal */
/* eslint-disable no-console */

import { EventEmitter, Next, ScenarioContext } from "artillery";
import { StopWatch } from "@itwin/core-bentley";
import { DbQueryRequest, DbQueryResponse, DbRequestExecutor, ECSqlReader } from "@itwin/core-common";
import { ISchemaLocater, Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType, SchemaProps } from "@itwin/ecschema-metadata";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createHierarchyProvider, createLimitingECSqlQueryExecutor, HierarchyNode, RowsLimitExceededError } from "@itwin/presentation-hierarchies";
import { defaultHierarchyConfiguration, ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { doRequest, getCurrentIModelName, loadNodes, openIModelConnectionIfNeeded } from "./common";

console.log(`Frontend PID: ${process.pid}`);
const ENABLE_REQUESTS_LOGGING = false;

export function initScenario(context: ScenarioContext, _events: EventEmitter, next: Next) {
  context.vars.tooLargeHierarchyLevelsCount = 0;
  void openIModelConnectionIfNeeded().then(() => {
    next();
  });
}

export function terminateScenario(context: ScenarioContext, _ee: EventEmitter, next: Next) {
  console.log(`Total hierarchy levels that exceeded nodes limit: ${context.vars.tooLargeHierarchyLevelsCount as number}`);
  context.vars.tooLargeHierarchyLevelsCount = 0;
  context.vars.isTestTerminated = true;
  next();
}

export function loadInitialHierarchy(context: ScenarioContext, events: EventEmitter, next: Next) {
  // we limit loaded hierarchy depth by telling that node has no children if it has `!autoExpand` (root node in models tree is always auto-expanded)
  const timer = new StopWatch(undefined, true);
  void loadNodes(context, events, createModelsTreeProvider(context, events), (node) => node.children && !!node.autoExpand)
    .then(() => {
      events.emit("histogram", `Models Tree initial load: ${getCurrentIModelName(context)}`, timer.current.milliseconds);
    })
    .then(() => {
      next();
    });
}

export function loadFirstBranch(context: ScenarioContext, events: EventEmitter, next: Next) {
  const timer = new StopWatch(undefined, true);
  void loadNodes(context, events, createModelsTreeProvider(context, events), (node, index) => node.children && index === 0)
    .then(() => {
      events.emit("histogram", `Models Tree first branch load: ${getCurrentIModelName(context)}`, timer.current.milliseconds);
    })
    .then(() => {
      next();
    });
}

export function loadFullHierarchy(context: ScenarioContext, events: EventEmitter, next: Next) {
  const timer = new StopWatch(undefined, true);
  void loadNodes(context, events, createModelsTreeProvider(context, events), (node) => node.children)
    .then(() => {
      events.emit("histogram", `Models Tree full load: ${getCurrentIModelName(context)}`, timer.current.milliseconds);
    })
    .then(() => {
      next();
    });
}

function createModelsTreeProvider(context: ScenarioContext, events: EventEmitter) {
  const pendingSchemaLoads = new Map<string, Promise<SchemaProps | undefined>>();
  const isTestTerminated = () => context.vars.isTestTerminated;
  async function requestSchemaJson(schemaKey: Readonly<SchemaKey>) {
    const pending = pendingSchemaLoads.get(schemaKey.name);
    if (pending) {
      return pending;
    }
    const body = JSON.stringify([(context.vars.imodelRpcProps as (context: ScenarioContext) => any)(context), schemaKey.name]);
    const promise = doRequest("ECSchemaRpcInterface-2.0.0-getSchemaJSON", body, events, "schema_json")
      .then((schemaJson) => {
        if (isTestTerminated()) {
          ENABLE_REQUESTS_LOGGING && console.log(`Received "schema json" response for ${schemaKey.name}, but the test is terminated, so skip parsing`);
          return undefined;
        }
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
      if (!schemaJson) {
        return undefined;
      }
      try {
        const schemaInfo = await Schema.startLoadingFromJson(schemaJson, schemaContext);
        if (schemaInfo !== undefined && schemaInfo.schemaKey.matches(schemaKey, matchType)) {
          return schemaInfo;
        }
        return undefined;
      } catch (e) {
        if (isTestTerminated()) {
          return undefined;
        }
        throw e;
      }
    },
    async getSchema<T extends Schema>(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<T | undefined> {
      await this.getSchemaInfo(schemaKey, matchType, schemaContext);
      try {
        const schema = await schemaContext.getCachedSchema(schemaKey, matchType);
        return schema as T;
      } catch (e) {
        if (isTestTerminated()) {
          return undefined;
        }
        throw e;
      }
    },
  };
  const schedulingQueryExecutor: DbRequestExecutor<DbQueryRequest, DbQueryResponse> = {
    async execute(request: DbQueryRequest): Promise<DbQueryResponse> {
      const timer = new StopWatch(undefined, true);
      const body = JSON.stringify([(context.vars.imodelRpcProps as (context: ScenarioContext) => any)(context), request]);
      return doRequest("IModelReadRpcInterface-3.6.0-queryRows", body, events, "query_rows").then((response) => {
        ENABLE_REQUESTS_LOGGING && console.log(`Received "query rows" response for \`${request.query}\` in ${timer.current.milliseconds} ms`);
        return response as DbQueryResponse;
      });
    },
  };

  const schemas = new SchemaContext();
  schemas.addLocater(schedulingSchemaLocater);
  const schemaProvider = createECSchemaProvider(schemas);
  const queryExecutor = createECSqlQueryExecutor({
    createQueryReader(ecsql, bindings, config) {
      // eslint-disable-next-line @itwin/no-internal
      return new ECSqlReader(schedulingQueryExecutor, ecsql, bindings, config);
    },
  });
  const imodelAccess = {
    ...schemaProvider,
    ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 1000 }),
    ...createLimitingECSqlQueryExecutor(queryExecutor, 1000),
  };
  const provider = createHierarchyProvider({
    imodelAccess,
    hierarchyDefinition: new ModelsTreeDefinition({
      imodelAccess,
      hierarchyConfig: defaultHierarchyConfiguration,
    }),
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

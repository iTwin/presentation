/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-console */

import { EventEmitter, Next, ScenarioContext } from "artillery";
import { StopWatch } from "@itwin/core-bentley";
import { DbQueryRequest, DbQueryResponse, ECSqlReader, QueryBinder, QueryOptions } from "@itwin/core-common";
import { ISchemaLocater, Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType, SchemaProps } from "@itwin/ecschema-metadata";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createIModelHierarchyProvider, createLimitingECSqlQueryExecutor, HierarchyNode, RowsLimitExceededError } from "@itwin/presentation-hierarchies";
import { defaultHierarchyConfiguration, ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { doRequest, getCurrentIModelName, loadNodes, openIModelConnectionIfNeeded, runQueryViaIModelConnectionOverEach } from "./common";
import { CheckpointConnection } from "@itwin/core-frontend";
import { IModelHost } from "@itwin/core-backend";

console.log(`Frontend PID: ${process.pid}`);
const ENABLE_REQUESTS_LOGGING = false;

export function initScenario(context: ScenarioContext, _events: EventEmitter, next: Next) {
  context.vars.tooLargeHierarchyLevelsCount = 0;
  const iTwinId = "[INSERT ITWIN ID]";
  const iModelId = "[INSERT IMODEL ID]";
  context.vars.imodelRpcProps = () => ({
    iTwinId,
    iModelId,
    key: "[INSERT IMODEL ID]:[INSERT CHANGESET ID]",
    changeset: { index: 4 /* [INSERT CHANGESET INDEX] */, id: "[INSERT CHANGESET ID]" },
  });
  void openIModelConnectionIfNeeded(iTwinId, iModelId).then((checkpointConnection) => {
    if (checkpointConnection !== undefined) {
      context.vars.checkpointConnection = checkpointConnection;
    }
    next();
  });
}

export async function terminateScenario(context: ScenarioContext, _ee: EventEmitter, next: Next) {
  console.log(`Total hierarchy levels that exceeded nodes limit: ${context.vars.tooLargeHierarchyLevelsCount as number}`);
  await IModelHost.shutdown();
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
  const imodelRpcProps = (context.vars.imodelRpcProps as (context: ScenarioContext) => any)(context);
  async function requestSchemaJson(schemaKey: Readonly<SchemaKey>) {
    const pending = pendingSchemaLoads.get(schemaKey.name);
    if (pending) {
      return pending;
    }
    const body = JSON.stringify([imodelRpcProps, schemaKey.name]);
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
        if (schemaInfo !== undefined && schemaInfo.schemaKey.matches(schemaKey as SchemaKey, matchType)) {
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
      await this.getSchemaInfo(schemaKey as SchemaKey, matchType, schemaContext);
      try {
        const schema = await schemaContext.getCachedSchema(schemaKey as SchemaKey, matchType);
        return schema as T;
      } catch (e) {
        if (isTestTerminated()) {
          return undefined;
        }
        throw e;
      }
    },
  };

  const getExecutor = (eventsEm: EventEmitter, runQueryFunc: () => ECSqlReader) => ({
    async execute(request: DbQueryRequest): Promise<DbQueryResponse> {
      const timer = new StopWatch(undefined, true);
      return runQueryViaIModelConnectionOverEach(eventsEm, runQueryFunc).then((response) => {
        ENABLE_REQUESTS_LOGGING && console.log(`Received "query rows" response for \`${request.query}\` in ${timer.current.milliseconds} ms`);
        return response;
      });
    },
  });

  const schemas = new SchemaContext();
  schemas.addLocater(schedulingSchemaLocater);
  const schemaProvider = createECSchemaProvider(schemas);

  const createRunQueryFunc = (ecsql: string, bindings?: QueryBinder, config?: QueryOptions) => {
    return () => (context.vars.checkpointConnection as CheckpointConnection).createQueryReader(ecsql, bindings, config);
  };

  const queryExecutor = createECSqlQueryExecutor({
    createQueryReader(ecsql, bindings, config) {
      // Comment line bellow to run on Fastify backend or uncomment to run on RPC backend
      config = { ...config, priority: 0 };
      const runQueryFunc = createRunQueryFunc(ecsql, bindings, config);
      return new ECSqlReader(getExecutor(events, runQueryFunc), ecsql, bindings, config);
    },
  });

  const imodelAccess = {
    imodelKey: imodelRpcProps.key,
    ...schemaProvider,
    ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 1000 }),
    ...createLimitingECSqlQueryExecutor(queryExecutor, 1000),
  };
  const provider = createIModelHierarchyProvider({
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

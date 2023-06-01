/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @itwin/no-internal */
/* eslint-disable no-console */

import { EventEmitter, Next, RequestParams, ScenarioContext } from "artillery";
import { BeDuration, Guid, StopWatch } from "@itwin/core-bentley";
import { DbQueryRequest, DbQueryResponse, DbRequestExecutor, ECSqlReader } from "@itwin/core-common";
import { ModelsTreeNodesProviderRxjs, TreeNode } from "@itwin/presentation-hierarchy-builder";
import { ISchemaLocater, Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType, SchemaProps } from "@itwin/ecschema-metadata";

const ENABLE_LOGGING = false;

interface QueryRowsRequest {
  type: "query-rows";
  params: DbQueryRequest;
  resolve: (res: DbQueryResponse) => void;
}
interface SchemaJsonRequest {
  type: "schema-json";
  schemaName: string;
  resolve: (schema: SchemaProps) => void;
}
type Req = QueryRowsRequest | SchemaJsonRequest;

function createModelsTreeProvider(context: ScenarioContext) {
  function scheduleRequest(req: Req) {
    let pendingRequests = context.vars.pendingRequests as Array<Req> | undefined;
    if (!pendingRequests) {
      pendingRequests = [];
      context.vars.pendingRequests = pendingRequests;
    }
    pendingRequests.push(req);
  }
  async function requestSchemaJson(schemaKey: Readonly<SchemaKey>) {
    return new Promise<SchemaProps>((resolve, _reject) => {
      scheduleRequest({
        type: "schema-json",
        schemaName: schemaKey.name,
        resolve,
      });
      ENABLE_LOGGING && console.log(`Scheduled "schema json" request for ${schemaKey.name}`);
    }).then((schemaJson) => {
      ENABLE_LOGGING && console.log(`Received "schema json" response for ${schemaKey.name}`);
      return schemaJson;
    });
  }
  const schedulingSchemaLocater: ISchemaLocater = {
    getSchemaSync<T extends Schema>(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): T | undefined {
      const schemaJson = requestSchemaJson(schemaKey);
      const schema = Schema.fromJsonSync(schemaJson, schemaContext);
      if (schema !== undefined && schema.schemaKey.matches(schemaKey, matchType)) {
        return schema as T;
      }
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
      return new Promise<DbQueryResponse>((resolve, _reject) => {
        scheduleRequest({
          type: "query-rows",
          params: request,
          resolve,
        });
        ENABLE_LOGGING && console.log(`Scheduled "query rows" request for ${request.query}`);
      }).then((response: DbQueryResponse) => {
        ENABLE_LOGGING && console.log(`Received "query rows" response for ${request.query}`);
        return response;
      });
    },
  };

  const schemas = new SchemaContext();
  schemas.addLocater(schedulingSchemaLocater);

  return new ModelsTreeNodesProviderRxjs(schemas, {
    createQueryReader(ecsql, bindings, config) {
      // eslint-disable-next-line @itwin/no-internal
      return new ECSqlReader(schedulingQueryExecutor, ecsql, bindings, config);
    },
  });
}

export function initScenario(context: ScenarioContext, _ee: EventEmitter, next: Next) {
  context.vars.provider = createModelsTreeProvider(context);
  context.vars.pendingNodeRequestsCount = 0;
  context.vars.nodesCreated = 0;
  context.vars.tooLargeHierarchyLevelsCount = 0;
  next();
}

export function terminateScenario(context: ScenarioContext, _ee: EventEmitter, next: Next) {
  console.log(`Total nodes created: ${context.vars.nodesCreated}`);
  console.log(`Total hierarchy levels that exceeded nodes limit: ${context.vars.tooLargeHierarchyLevelsCount}`);
  context.vars.nodesCreated = 0;
  context.vars.tooLargeHierarchyLevelsCount = 0;
  context.vars.provider = undefined;
  if (context.vars.pendingNodeRequestsCount !== 0) {
    return next(new Error(`Scenario terminating with ${context.vars.pendingNodeRequestsCount} pending requests.`));
  }
  next();
}

/**
 * Sets up initial request to get root nodes
 */
export function loadHierarchy(context: ScenarioContext, _ee: EventEmitter, next: Next) {
  const provider = context.vars.provider as ModelsTreeNodesProviderRxjs;
  const nodeRequestsTracker = {
    onStart() {
      ++(context.vars.pendingNodeRequestsCount as number);
    },
    onComplete() {
      --(context.vars.pendingNodeRequestsCount as number);
    },
  };
  function scheduleChildNodesRequest(parentNode: TreeNode) {
    ++(context.vars.nodesCreated as number);
    function recursiveReduceArrayChildren(n: TreeNode): TreeNode[] {
      if (n.children === undefined) {
        throw new Error(`Children not determined for ${JSON.stringify(n)}`);
      }
      if (n.children === false) {
        return [];
      }
      if (n.children === true) {
        return [n];
      }
      return n.children.reduce((arr, child) => [...arr, ...recursiveReduceArrayChildren(child)], new Array<TreeNode>());
    }
    recursiveReduceArrayChildren(parentNode).forEach((n) => {
      nodeRequestsTracker.onStart();
      void provider
        .getNodes(n)
        .then((children) => {
          ENABLE_LOGGING && console.log(`Got ${children.length} child nodes for parent ${n.label}`);
          children.forEach((child) => scheduleChildNodesRequest(child));
          nodeRequestsTracker.onComplete();
        })
        .catch((err: Error) => {
          if (err.message === "rows limit exceeded") {
            ++(context.vars.tooLargeHierarchyLevelsCount as number);
          } else {
            console.error(err);
          }
        });
    });
  }

  nodeRequestsTracker.onStart();
  void provider.getNodes(undefined).then((children) => {
    ENABLE_LOGGING && console.log(`Got ${children.length} root nodes`);
    children.forEach((child) => scheduleChildNodesRequest(child));
    nodeRequestsTracker.onComplete();
  });
  next();
}

/**
 * If any, pops a pending request and places it into context as either "query rows" or
 * "schema json" request.
 */
export async function popPendingRequest(context: ScenarioContext, next: Next) {
  const getPendingNodeRequestsCount = () => context.vars.pendingNodeRequestsCount as number;
  ENABLE_LOGGING && console.log(`Pending requests count: ${getPendingNodeRequestsCount()}`);
  const pendingHttpRequests = context.vars.pendingRequests as Array<Req> | undefined;
  const watch = new StopWatch(undefined, true);
  while (getPendingNodeRequestsCount() > 0 && (!pendingHttpRequests || pendingHttpRequests.length === 0)) {
    await BeDuration.wait(1);
  }
  if (getPendingNodeRequestsCount() === 0) {
    return next(false as any);
  }
  const waitTime = watch.current.milliseconds;
  ENABLE_LOGGING && waitTime > 0 && console.log(`Waited ${waitTime} ms for a new request`);

  const pendingRequest = pendingHttpRequests!.shift()!;
  switch (pendingRequest.type) {
    case "query-rows":
      context.vars.pendingQueryRowsRequest = pendingRequest;
      ENABLE_LOGGING && console.log(`Moved "query rows" request into pending list`);
      break;
    case "schema-json":
      context.vars.pendingSchemaJsonRequest = pendingRequest;
      ENABLE_LOGGING && console.log(`Moved "schema json" request into pending list`);
      break;
  }
  next(true as any);
}

/**
 * Creates request params for the `getSchemaJSON` request
 */
export function createSchemaJsonRequestParams(requestParams: RequestParams, context: ScenarioContext, _ee: EventEmitter, next: Next) {
  const req = context.vars.pendingSchemaJsonRequest as SchemaJsonRequest;
  context.vars.pendingSchemaJsonRequest = undefined;
  const activityId = Guid.createValue();
  pushPendingResponse(context, activityId, req);
  requestParams.headers = {
    ["x-correlation-id"]: activityId,
    ["content-type"]: "text/plain",
  };
  requestParams.body = JSON.stringify([
    {
      iTwinId: Guid.empty,
      iModelId: Guid.empty,
      key: context.vars.iModelPath,
      changeset: { index: 0, id: "" },
    },
    req.schemaName,
  ]);
  ENABLE_LOGGING && console.log(`Prepared request params for "schema json" request. Activity ID: ${activityId}`);
  next();
}

/**
 * Creates request params for the `queryRows` request
 */
export function createQueryRowsRequestParams(requestParams: RequestParams, context: ScenarioContext, _ee: EventEmitter, next: Next) {
  const req = context.vars.pendingQueryRowsRequest as QueryRowsRequest;
  context.vars.pendingQueryRowsRequest = undefined;
  const activityId = Guid.createValue();
  pushPendingResponse(context, activityId, req);
  requestParams.headers = {
    ["x-correlation-id"]: activityId,
    ["content-type"]: "text/plain",
  };
  requestParams.body = JSON.stringify([
    {
      iTwinId: Guid.empty,
      iModelId: Guid.empty,
      key: context.vars.iModelPath,
      changeset: { index: 0, id: "" },
    },
    req.params,
  ]);
  ENABLE_LOGGING && console.log(`Prepared request params for "query rows" request. Activity ID: ${activityId}`);
  next();
}

function pushPendingResponse(context: ScenarioContext, activityId: string, req: Req) {
  let pendingResponses = context.vars.pendingResponses as Map<string, Req> | undefined;
  if (!pendingResponses) {
    pendingResponses = new Map();
    context.vars.pendingResponses = pendingResponses;
  }
  pendingResponses.set(activityId, req);
}

/**
 * Finds the request in pending responses map and resolves it.
 */
export function resolveResponse(requestConfig: any, response: any, context: ScenarioContext, _ee: EventEmitter, next: Next) {
  const activityId = requestConfig.headers["x-correlation-id"];
  const pendingResponses = context.vars.pendingResponses as Map<string, Req> | undefined;
  if (!pendingResponses) {
    return next(new Error(`Received a response but there's no pending responses in context. Activity ID: ${activityId}`));
  }
  const req = pendingResponses.get(activityId);
  if (!req) {
    return next(new Error(`Received a response but there's no pending response for it. Activity ID: ${activityId}`));
  }
  pendingResponses.delete(activityId);
  ENABLE_LOGGING && console.log(`Resolving response. Activity ID: ${activityId}`);
  req.resolve(JSON.parse(response.body));
  next();
}

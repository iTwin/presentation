/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @itwin/no-internal */

import { Guid } from "@itwin/core-bentley";
import { DbQueryRequest, DbQueryResponse, DbRequestExecutor, ECSqlReader } from "@itwin/core-common";
import { ISchemaLocater, Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType, SchemaProps } from "@itwin/ecschema-metadata";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { BenchmarkContext } from "./BenchmarkContext";
import { NodeProvider } from "./NodeLoader";
import { RequestHandler } from "./RequestHandler";

console.log(`Frontend PID: ${process.pid}`);
const ENABLE_REQUESTS_LOGGING = false;
const logRequest = ENABLE_REQUESTS_LOGGING ? console.log : undefined;

// eslint-disable-next-line @typescript-eslint/naming-convention
interface iModelInfo {
  iTwinId: string;
  iModelId: string;
  key: string;
  changeset: { index: number; id: string };
}

export class StatelessHierarchyProvider implements NodeProvider<HierarchyNode> {
  private readonly _provider: HierarchyProvider;

  constructor(private readonly _context: BenchmarkContext) {
    this._provider = StatelessHierarchyProvider.createProvider(_context);
  }

  private static createProvider(context: BenchmarkContext) {
    const imodelArg: iModelInfo = {
      iTwinId: Guid.empty,
      iModelId: Guid.empty,
      key: context.vars.currentIModelPath,
      changeset: { index: 0, id: "" },
    };

    const schemas = new SchemaContext();
    const locater = new SchedulingSchemaLocater(imodelArg);
    schemas.addLocater(locater);
    const metadataProvider = createMetadataProvider(schemas);
    const executor = new SchedulingQueryExecutor(imodelArg);

    const provider = new HierarchyProvider({
      metadataProvider,
      hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider }),
      queryExecutor: createLimitingECSqlQueryExecutor(
        createECSqlQueryExecutor({
          createQueryReader(ecsql, bindings, config) {
            // eslint-disable-next-line @itwin/no-internal
            return new ECSqlReader(executor, ecsql, bindings, config);
          },
        }),
        1000,
      ),
    });

    return provider;
  }

  public async getChildren(parent: HierarchyNode | undefined): Promise<HierarchyNode[]> {
    try {
      const nodes = await this._provider.getNodes({ parentNode: parent });
      return nodes;
    } catch (e) {
      if (e instanceof Error && e.message === "rows limit exceeded") {
        ++this._context.vars.tooLargeHierarchyLevelsCount;
        return [];
      }
      throw e;
    }
  }

  public initialHasChildren(node: HierarchyNode): boolean {
    return (node.children === true || (Array.isArray(node.children) && node.children.length > 0)) && !!node.autoExpand;
  }

  public fullHasChildren(node: HierarchyNode): boolean {
    return node.children === true || (Array.isArray(node.children) && node.children.length > 0);
  }
}

class SchedulingSchemaLocater implements ISchemaLocater {
  private readonly _pendingSchemaLoads = new Map<string, Promise<SchemaProps>>();
  constructor(private readonly _imodelArg: iModelInfo) {}

  public getSchemaSync<T extends Schema>(_schemaKey: Readonly<SchemaKey>, _matchType: SchemaMatchType, _schemaContext: SchemaContext): T | undefined {
    console.error(`getSchemaSync not implemented`);
    return undefined;
  }

  public async getSchemaInfo(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<SchemaInfo | undefined> {
    const schemaJson = await this.requestSchemaJson(schemaKey);
    const schemaInfo = await Schema.startLoadingFromJson(schemaJson, schemaContext);
    if (schemaInfo !== undefined && schemaInfo.schemaKey.matches(schemaKey, matchType)) {
      return schemaInfo;
    }
    return undefined;
  }

  public async getSchema<T extends Schema>(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<T | undefined> {
    await this.getSchemaInfo(schemaKey, matchType, schemaContext);
    const schema = await schemaContext.getCachedSchema(schemaKey, matchType);
    return schema as T;
  }

  private async requestSchemaJson(schemaKey: Readonly<SchemaKey>): Promise<SchemaProps> {
    const pending = this._pendingSchemaLoads.get(schemaKey.name);
    if (pending) {
      return pending;
    }

    const promise = this.fetchSchema(schemaKey).finally(() => this._pendingSchemaLoads.delete(schemaKey.name));
    this._pendingSchemaLoads.set(schemaKey.name, promise);
    return promise;
  }

  private async fetchSchema(schemaKey: Readonly<SchemaKey>) {
    const body = JSON.stringify([this._imodelArg, schemaKey.name]);
    const schemaJson = await RequestHandler.doRequest("ECSchemaRpcInterface-2.0.0-getSchemaJSON", body);
    logRequest?.(`Received "schema json" response for ${schemaKey.name}`);
    return schemaJson as SchemaProps;
  }
}

class SchedulingQueryExecutor implements DbRequestExecutor<DbQueryRequest, DbQueryResponse> {
  constructor(private readonly _iModelInfo: iModelInfo) {}

  public async execute(request: DbQueryRequest): Promise<DbQueryResponse> {
    const body = JSON.stringify([this._iModelInfo, request]);
    logRequest?.(`Scheduled "query rows" request for ${request.query}`);
    const response = await RequestHandler.doRequest("IModelReadRpcInterface-3.5.0-queryRows", body);
    logRequest?.(`Received "query rows" response for ${request.query}`);
    return response as DbQueryResponse;
  }
}

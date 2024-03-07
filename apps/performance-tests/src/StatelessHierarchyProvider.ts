/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @itwin/no-internal */

import { expand, filter, from, mergeAll, of, tap } from "rxjs";
import { IModelDb } from "@itwin/core-backend";
import { DbQueryRequest, DbQueryResponse, DbRequestExecutor, DbRequestKind, ECSqlReader } from "@itwin/core-common";
import { ISchemaLocater, Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType } from "@itwin/ecschema-metadata";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";

const ENABLE_SCHEDULED_NODES_LOGGING = false;
const ECSQL_ROW_LIMIT = 1000;

export class StatelessHierarchyProvider {
  private readonly _provider: HierarchyProvider;

  constructor(
    iModelDb: IModelDb,
    private readonly _nodeRequestLimit = 10,
  ) {
    this._provider = createProvider(iModelDb);
  }

  public async loadInitialHierarchy(): Promise<void> {
    await this.loadNodes((node) => node.children && !!node.autoExpand);
  }

  public async loadFullHierarchy(): Promise<void> {
    await this.loadNodes((node) => node.children);
  }

  private async loadNodes(nodeHasChildren: (node: HierarchyNode) => boolean) {
    let nodesCreated = 0;
    let nodesScheduled = 0;
    const timer = ENABLE_SCHEDULED_NODES_LOGGING ? setInterval(() => nodesScheduled && console.log(`Nodes scheduled ${nodesScheduled}`), 1000) : undefined;

    const promise = new Promise<void>((resolve, reject) => {
      const nodesObservable = of<HierarchyNode | undefined>(undefined).pipe(
        expand((parentNode) => {
          ++nodesScheduled;
          return from(this._provider.getNodes({ parentNode })).pipe(
            tap(() => --nodesScheduled),
            mergeAll(),
            filter((node) => nodeHasChildren(node)),
          );
        }, this._nodeRequestLimit),
      );
      nodesObservable.subscribe({
        next() {
          ++nodesCreated;
        },
        complete: resolve,
        error: reject,
      });
    });

    try {
      await promise;
    } finally {
      clearInterval(timer);
    }
    console.log(`Total nodes created: ${nodesCreated}`);
  }
}

function createProvider(iModelDb: IModelDb) {
  const schemas = new SchemaContext();
  const locater = new SchedulingSchemaLocater(iModelDb);
  schemas.addLocater(locater);
  const metadataProvider = createMetadataProvider(schemas);
  const executor = new SchedulingQueryExecutor(iModelDb);

  return new HierarchyProvider({
    metadataProvider,
    hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider }),
    queryExecutor: createLimitingECSqlQueryExecutor(
      createECSqlQueryExecutor({
        createQueryReader(ecsql, bindings, config) {
          // eslint-disable-next-line @itwin/no-internal
          return new ECSqlReader(executor, ecsql, bindings, config);
        },
      }),
      ECSQL_ROW_LIMIT,
    ),
  });
}

class SchedulingSchemaLocater implements ISchemaLocater {
  constructor(private readonly _iModelDb: IModelDb) {}

  public getSchemaSync<T extends Schema>(_schemaKey: Readonly<SchemaKey>, _matchType: SchemaMatchType, _schemaContext: SchemaContext): T | undefined {
    console.error(`getSchemaSync not implemented`);
    return undefined;
  }

  public async getSchemaInfo(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<SchemaInfo | undefined> {
    const schemaJson = this._iModelDb.getSchemaProps(schemaKey.name);
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
}

class SchedulingQueryExecutor implements DbRequestExecutor<DbQueryRequest, DbQueryResponse> {
  constructor(private readonly _iModelDb: IModelDb) {}

  public async execute(request: DbQueryRequest): Promise<DbQueryResponse> {
    return new Promise<DbQueryResponse>((resolve) => {
      request.kind = DbRequestKind.ECSql;
      this._iModelDb.nativeDb.concurrentQueryExecute(request as any, (response: any) => {
        resolve(response as DbQueryResponse);
      });
    });
  }
}

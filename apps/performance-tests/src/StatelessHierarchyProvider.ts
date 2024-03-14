/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expand, filter, from, mergeAll, of } from "rxjs";
import { IModelDb } from "@itwin/core-backend";
import { ISchemaLocater, Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType } from "@itwin/ecschema-metadata";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, HierarchyNode, HierarchyProvider, HierarchyProviderProps } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";

export interface ProviderOptions extends Partial<HierarchyProviderProps> {
  iModel: IModelDb;
  rowLimit?: number | "unbounded";
  nodeRequestLimit?: number;
}

const DEFAULT_ROW_LIMIT = 1000;
const DEFAULT_NODE_REQUEST_LIMIT = 10;

export class StatelessHierarchyProvider {
  private readonly _provider: HierarchyProvider;

  constructor(private readonly _props: ProviderOptions) {
    this._provider = this.createProvider();
  }

  public async loadInitialHierarchy(): Promise<void> {
    await this.loadNodes((node) => node.children && !!node.autoExpand);
  }

  public async loadFullHierarchy(): Promise<void> {
    await this.loadNodes((node) => node.children);
  }

  private async loadNodes(nodeHasChildren: (node: HierarchyNode) => boolean) {
    await new Promise<void>((resolve, reject) => {
      const nodesObservable = of<HierarchyNode | undefined>(undefined).pipe(
        expand((parentNode) => {
          return from(this._provider.getNodes({ parentNode })).pipe(
            mergeAll(),
            filter((node) => nodeHasChildren(node)),
          );
        }, this._props.nodeRequestLimit ?? DEFAULT_NODE_REQUEST_LIMIT),
      );
      nodesObservable.subscribe({
        complete: resolve,
        error: reject,
      });
    });
  }

  private createMetadataProvider() {
    const iModel = this._props.iModel;
    const schemas = new SchemaContext();
    const locater = new IModelDbSchemaLocater(iModel);
    schemas.addLocater(locater);
    return createMetadataProvider(schemas);
  }

  private createProvider() {
    const metadataProvider = this._props.metadataProvider ?? this.createMetadataProvider();
    const rowLimit = this._props.rowLimit ?? DEFAULT_ROW_LIMIT;
    return new HierarchyProvider({
      ...this._props,
      metadataProvider,
      hierarchyDefinition: this._props.hierarchyDefinition ?? new ModelsTreeDefinition({ metadataProvider }),
      queryExecutor: createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(this._props.iModel), rowLimit),
    });
  }
}

export class IModelDbSchemaLocater implements ISchemaLocater {
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
    // eslint-disable-next-line @itwin/no-internal
    const schema = await schemaContext.getCachedSchema(schemaKey, matchType);
    return schema as T;
  }
}

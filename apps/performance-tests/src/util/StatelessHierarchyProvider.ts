/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expand, filter, from, mergeAll, of, tap } from "rxjs";
import { IModelDb } from "@itwin/core-backend";
import { SchemaContext, SchemaJsonLocater } from "@itwin/ecschema-metadata";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import {
  createLimitingECSqlQueryExecutor,
  HierarchyNode,
  HierarchyProvider,
  IHierarchyLevelDefinitionsFactory,
  IMetadataProvider,
} from "@itwin/presentation-hierarchies";

export interface ProviderOptions {
  iModel: IModelDb;
  rowLimit?: number | "unbounded";
  nodeRequestLimit?: number | "unbounded";

  getHierarchyFactory(metadataProvider: IMetadataProvider): IHierarchyLevelDefinitionsFactory;
}

const DEFAULT_ROW_LIMIT = 1000;
const DEFAULT_NODE_REQUEST_LIMIT = 10;

export class StatelessHierarchyProvider {
  private readonly _provider: HierarchyProvider;

  constructor(private readonly _props: ProviderOptions) {
    this._provider = this.createProvider();
  }

  public async loadHierarchy(props?: { depth?: number }): Promise<number> {
    const depth = props?.depth;

    let nodeRequestLimit: number | undefined;
    if (this._props.nodeRequestLimit === undefined) {
      nodeRequestLimit = DEFAULT_NODE_REQUEST_LIMIT;
    } else if (this._props.nodeRequestLimit !== "unbounded") {
      nodeRequestLimit = this._props.nodeRequestLimit;
    }

    let nodeCount = 0;
    return new Promise<number>((resolve, reject) => {
      const nodesObservable = of<HierarchyNode | undefined>(undefined).pipe(
        expand(
          (parentNode) =>
            from(this._provider.getNodes({ parentNode })).pipe(
              mergeAll(),
              tap(() => ++nodeCount),
              filter((node) => node.children && (!depth || getNodeDepth(node) < depth)),
            ),
          nodeRequestLimit,
        ),
      );
      nodesObservable.subscribe({
        complete: () => resolve(nodeCount),
        error: reject,
      });
    });
  }

  private createMetadataProvider() {
    const iModel = this._props.iModel;
    const schemas = new SchemaContext();
    const locater = new SchemaJsonLocater((schemaName) => iModel.getSchemaProps(schemaName));
    schemas.addLocater(locater);
    return createMetadataProvider(schemas);
  }

  private createProvider() {
    const metadataProvider = this.createMetadataProvider();
    const rowLimit = this._props.rowLimit ?? DEFAULT_ROW_LIMIT;
    return new HierarchyProvider({
      metadataProvider,
      hierarchyDefinition: this._props.getHierarchyFactory(metadataProvider),
      queryExecutor: createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(this._props.iModel), rowLimit),
    });
  }
}

function getNodeDepth(node: HierarchyNode): number {
  return node.parentKeys.length + 1;
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { asyncScheduler, expand, filter, finalize, from, observeOn, of, tap } from "rxjs";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createIModelHierarchyProvider, createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { LOGGER } from "../util/Logging.js";

import type { IModelDb } from "@itwin/core-backend";
import type {
  HierarchyDefinition,
  HierarchyNode,
  HierarchyProvider,
  HierarchySearchTree,
  LimitingECSqlQueryExecutor,
} from "@itwin/presentation-hierarchies";
import type { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";

interface ProviderOptionsBase {
  rowLimit?: number | "unbounded";
  getHierarchyFactory(imodelAccess: ECSchemaProvider & ECClassHierarchyInspector): HierarchyDefinition;
  search?: { paths: HierarchySearchTree[] };
}
type ProviderOptionsWithIModel = { iModel: IModelDb } & ProviderOptionsBase;

type ProviderOptionsWithIModelAccess = { imodelAccess: IModelAccess } & ProviderOptionsBase;

type ProviderOptions = ProviderOptionsWithIModel | ProviderOptionsWithIModelAccess;

const LOG_CATEGORY = "Presentation.PerformanceTests.StatelessHierarchyProvider";

function log(messageOrCallback: string | (() => string)) {
  if (LOGGER.isEnabled(LOG_CATEGORY, "trace")) {
    LOGGER.logTrace(LOG_CATEGORY, typeof messageOrCallback === "string" ? messageOrCallback : messageOrCallback());
  }
}

const DEFAULT_ROW_LIMIT = 1000;

export type IModelAccess = ECSchemaProvider &
  ECClassHierarchyInspector &
  LimitingECSqlQueryExecutor & { imodelKey: string };

export class StatelessHierarchyProvider {
  private constructor(private readonly _provider: HierarchyProvider) {}

  public async loadHierarchy(props?: { depth?: number }): Promise<number> {
    const depth = props?.depth;

    let nodeCount = 0;
    return new Promise<number>((resolve, reject) => {
      const nodesObservable = of<HierarchyNode | undefined>(undefined).pipe(
        expand((parentNode) => {
          const parentNodeLabel = parentNode ? parentNode.label : "<root>";
          log(`Requesting children for ${parentNodeLabel}`);
          return from(this._provider.getNodes({ parentNode })).pipe(
            finalize(() => {
              log(`Got children for ${parentNodeLabel}`);
            }),
            tap(() => ++nodeCount),
            filter((node) => node.children && (!depth || getNodeDepth(node) < depth)),
            observeOn(asyncScheduler),
          );
        }, 1),
      );
      nodesObservable.subscribe({ complete: () => resolve(nodeCount), error: reject });
    });
  }

  public static async create(props: ProviderOptions): Promise<StatelessHierarchyProvider> {
    const imodelAccess =
      "iModel" in props
        ? await StatelessHierarchyProvider.createIModelAccess(props.iModel, props.rowLimit)
        : props.imodelAccess;
    const hierarchyProvider = createIModelHierarchyProvider({
      imodelAccess,
      hierarchyDefinition: props.getHierarchyFactory(imodelAccess),
      queryCacheSize: 0,
      search: props.search ? { paths: props.search.paths } : undefined,
    });
    return new StatelessHierarchyProvider(hierarchyProvider);
  }

  public static async createIModelAccess(iModel: IModelDb, rowLimit?: number | "unbounded"): Promise<IModelAccess> {
    const schemaProvider = createECSchemaProvider(iModel);
    const rowLimitToUse = rowLimit ?? DEFAULT_ROW_LIMIT;
    const imodelAccess = {
      imodelKey: iModel.key,
      ...schemaProvider,
      ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 1000 }),
      ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(iModel), rowLimitToUse),
    };
    return imodelAccess;
  }
}

function getNodeDepth(node: HierarchyNode): number {
  return node.parentKeys.length + 1;
}

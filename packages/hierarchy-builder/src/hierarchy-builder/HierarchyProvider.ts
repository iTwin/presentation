/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { catchError, concatAll, concatMap, defaultIfEmpty, from, map, mergeMap, Observable, ObservableInput, of, shareReplay, take, tap } from "rxjs";
import { Id64 } from "@itwin/core-bentley";
import { HierarchyNodesDefinition, IHierarchyLevelDefinitionsFactory } from "./HierarchyDefinition";
import { HierarchyNode } from "./HierarchyNode";
import { createClassGroupingOperator } from "./internal/operators/ClassGrouping";
import { createDetermineChildrenOperator } from "./internal/operators/DetermineChildren";
import { createHideIfNoChildrenOperator } from "./internal/operators/HideIfNoChildren";
import { createHideNodesInHierarchyOperator } from "./internal/operators/HideNodesInHierarchy";
import { createMergeInstanceNodesByLabelOperator } from "./internal/operators/MergeInstanceNodesByLabel";
import { createPersistChildrenOperator } from "./internal/operators/PersistChildren";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting";
import { supplyIconsOperator } from "./internal/operators/SupplyIcons";
import { QueryScheduler } from "./internal/QueryScheduler";
import { applyLimit, TreeQueryResultsReader } from "./internal/TreeNodesReader";
import { IMetadataProvider } from "./Metadata";
import { IQueryExecutor } from "./queries/IQueryExecutor";

/** @beta */
export interface HierarchyProviderProps {
  metadataProvider: IMetadataProvider;
  queryExecutor: IQueryExecutor;
  hierarchyDefinition: IHierarchyLevelDefinitionsFactory;
}

/** @beta */
export class HierarchyProvider {
  private _metadataProvider: IMetadataProvider;
  private _hierarchyFactory: IHierarchyLevelDefinitionsFactory;
  private _queryExecutor: IQueryExecutor;
  private _queryReader: TreeQueryResultsReader;
  private _scheduler: QueryScheduler<HierarchyNode[]>;
  private _directNodesCache: Map<string, Observable<HierarchyNode>>;

  public constructor(props: HierarchyProviderProps) {
    this._metadataProvider = props.metadataProvider;
    this._hierarchyFactory = props.hierarchyDefinition;
    this._queryExecutor = props.queryExecutor;
    this._queryReader = new TreeQueryResultsReader();
    this._scheduler = new QueryScheduler();
    this._directNodesCache = new Map();
  }

  private loadDirectNodes(parentNode: HierarchyNode | undefined): Observable<HierarchyNode> {
    const enableLogging = false;
    // stream hierarchy level definitions in order
    const definitions = from(this._hierarchyFactory.defineHierarchyLevel(parentNode)).pipe(
      concatMap((hierarchyLevelDefinition) => from(hierarchyLevelDefinition)),
    );
    // pipe definitions to nodes
    const nodes = definitions.pipe(
      concatMap((def): ObservableInput<HierarchyNode[]> => {
        if (HierarchyNodesDefinition.isCustomNode(def)) {
          return of([def.node]);
        }
        return this._scheduler.scheduleSubscription(
          of(def.query).pipe(
            tap(() => enableLogging && console.log(`[loadDirectNodes] Do query for ${parentNode ? JSON.stringify(parentNode) : "<root>"}`)),
            mergeMap((query) => from(this._queryReader.read(this._queryExecutor, { ...query, ecsql: applyLimit(query.ecsql, query.ctes) }))),
          ),
        );
      }),
      concatAll(),
    );
    return nodes.pipe(map(convertECInstanceIdSuffixToBase36), shareReplay());
  }

  private ensureDirectChildren(parentNode: HierarchyNode | undefined): Observable<HierarchyNode> {
    const enableLogging = false;
    const key = parentNode ? `${JSON.stringify(parentNode.key)}+${JSON.stringify(parentNode.extendedData)}` : "";

    const cached = this._directNodesCache.get(key);
    if (cached) {
      enableLogging && console.log(`[ensureDirectChildren] Found direct nodes observable for ${parentNode ? parentNode.label : "<root>"}`);
      return cached;
    }

    const obs = this.loadDirectNodes(parentNode);
    this._directNodesCache.set(key, obs);
    enableLogging && console.log(`[ensureDirectChildren] Saved direct nodes observable for ${parentNode ? parentNode.label : "<root>"}`);
    return obs;
  }

  private getNodesObservable(parentNode: HierarchyNode | undefined): Observable<HierarchyNode> {
    if (parentNode && Array.isArray(parentNode.children)) {
      return from(parentNode.children);
    }

    const directChildren = this.ensureDirectChildren(parentNode);
    const result = directChildren.pipe(
      createMergeInstanceNodesByLabelOperator(this._directNodesCache),
      createHideIfNoChildrenOperator((n) => this.hasNodesObservable(n), false),
      createHideNodesInHierarchyOperator((n) => this.getNodesObservable(n), this._directNodesCache, false),
      sortNodesByLabelOperator,
      createClassGroupingOperator(this._metadataProvider),
    );
    return parentNode ? result.pipe(createPersistChildrenOperator(parentNode)) : result;
  }

  public async getNodes(parentNode: HierarchyNode | undefined): Promise<HierarchyNode[]> {
    return new Promise((resolve, reject) => {
      const nodes = new Array<HierarchyNode>();
      this.getNodesObservable(parentNode)
        // finalize before returning
        .pipe(
          createDetermineChildrenOperator((n) => this.hasNodesObservable(n)),
          supplyIconsOperator,
        )
        // load all nodes into the array and resolve
        .subscribe({
          next(node) {
            nodes.push(node);
          },
          error(err) {
            reject(err);
          },
          complete() {
            resolve(nodes);
          },
        });
    });
  }

  private hasNodesObservable(node: HierarchyNode): Observable<boolean> {
    const enableLogging = false;
    if (Array.isArray(node.children)) {
      return of(node.children.length > 0);
    }

    const directChildren = this.ensureDirectChildren(node);
    return directChildren
      .pipe(
        tap((n) => enableLogging && console.log(`HasNodes: partial node before HideIfNoChildrenOperator: ${JSON.stringify(n)}`)),
        createHideIfNoChildrenOperator((n) => this.hasNodesObservable(n), true),
        tap((n) => enableLogging && console.log(`HasNodes: partial node before HideNodesInHierarchyOperator: ${JSON.stringify(n)}`)),
        createHideNodesInHierarchyOperator((n) => this.getNodesObservable(n), this._directNodesCache, true),
      )
      .pipe(
        tap((n) => enableLogging && console.log(`HasNodes: partial node before mapping to 'true': ${JSON.stringify(n)}`)),
        map(() => true),
        take(1),
        defaultIfEmpty(false),
        catchError((e: Error) => {
          enableLogging && console.log(`HasNodes: error while determining children: ${e.message}`);
          if (e.message === "rows limit exceeded") {
            return of(true);
          }
          throw e;
        }),
        tap((r) => enableLogging && console.log(`HasNodes: result: ${r}`)),
      );
  }

  public async hasNodes(node: HierarchyNode): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.hasNodesObservable(node)
        .pipe(take(1))
        .subscribe({
          next(res) {
            resolve(res);
          },
          error(err) {
            reject(err);
          },
        });
    });
  }
}

/**
 * This is required because we don't have a way to convert a number to base36 through ECSQL. Need to
 * talk with ECSQL guys.
 */
function convertECInstanceIdSuffixToBase36<TNode extends { label: string }>(node: TNode): TNode {
  const m = node.label.match(/\s\[(0x[\w\d]+)\]$/);
  const suffix = m?.at(1);
  if (!suffix) {
    return node;
  }

  const suffixBase36 = `${Id64.getBriefcaseId(suffix).toString(36).toLocaleUpperCase()}-${Id64.getLocalId(suffix).toString(36).toLocaleUpperCase()}`;
  const label = `${node.label.substring(0, m!.index)} [${suffixBase36}]`;
  return {
    ...node,
    label,
  };
}

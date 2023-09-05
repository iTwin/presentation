/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { catchError, defaultIfEmpty, from, map, mergeAll, mergeMap, Observable, of, shareReplay, take, tap } from "rxjs";
import { Id64 } from "@itwin/core-bentley";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { InProgressTreeNode } from "./internal/Common";
import { createClassGroupingReducer } from "./internal/operators/ClassGrouping";
import { createDetermineChildrenReducer } from "./internal/operators/DetermineChildren";
import { createHideIfNoChildrenReducer } from "./internal/operators/HideIfNoChildren";
import { createHideNodesInHierarchyReducer } from "./internal/operators/HideNodesInHierarchy";
import { createMergeInstanceNodesByLabelReducer } from "./internal/operators/MergeInstanceNodesByLabel";
import { createPersistChildrenReducer } from "./internal/operators/PersistChildren";
import { sortNodesByLabelReducer } from "./internal/operators/Sorting";
import { supplyIconsReducer } from "./internal/operators/SupplyIcons";
import { QueryScheduler } from "./internal/QueryScheduler";
import { applyLimit, TreeQueryResultsReader } from "./internal/TreeNodesReader";
import { IQueryExecutor } from "./IQueryExecutor";
import { TreeNode } from "./TreeNode";
import { ITreeQueryBuilder } from "./TreeQueryBuilder";

/** @beta */
export interface TreeNodesProviderProps {
  schemas: SchemaContext;
  queryExecutor: IQueryExecutor;
  queryBuilder: ITreeQueryBuilder;
}

/** @beta */
export class TreeNodesProvider {
  private _schemas: SchemaContext;
  private _queryBuilder: ITreeQueryBuilder;
  private _queryExecutor: IQueryExecutor;
  private _queryReader: TreeQueryResultsReader;
  private _scheduler: QueryScheduler<InProgressTreeNode[]>;
  private _directNodesCache: Map<string, Observable<InProgressTreeNode>>;

  public constructor(props: TreeNodesProviderProps) {
    this._schemas = props.schemas;
    this._queryBuilder = props.queryBuilder;
    this._queryExecutor = props.queryExecutor;
    this._queryReader = new TreeQueryResultsReader();
    this._scheduler = new QueryScheduler();
    this._directNodesCache = new Map();
  }

  private loadDirectNodes(parentNode: TreeNode | undefined): Observable<InProgressTreeNode> {
    const enableLogging = false;
    return from(this._queryBuilder.createQueries(parentNode)).pipe(
      mergeMap((queries) => from(queries)),
      (queryObservable) =>
        this._scheduler.scheduleSubscription(
          queryObservable.pipe(
            tap(() => enableLogging && console.log(`[loadDirectNodes] Do query for ${parentNode ? JSON.stringify(parentNode) : "<root>"}`)),
            mergeMap((query) => from(this._queryReader.read(this._queryExecutor, { ...query, ecsql: applyLimit(query.ecsql, query.ctes) }))),
          ),
        ),
      mergeAll(),
      map(convertECInstanceIdSuffixToBase36),
      shareReplay(),
    );
  }

  private ensureDirectChildren(parentNode: TreeNode | undefined): Observable<InProgressTreeNode> {
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

  private getNodesObservable(parentNode: TreeNode | undefined): Observable<InProgressTreeNode> {
    if (parentNode && Array.isArray(parentNode.children)) {
      return from(parentNode.children);
    }

    const directChildren = this.ensureDirectChildren(parentNode);
    const result = directChildren.pipe(
      createMergeInstanceNodesByLabelReducer(this._directNodesCache),
      createHideIfNoChildrenReducer((n) => this.hasNodes(n), false),
      createHideNodesInHierarchyReducer((n) => this.getNodesObservable(n), this._directNodesCache, false),
      sortNodesByLabelReducer,
      createClassGroupingReducer(this._schemas),
    );
    return parentNode ? result.pipe(createPersistChildrenReducer(parentNode)) : result;
  }

  public async getNodes(parentNode: TreeNode | undefined): Promise<TreeNode[]> {
    return new Promise((resolve, reject) => {
      const nodes = new Array<TreeNode>();
      this.getNodesObservable(parentNode)
        // finalize before returning
        .pipe(
          createDetermineChildrenReducer((n) => this.hasNodes(n)),
          supplyIconsReducer,
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

  public hasNodes(node: TreeNode): Observable<boolean> {
    const enableLogging = false;
    if (Array.isArray(node.children)) {
      return of(node.children.length > 0);
    }

    const directChildren = this.ensureDirectChildren(node);
    return directChildren
      .pipe(
        tap((n) => enableLogging && console.log(`HasNodes: partial node before HideIfNoChildrenReducer: ${JSON.stringify(n)}`)),
        createHideIfNoChildrenReducer((n) => this.hasNodes(n), true),
        tap((n) => enableLogging && console.log(`HasNodes: partial node before HideNodesInHierarchyReducer: ${JSON.stringify(n)}`)),
        createHideNodesInHierarchyReducer((n) => this.getNodesObservable(n), this._directNodesCache, true),
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

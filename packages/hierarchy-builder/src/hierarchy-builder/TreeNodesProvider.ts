/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { assert, DuplicatePolicy, Id64, SortedArray } from "@itwin/core-bentley";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ClassInfo } from "@itwin/presentation-common";
import naturalCompare from "natural-compare-lite";
import { getClass, mergeInstanceNodes } from "./Common";
import { InProgressTreeNode, TreeNode } from "./TreeNode";
import { applyLimit, TreeQueryResultsReader } from "./TreeNodesReader";
import {
  asapScheduler,
  catchError,
  Connectable,
  connectable,
  defaultIfEmpty,
  defer,
  EMPTY,
  filter,
  finalize,
  from,
  iif,
  map,
  merge,
  mergeAll,
  mergeMap,
  Observable,
  observeOn,
  of,
  onErrorResumeNext,
  partition,
  queueScheduler,
  reduce,
  share,
  shareReplay,
  Subject,
  subscribeOn,
  take,
  tap,
  toArray,
} from "rxjs";
import { ITreeQueryBuilder } from "./TreeQueryBuilder";
import { IQueryExecutor } from "./IQueryExecutor";

const QUERY_CONCURRENCY = 10;
class QueryScheduler<T> {
  private _scheduler = new Subject<Connectable<T>>();
  constructor() {
    this._scheduler
      .pipe(
        mergeMap((sourceObservable) => {
          // Connect the observable
          sourceObservable.connect();
          return sourceObservable.pipe(
            // Guard against stack overflow when a lot of observables are scheduled. Without this operation `mergeMap`
            // will process each observable that is present in the pipeline recursively.
            observeOn(queueScheduler),
            // Delay the connection until another event loop task
            subscribeOn(asapScheduler),
            // Ignore errors in this pipeline without suppressing them for other subscribers
            onErrorResumeNext,
          );
        }, QUERY_CONCURRENCY),
      )
      // Start consuming scheduled observables
      .subscribe();
  }
  /**
   * Schedules `source` for subscription in the current scheduler.
   *
   * The actual scheduling is performed when the returned observable is subscribed to. To cancel, remove all subscribers
   * from the returned observable.
   *
   * @param source Input observable for which to schedule a subscription.
   * @returns Hot observable which starts emitting `source` values after subscription.
   */
  public scheduleSubscription(source: Observable<T>): Observable<T> {
    return defer(() => {
      let unsubscribed = false;
      const connectableObservable = connectable(iif(() => unsubscribed, EMPTY, source));
      this._scheduler.next(connectableObservable);
      return connectableObservable.pipe(
        finalize(() => {
          unsubscribed = true;
        }),
      );
    });
  }
}

export interface TreeNodesProviderProps {
  schemas: SchemaContext;
  queryBuilder: ITreeQueryBuilder;
  queryExecutor: IQueryExecutor;
}

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
    const key = parentNode ? JSON.stringify(parentNode.key) : "";

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

  public getNodesObservable(parentNode: TreeNode | undefined): Observable<InProgressTreeNode> {
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

function createPersistChildrenReducer(parentNode: TreeNode) {
  return function (nodes: Observable<InProgressTreeNode>): Observable<InProgressTreeNode> {
    nodes.pipe(
      reduce((acc, node) => [...acc, node], new Array<InProgressTreeNode>()),
      tap((list) => {
        if (Object.isExtensible(parentNode)) {
          parentNode.children = list;
        } else {
          // eslint-disable-next-line no-console
          console.log(`node ${parentNode.label} not extensible for setting children`);
        }
      }),
    );
    return nodes;
  };
}

function createDetermineChildrenReducer(hasNodes: (node: InProgressTreeNode) => Observable<boolean>) {
  const enableLogging = false;
  return function (nodes: Observable<InProgressTreeNode>): Observable<InProgressTreeNode> {
    const [determined, undetermined] = partition(nodes.pipe(share()), (node) => node.children !== undefined);
    return merge(
      determined,
      undetermined.pipe(
        mergeMap((n) =>
          hasNodes(n).pipe(
            map((children) => {
              enableLogging && console.log(`DetermineChildrenReducer: children for ${n.label}: ${children}`);
              return { ...n, children };
            }),
          ),
        ),
      ),
    ).pipe(tap((node) => enableLogging && console.log(`DetermineChildrenReducer partial: ${node.label}: ${node.children}`)));
  };
}

function createHideNodesInHierarchyReducer(
  getNodes: (parentNode: InProgressTreeNode) => Observable<InProgressTreeNode>,
  directNodesCache: Map<string, Observable<InProgressTreeNode>>,
  stopOnFirstChild: boolean,
) {
  const enableLogging = false;
  function addToMergeMap(list: Map<string, InProgressTreeNode>, node: InProgressTreeNode) {
    if (node.key.type !== "instances" || node.key.instanceKeys.length === 0) {
      return;
    }
    const fullClassName = node.key.instanceKeys[0].className;
    const merged = list.get(fullClassName);
    if (merged) {
      list.set(fullClassName, mergeInstanceNodesObs(merged, node, directNodesCache));
    } else {
      list.set(fullClassName, node);
    }
  }
  return function (nodes: Observable<InProgressTreeNode>): Observable<InProgressTreeNode> {
    const sharedNodes = nodes.pipe(
      tap((n) => `HideNodesInHierarchyReducer in: ${n.label}`),
      share(),
    );
    const [withFlag, withoutFlag] = partition(sharedNodes, (node) => !!node.hideInHierarchy);
    const [withChildren, withoutChildren] = partition(withFlag, (node) => Array.isArray(node.children));
    return merge(
      withoutFlag,
      withChildren.pipe(mergeMap((parent) => from(parent.children as InProgressTreeNode[]))),
      ...(stopOnFirstChild
        ? [
            // a small hack to handle situation when we're here to only check if parent node has children and one of them has `hideIfNoChildren` flag
            // with a `hasChildren = true` - we just return the hidden node itself in that case to avoid digging deeper into the hierarchy
            sharedNodes.pipe(
              filter((n) => n.children === true),
              take(1),
            ),
          ]
        : []),
      withoutChildren.pipe(
        filter((node) => node.children !== false),
        reduce((acc, node) => {
          addToMergeMap(acc, node);
          return acc;
        }, new Map<string, InProgressTreeNode>()),
        mergeMap((mergedNodes) => [...mergedNodes.values()].map((mergedNode) => defer(() => getNodes(mergedNode)))),
        mergeAll(),
      ),
    ).pipe(tap((node) => enableLogging && console.log(`HideNodesInHierarchyReducer out: ${node.label}`)));
  };
}

export function createHideIfNoChildrenReducer(hasNodes: (node: InProgressTreeNode) => Observable<boolean>, stopOnFirstChild: boolean) {
  const enableLogging = false;
  function hasChildren(node: TreeNode) {
    return node.children === true || (Array.isArray(node.children) && node.children.length > 0);
  }
  return function (nodes: Observable<InProgressTreeNode>): Observable<InProgressTreeNode> {
    const [needsHide, doesntNeedHide] = partition(
      nodes.pipe(
        tap((n) => `HideIfNoChildrenReducer in: ${n.label}`),
        share(),
      ),
      (n) => !!n.hideIfNoChildren,
    );
    const [determinedChildren, undeterminedChildren] = partition(needsHide, (n) => n.children !== undefined);
    return merge(
      doesntNeedHide.pipe(tap((n) => enableLogging && console.log(`HideIfNoChildrenReducer: doesnt need hide: ${n.label}`))),
      merge(
        determinedChildren.pipe(tap((n) => enableLogging && console.log(`HideIfNoChildrenReducer: needs hide, has children: ${n.label}`))),
        undeterminedChildren.pipe(
          tap((n) => enableLogging && console.log(`HideIfNoChildrenReducer: needs hide, needs children: ${n.label}`)),
          mergeMap(
            (n) =>
              defer(() => {
                enableLogging && console.log(`HideIfNoChildrenReducer: requesting children flag for ${n.label}`);
                return hasNodes(n).pipe(
                  map((children) => {
                    enableLogging && console.log(`HideIfNoChildrenReducer: children for ${n.label}: ${children}`);
                    return { ...n, children };
                  }),
                );
              }),
            // when checking for children, determine children one-by-one using a depth-first approach to avoid starting too many queries
            stopOnFirstChild ? 1 : undefined,
          ),
          tap((n) => enableLogging && console.log(`HideIfNoChildrenReducer: needs hide, determined children: ${n.label} / ${hasChildren(n)}`)),
        ),
      ).pipe(filter(hasChildren)),
    ).pipe(tap((node) => enableLogging && console.log(`HideIfNoChildrenReducer out: ${node.label}: ${node.children}`)));
  };
}

export function createMergeInstanceNodesByLabelReducer(directNodesCache: Map<string, Observable<InProgressTreeNode>>) {
  return function mergeInstanceNodesByLabelReducer(nodes: Observable<InProgressTreeNode>): Observable<InProgressTreeNode> {
    const enableLogging = false;
    class SortedNodesList extends SortedArray<InProgressTreeNode> {
      public constructor() {
        const comp = (lhs: InProgressTreeNode, rhs: InProgressTreeNode): number => {
          const labelCompare = lhs.label.localeCompare(rhs.label);
          if (labelCompare !== 0) {
            return labelCompare;
          }
          return (lhs.mergeByLabelId ?? "").localeCompare(rhs.mergeByLabelId ?? "");
        };
        super(comp, DuplicatePolicy.Retain);
      }
      public replace(pos: number, replacement: InProgressTreeNode) {
        assert(this._compare(this._array[pos], replacement) === 0);
        this._array[pos] = replacement;
      }
    }
    function tryMergeNodes(lhs: InProgressTreeNode, rhs: InProgressTreeNode): InProgressTreeNode | undefined {
      if (lhs.mergeByLabelId !== rhs.mergeByLabelId) {
        return undefined;
      }
      if (lhs.label !== rhs.label) {
        return undefined;
      }
      return mergeInstanceNodesObs(lhs, rhs, directNodesCache);
    }
    const [merged, nonMerged] = partition(
      nodes.pipe(
        tap((n) => enableLogging && console.log(`MergeInstanceNodesByLabelReducer in: ${JSON.stringify(n)}`)),
        share(),
      ),
      (node) => !!node.mergeByLabelId,
    );
    const res = merge(
      nonMerged,
      merged.pipe(
        reduce((acc, node) => {
          enableLogging && console.log(`reduce with ${JSON.stringify(node)}`);
          const pos = acc.insert(node);
          const nodeAtPos = acc.get(pos)!;
          if (nodeAtPos !== node) {
            const mergedNode = tryMergeNodes(nodeAtPos, node);
            if (mergedNode) {
              mergeDirectNodeObservables(nodeAtPos, node, mergedNode, directNodesCache);
              acc.replace(pos, mergedNode);
            }
          }
          return acc;
        }, new SortedNodesList()),
        mergeMap((list) => from(list.extractArray())),
      ),
    ).pipe(
      tap((n) => {
        enableLogging && console.log(`MergeInstanceNodesByLabelReducer out: ${JSON.stringify(n)}`);
      }),
    );
    return res;
  };
}

function createClassGroupingReducer(schemas: SchemaContext) {
  interface ClassGroupingInformation {
    ungrouped: Array<InProgressTreeNode>;
    grouped: Map<string, { class: ClassInfo; groupedNodes: Array<InProgressTreeNode> }>;
  }
  async function createClassGroupingInformation(nodes: InProgressTreeNode[]): Promise<ClassGroupingInformation> {
    const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
    for (const node of nodes) {
      if (node.key.type === "instances" && node.groupByClass) {
        const fullClassName = node.key.instanceKeys[0].className;
        let groupingInfo = groupings.grouped.get(fullClassName);
        if (!groupingInfo) {
          const nodeClass = await getClass(schemas, fullClassName);
          groupingInfo = {
            class: { id: Id64.invalid, name: nodeClass.fullName.replace(".", ":"), label: nodeClass.label ?? nodeClass.name },
            groupedNodes: [],
          };
          groupings.grouped.set(fullClassName, groupingInfo);
        }
        groupingInfo.groupedNodes.push(node);
      } else {
        groupings.ungrouped.push(node);
      }
    }
    return groupings;
  }
  function groupNodes(groupings: ClassGroupingInformation): InProgressTreeNode[] & { hasClassGroupingNodes?: boolean } {
    const outNodes = new Array<InProgressTreeNode>();
    groupings.grouped.forEach((entry) => {
      outNodes.push({
        label: entry.class.label,
        key: {
          type: "class-grouping",
          class: entry.class,
        },
        children: entry.groupedNodes,
      });
    });
    outNodes.push(...groupings.ungrouped);
    (outNodes as any).hasClassGroupingNodes = groupings.grouped.size > 0;
    return outNodes;
  }
  return function (nodes: Observable<InProgressTreeNode>): Observable<InProgressTreeNode> {
    return nodes.pipe(
      toArray(),
      mergeMap((resolvedNodes) => from(createClassGroupingInformation(resolvedNodes))),
      mergeMap((groupings) => {
        const grouped = groupNodes(groupings);
        const obs = from(grouped);
        return grouped.hasClassGroupingNodes ? obs.pipe(sortNodesByLabelReducer) : obs;
      }),
    );
  };
}

function sortNodesByLabelReducer(nodes: Observable<TreeNode>): Observable<TreeNode> {
  return nodes.pipe(
    toArray(),
    mergeMap((allNodes) => allNodes.sort((lhs, rhs) => naturalCompare(lhs.label.toLocaleLowerCase(), rhs.label.toLocaleLowerCase()))),
  );
}

function supplyIconsReducer(nodes: Observable<TreeNode>): Observable<TreeNode> {
  return nodes.pipe(
    map((node) => {
      if (node.key.type !== "class-grouping") {
        return node;
      }
      return { ...node, extendedData: { ...node.extendedData, imageId: "icon-ec-class" } };
    }),
  );
}

function mergeInstanceNodesObs(lhs: InProgressTreeNode, rhs: InProgressTreeNode, directNodesCache: Map<string, Observable<InProgressTreeNode>>) {
  const merged = mergeInstanceNodes<Observable<InProgressTreeNode>>(lhs, rhs, () => from<InProgressTreeNode[]>([]));
  mergeDirectNodeObservables(lhs, rhs, merged, directNodesCache);
  return merged;
}

function mergeDirectNodeObservables(a: InProgressTreeNode, b: InProgressTreeNode, m: InProgressTreeNode, cache: Map<string, Observable<InProgressTreeNode>>) {
  const cachedA = cache.get(JSON.stringify(a.key));
  if (!cachedA) {
    return;
  }
  const cachedB = cache.get(JSON.stringify(b.key));
  if (!cachedB) {
    return;
  }
  const merged = merge(cachedA, cachedB);
  cache.set(JSON.stringify(m.key), merged);
}

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

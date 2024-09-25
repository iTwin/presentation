/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  catchError,
  concat,
  defaultIfEmpty,
  defer,
  EMPTY,
  filter,
  finalize,
  from,
  map,
  merge,
  mergeAll,
  mergeMap,
  Observable,
  ObservableInput,
  of,
  take,
  tap,
} from "rxjs";
import { assert, StopWatch } from "@itwin/core-bentley";
import {
  ConcatenatedValue,
  createDefaultValueFormatter,
  ECClassHierarchyInspector,
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryDef,
  Event,
  formatConcatenatedValue,
  InstanceKey,
  IPrimitiveValueFormatter,
  normalizeFullClassName,
} from "@itwin/presentation-shared";
import { RowsLimitExceededError } from "../HierarchyErrors";
import { HierarchyFilteringPath } from "../HierarchyFiltering";
import { HierarchyNode, NonGroupingHierarchyNode, ParentHierarchyNode } from "../HierarchyNode";
import { InstancesNodeKey } from "../HierarchyNodeKey";
import { GetHierarchyNodesProps, HierarchyProvider } from "../HierarchyProvider";
import {
  LOGGING_NAMESPACE as BASE_LOGGING_NAMESPACE,
  LOGGING_NAMESPACE_INTERNAL as BASE_LOGGING_NAMESPACE_INTERNAL,
  LOGGING_NAMESPACE_PERFORMANCE as BASE_LOGGING_NAMESPACE_PERFORMANCE,
  createNodeIdentifierForLogging,
  hasChildren,
} from "../internal/Common";
import { eachValueFrom } from "../internal/EachValueFrom";
import { doLog, log } from "../internal/LoggingUtils";
import { partition } from "../internal/operators/Partition";
import { reduceToMergeMapList } from "../internal/operators/ReduceToMergeMap";
import { shareReplayWithErrors } from "../internal/operators/ShareReplayWithErrors";
import { sortNodesByLabelOperator } from "../internal/operators/Sorting";
import { SubscriptionScheduler } from "../internal/SubscriptionScheduler";
import { FilteringHierarchyDefinition } from "./FilteringHierarchyDefinition";
import { HierarchyCache } from "./HierarchyCache";
import { DefineHierarchyLevelProps, HierarchyDefinition, HierarchyNodesDefinition } from "./IModelHierarchyDefinition";
import {
  ProcessedGenericHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceHierarchyNode,
} from "./IModelHierarchyNode";
import { LimitingECSqlQueryExecutor } from "./LimitingECSqlQueryExecutor";
import { NodeSelectClauseColumnNames } from "./NodeSelectQueryFactory";
import { createDetermineChildrenOperator } from "./operators/DetermineChildren";
import { createGroupingOperator } from "./operators/Grouping";
import { createHideIfNoChildrenOperator } from "./operators/HideIfNoChildren";
import { createHideNodesInHierarchyOperator } from "./operators/HideNodesInHierarchy";
import { readNodes } from "./TreeNodesReader";

const LOGGING_NAMESPACE = `${BASE_LOGGING_NAMESPACE}.IModelHierarchyProvider`;
const LOGGING_NAMESPACE_INTERNAL = `${BASE_LOGGING_NAMESPACE_INTERNAL}.IModelHierarchyProvider`;
const LOGGING_NAMESPACE_PERFORMANCE = `${BASE_LOGGING_NAMESPACE_PERFORMANCE}.IModelHierarchyProvider`;

const DEFAULT_QUERY_CONCURRENCY = 10;
const DEFAULT_QUERY_CACHE_SIZE = 1;

/**
 * Defines the strings used by hierarchy provider.
 * @beta
 */
interface IModelHierarchyProviderLocalizedStrings {
  /**
   * A string for "Unspecified". Used for labels of property grouping nodes
   * that group by an empty value.
   */
  unspecified: string;

  /**
   * A string for "Other". Used for label of a range property grouping node that
   * groups values which don't fit into any other range.
   */
  other: string;
}

/** @beta */
type IModelAccess = ECSchemaProvider & LimitingECSqlQueryExecutor & ECClassHierarchyInspector & { imodelKey: string };

/**
 * Props for `createIModelHierarchyProvider`.
 * @beta
 */
interface IModelHierarchyProviderProps {
  /**
   * An object that provides access to iModel's data and metadata.
   *
   * @see `ECSchemaProvider`
   * @see `LimitingECSqlQueryExecutor`
   * @see `ECClassHierarchyInspector`
   */
  imodelAccess: IModelAccess;

  /** An event that is raised when iModel data, that may affect the hierarchy, changes. */
  imodelChanged?: Event<() => void>;

  /**
   * A function that returns a hierarchy definition, describing how the hierarchy that the provider should be create. The
   * function is called once during the provider's construction.
   */
  hierarchyDefinition: HierarchyDefinition;

  /** Maximum number of queries that the provider attempts to execute in parallel. Defaults to `10`. */
  queryConcurrency?: number;
  /**
   * The amount of queries whose results are stored in-memory for quick retrieval. Defaults to `1`,
   * which means only results of the last run query are cached.
   */
  queryCacheSize?: number;

  /** A set of localized strings to use. Defaults to English strings. */
  localizedStrings?: Partial<IModelHierarchyProviderLocalizedStrings>;

  /**
   * A values formatter for formatting node labels. Defaults to the
   * result of `createDefaultValueFormatter` called with default parameters. May be overridden
   * by calling `setFormatter` on the provider instance.
   */
  formatter?: IPrimitiveValueFormatter;
  /** Props for filtering the hierarchy. */
  filtering?: {
    /** A list of node identifiers from root to target node. */
    paths: HierarchyFilteringPath[];
  };
}

/**
 * Creates an instance of `HierarchyProvider` that creates a hierarchy based on given iModel and
 * a hierarchy definition, which defines each hierarchy level through ECSQL queries.
 *
 * @beta
 */
export function createIModelHierarchyProvider(props: IModelHierarchyProviderProps): HierarchyProvider & { dispose: () => void } {
  return new IModelHierarchyProviderImpl(props);
}

class IModelHierarchyProviderImpl implements HierarchyProvider {
  private _imodelAccess: IModelAccess;
  private _valuesFormatter: IPrimitiveValueFormatter;
  private _sourceHierarchyDefinition: HierarchyDefinition;
  private _activeHierarchyDefinition: HierarchyDefinition;
  private _localizedStrings: IModelHierarchyProviderLocalizedStrings;
  private _queryScheduler: SubscriptionScheduler;
  private _nodesCache?: HierarchyCache<HierarchyCacheEntry>;
  private _unsubscribe?: () => void;

  public constructor(props: IModelHierarchyProviderProps) {
    this._imodelAccess = props.imodelAccess;
    this._activeHierarchyDefinition = this._sourceHierarchyDefinition = props.hierarchyDefinition;
    this._valuesFormatter = props?.formatter ?? createDefaultValueFormatter();
    this._localizedStrings = { other: "Other", unspecified: "Not specified", ...props?.localizedStrings };
    this._queryScheduler = new SubscriptionScheduler(props.queryConcurrency ?? DEFAULT_QUERY_CONCURRENCY);
    this.setHierarchyFilter(props.filtering);

    const queryCacheSize = props.queryCacheSize ?? DEFAULT_QUERY_CACHE_SIZE;
    if (queryCacheSize !== 0) {
      this._nodesCache = new HierarchyCache({
        // we divide the size by 2, because each variation also counts as a query that we cache
        size: Math.ceil(queryCacheSize / 2),
        variationsCount: 1,
      });
      this._unsubscribe = props.imodelChanged?.addListener(() => this.invalidateHierarchyCache("Data source changed"));
    }
  }

  public dispose() {
    this._unsubscribe?.();
  }

  private invalidateHierarchyCache(reason?: string) {
    doLog({
      category: `${LOGGING_NAMESPACE}.Events`,
      message: /* istanbul ignore next */ () => (reason ? `${reason}: clear hierarchy cache` : `Clear hierarchy cache`),
    });
    this._nodesCache?.clear();
  }

  /**
   * Sets `HierarchyProvider` values formatter that formats nodes' labels. If provided `undefined`, then defaults to the
   * result of `createDefaultValueFormatter` called with default parameters.
   */
  public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
    this._valuesFormatter = formatter ?? createDefaultValueFormatter();
  }

  public setHierarchyFilter(props: IModelHierarchyProviderProps["filtering"]) {
    if (!props) {
      if (this._sourceHierarchyDefinition !== this._activeHierarchyDefinition) {
        this._activeHierarchyDefinition = this._sourceHierarchyDefinition;
        this.invalidateHierarchyCache("Hierarchy filter reset");
      }
      return;
    }
    this._activeHierarchyDefinition = new FilteringHierarchyDefinition({
      classHierarchy: this._imodelAccess,
      source: this._sourceHierarchyDefinition,
      nodeIdentifierPaths: props.paths,
    });
    this.invalidateHierarchyCache("Hierarchy filter set");
  }

  private onGroupingNodeCreated(groupingNode: ProcessedGroupingHierarchyNode, props: GetHierarchyNodesProps) {
    this._nodesCache?.set({ ...props, parentNode: groupingNode }, { observable: from(groupingNode.children), processingStatus: "pre-processed" });
  }

  private createSourceNodesObservable(
    props: DefineHierarchyLevelProps & { hierarchyLevelSizeLimit?: number | "unbounded"; filteredInstanceKeys?: InstanceKey[] },
  ): SourceNodesObservable {
    doLog({
      category: LOGGING_NAMESPACE_PERFORMANCE,
      message: /* istanbul ignore next */ () => `Requesting hierarchy level definitions for ${createNodeIdentifierForLogging(props.parentNode)}`,
    });
    // stream hierarchy level definitions
    const definitions = from(defer(async () => this._activeHierarchyDefinition.defineHierarchyLevel(props))).pipe(
      mergeAll(),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* istanbul ignore next */ () => `Received all hierarchy level definitions for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
    // pipe definitions to nodes and put "share replay" on it
    return definitions.pipe(
      mergeMap((def): ObservableInput<SourceHierarchyNode> => {
        if (HierarchyNodesDefinition.isGenericNode(def)) {
          return of(def.node);
        }
        return this._queryScheduler.scheduleSubscription(
          of(def.query).pipe(
            map((query) => filterQueryByInstanceKeys(query, props.filteredInstanceKeys)),
            mergeMap((query) =>
              readNodes({ queryExecutor: this._imodelAccess, query, limit: props.hierarchyLevelSizeLimit, parser: this._activeHierarchyDefinition.parseNode }),
            ),
            map((node) => ({
              ...node,
              key: { ...node.key, instanceKeys: node.key.instanceKeys.map((key) => ({ ...key, imodelKey: this._imodelAccess.imodelKey })) },
            })),
          ),
        );
      }),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* istanbul ignore next */ () => `Read all child nodes ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
      shareReplayWithErrors(),
    );
  }

  private createInitializedNodesObservable(nodes: Observable<SourceHierarchyNode>, parentNode: ParentHierarchyNode | undefined) {
    return nodes.pipe(
      // we're going to be mutating the nodes, but don't want to mutate the original one, so just clone it here once
      map((node) => ({ ...node })),
      // set parent node keys on the source node
      map((node) => Object.assign(node, { parentKeys: createParentNodeKeysList(parentNode) })),
      // format `ConcatenatedValue` labels into string labels
      mergeMap(async (node) => applyLabelsFormatting(node, this._valuesFormatter)),
      // we have `ProcessedHierarchyNode` from here
      preProcessNodes(this._activeHierarchyDefinition),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* istanbul ignore next */ () => `Finished initializing child nodes for ${createNodeIdentifierForLogging(parentNode)}`,
        }),
      ),
      shareReplayWithErrors(),
    );
  }

  private createPreProcessedNodesObservable(queryNodesObservable: SourceNodesObservable, props: GetHierarchyNodesProps): Observable<ProcessedHierarchyNode> {
    return this.createInitializedNodesObservable(queryNodesObservable, props.parentNode).pipe(
      createHideIfNoChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n }).hasNodes),
      createHideNodesInHierarchyOperator(
        // note: for child nodes created because of hidden parent, we want to use parent's request props (instance filter, limit)
        (n) => this.getChildNodesObservables({ ...props, parentNode: n }).processedNodes,
        false,
      ),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* istanbul ignore next */ () => `Finished pre-processing child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
  }

  private createProcessedNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    props: GetHierarchyNodesProps,
  ): Observable<ProcessedHierarchyNode> {
    return preprocessedNodesObservable.pipe(
      createGroupingOperator(this._imodelAccess, props.parentNode, this._valuesFormatter, this._localizedStrings, (gn) =>
        this.onGroupingNodeCreated(gn, props),
      ),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* istanbul ignore next */ () => `Finished grouping child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
  }

  private createFinalizedNodesObservable(
    processedNodesObservable: Observable<ProcessedHierarchyNode>,
    props: GetHierarchyNodesProps,
  ): Observable<HierarchyNode> {
    return processedNodesObservable.pipe(
      createDetermineChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n }).hasNodes),
      postProcessNodes(this._activeHierarchyDefinition),
      sortNodesByLabelOperator,
      map((n): HierarchyNode => {
        if ("processingParams" in n) {
          delete n.processingParams;
        }
        return Object.assign(n, {
          children: hasChildren(n),
        });
      }),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* istanbul ignore next */ () => `Finished finalizing child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
  }

  private createHasNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    possiblyKnownChildrenObservable?: SourceNodesObservable,
  ): Observable<boolean> {
    const loggingCategory = `${LOGGING_NAMESPACE_INTERNAL}.HasNodes`;
    return concat((possiblyKnownChildrenObservable ?? EMPTY).pipe(filter((n) => hasChildren(n))), preprocessedNodesObservable).pipe(
      log({ category: loggingCategory, message: /* istanbul ignore next */ (n) => `Node before mapping to 'true': ${createNodeIdentifierForLogging(n)}` }),
      take(1),
      map(() => true),
      defaultIfEmpty(false),
      catchError((e: Error) => {
        doLog({ category: loggingCategory, message: /* istanbul ignore next */ () => `Error while determining children: ${e.message}` });
        if (e instanceof RowsLimitExceededError) {
          return of(true);
        }
        throw e;
      }),
      log({ category: loggingCategory, message: /* istanbul ignore next */ (r) => `Result: ${r}` }),
    );
  }

  private getCachedObservableEntry(props: GetHierarchyNodesProps): HierarchyCacheEntry {
    const loggingCategory = `${LOGGING_NAMESPACE}.QueryResultsCache`;
    const { parentNode, ...restProps } = props;
    const cached = props.ignoreCache || !this._nodesCache ? undefined : this._nodesCache.get(props);
    if (cached) {
      // istanbul ignore next
      doLog({
        category: loggingCategory,
        message: /* istanbul ignore next */ () => `Found query nodes observable for ${createNodeIdentifierForLogging(parentNode)}`,
      });
      return cached;
    }

    // if we don't find an entry for a grouping node, we load its instances by getting a query and applying
    // a filter based on grouped instance keys
    let filteredInstanceKeys: InstanceKey[] | undefined;
    let parentNonGroupingNode: ParentHierarchyNode<NonGroupingHierarchyNode> | undefined;
    if (parentNode) {
      if (HierarchyNode.isGroupingNode(parentNode)) {
        parentNonGroupingNode = parentNode.nonGroupingAncestor;
        filteredInstanceKeys = parentNode.groupedInstanceKeys;
      } else {
        // not sure why type checker doesn't pick this up
        assert(HierarchyNode.isGeneric(parentNode) || HierarchyNode.isInstancesNode(parentNode));
        parentNonGroupingNode = parentNode;
      }
    }

    const nonGroupingNodeChildrenRequestProps = {
      ...restProps,
      parentNode: parentNonGroupingNode,
      ...(filteredInstanceKeys ? { filteredInstanceKeys } : undefined),
    };
    const value = { observable: this.createSourceNodesObservable(nonGroupingNodeChildrenRequestProps), processingStatus: "none" as const };
    this._nodesCache?.set(nonGroupingNodeChildrenRequestProps, value);
    doLog({
      category: loggingCategory,
      message: /* istanbul ignore next */ () => `Saved query nodes observable for ${createNodeIdentifierForLogging(parentNode)}`,
    });
    return value;
  }

  private getChildNodesObservables(props: GetHierarchyNodesProps & { hierarchyLevelSizeLimit?: number | "unbounded" }) {
    const entry = this.getCachedObservableEntry(props);
    switch (entry.processingStatus) {
      case "none": {
        const pre = this.createPreProcessedNodesObservable(entry.observable, props);
        const post = this.createProcessedNodesObservable(pre, props);
        return {
          processedNodes: post,
          hasNodes: this.createHasNodesObservable(pre, entry.observable),
          finalizedNodes: this.createFinalizedNodesObservable(post, props),
        };
      }
      case "pre-processed": {
        const post = this.createProcessedNodesObservable(entry.observable, props);
        return {
          processedNodes: post,
          hasNodes: this.createHasNodesObservable(entry.observable),
          finalizedNodes: this.createFinalizedNodesObservable(post, props),
        };
      }
    }
  }

  /**
   * Creates and runs a query based on provided props, then processes retrieved nodes and returns them.
   */
  public getNodes(props: GetHierarchyNodesProps): AsyncIterableIterator<HierarchyNode> {
    const loggingCategory = `${LOGGING_NAMESPACE}.GetNodes`;
    const timer = new StopWatch(undefined, true);
    let error: any;
    let nodesCount = 0;
    doLog({
      category: loggingCategory,
      message: /* istanbul ignore next */ () => `Requesting child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
    });
    return eachValueFrom(
      this.getChildNodesObservables(props).finalizedNodes.pipe(
        tap(() => ++nodesCount),
        catchError((e) => {
          error = e;
          throw e;
        }),
        finalize(() => {
          doLog({
            category: loggingCategory,
            message: /* istanbul ignore next */ () =>
              error
                ? `Error creating child nodes for ${createNodeIdentifierForLogging(props.parentNode)}: ${error instanceof Error ? error.message : error.toString()}`
                : `Returned ${nodesCount} child nodes for ${createNodeIdentifierForLogging(props.parentNode)} in ${timer.currentSeconds.toFixed(2)} s.`,
          });
        }),
      ),
    );
  }

  private getNodeInstanceKeysObs(props: Omit<GetHierarchyNodesProps, "ignoreCache">): Observable<InstanceKey> {
    const { parentNode, instanceFilter, hierarchyLevelSizeLimit = "unbounded" } = props;
    if (parentNode && HierarchyNode.isGroupingNode(parentNode)) {
      return from(parentNode.groupedInstanceKeys);
    }
    assert(!parentNode || HierarchyNode.isGeneric(parentNode) || HierarchyNode.isInstancesNode(parentNode));

    // split the definitions based on whether they're for generic nodes or for instance nodes
    const [genericDefs, instanceDefs] = partition(
      from(this._activeHierarchyDefinition.defineHierarchyLevel({ parentNode, instanceFilter })).pipe(mergeAll()),
      HierarchyNodesDefinition.isGenericNode,
    );

    // query instance keys and a flag whether they should be hidden
    const instanceKeys = instanceDefs.pipe(
      mergeMap((def) =>
        this._queryScheduler.scheduleSubscription(
          of(def.query).pipe(
            mergeMap(async (query) => {
              const ecsql = `
                SELECT
                  ${NodeSelectClauseColumnNames.FullClassName},
                  ${NodeSelectClauseColumnNames.ECInstanceId},
                  ${NodeSelectClauseColumnNames.HideNodeInHierarchy}
                FROM (
                  ${query.ecsql}
                )
              `;
              const reader = this._imodelAccess.createQueryReader({ ...query, ecsql }, { rowFormat: "Indexes", limit: hierarchyLevelSizeLimit });
              return from(reader).pipe(
                map((row) => ({
                  key: {
                    className: normalizeFullClassName(row[0]),
                    id: row[1],
                  },
                  hide: !!row[2],
                })),
              );
            }),
            mergeAll(),
          ),
        ),
      ),
    );
    // split the instance keys observable based on whether they should be hidden or not
    const [visibleNodeInstanceKeys, hiddenNodeInstanceKeys] = partition(instanceKeys, ({ hide }) => !hide);

    // hidden items' handling:
    // - if a generic node is hidden, we'll want to retrieve instance keys of its children, otherwise we don't care about it,
    // - if an instance key is hidden, we want to create a merged node similar to what we do in `createHideNodesInHierarchyOperator`
    const hiddenParentNodes = merge(
      genericDefs.pipe(mergeMap((def) => (def.node.processingParams?.hideInHierarchy ? of(def.node.key) : EMPTY))),
      hiddenNodeInstanceKeys.pipe(
        // first merge all keys by class
        reduceToMergeMapList(
          ({ key }) => key.className,
          ({ key }) => key.id,
        ),
        // then, for each class, create an instance key
        mergeMap((mergedMap): InstancesNodeKey[] =>
          [...mergedMap.entries()].map(([className, ids]) => ({
            type: "instances",
            instanceKeys: ids.map((id) => ({ className, id, imodelKey: this._imodelAccess.imodelKey })),
          })),
        ),
      ),
    ).pipe(
      map((key) => ({
        key,
        parentKeys: [],
        label: "",
      })),
    );

    // merge visible instance keys from this level & the ones we get recursively requesting from deeper levels
    return merge(
      visibleNodeInstanceKeys.pipe(map(({ key }) => key)),
      hiddenParentNodes.pipe(mergeMap((hiddenNode) => this.getNodeInstanceKeysObs({ parentNode: hiddenNode }))),
    );
  }

  /**
   * Creates an iterator for all child hierarchy level instance keys, taking into account any hidden hierarchy levels
   * that there may be under the given parent node.
   */
  public getNodeInstanceKeys(props: Omit<GetHierarchyNodesProps, "ignoreCache">): AsyncIterableIterator<InstanceKey> {
    const loggingCategory = `${LOGGING_NAMESPACE}.GetNodeInstanceKeys`;
    const timer = new StopWatch(undefined, true);
    doLog({
      category: loggingCategory,
      message: /* istanbul ignore next */ () => `Requesting keys for ${createNodeIdentifierForLogging(props.parentNode)}`,
    });
    let error: any;
    let keysCount = 0;
    return eachValueFrom(
      this.getNodeInstanceKeysObs(props).pipe(
        tap(() => ++keysCount),
        catchError((e) => {
          error = e;
          throw e;
        }),
        finalize(() => {
          doLog({
            category: loggingCategory,
            message: /* istanbul ignore next */ () =>
              error
                ? `Error creating node instance keys for ${createNodeIdentifierForLogging(props.parentNode)}: ${error instanceof Error ? error.message : error.toString()}`
                : `Returned ${keysCount} instance keys for ${createNodeIdentifierForLogging(props.parentNode)} in ${timer.currentSeconds.toFixed(2)} s.`,
          });
        }),
      ),
    );
  }
}

type SourceNodesObservable = Observable<SourceHierarchyNode>;
type ProcessedNodesObservable = Observable<ProcessedHierarchyNode>;
type HierarchyCacheEntry =
  | { observable: SourceNodesObservable; processingStatus: "none" }
  | { observable: ProcessedNodesObservable; processingStatus: "pre-processed" };

function preProcessNodes(hierarchyFactory: HierarchyDefinition) {
  return hierarchyFactory.preProcessNode
    ? processNodes(hierarchyFactory.preProcessNode.bind(hierarchyFactory))
    : (o: Observable<ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode>) => o;
}

function postProcessNodes<ProcessedHierarchyNode>(hierarchyFactory: HierarchyDefinition) {
  return hierarchyFactory.postProcessNode
    ? processNodes(hierarchyFactory.postProcessNode.bind(hierarchyFactory))
    : (o: Observable<ProcessedHierarchyNode>) => o;
}

function processNodes<TNode>(processor: (node: TNode) => Promise<TNode | undefined>) {
  return (nodes: Observable<TNode>) =>
    nodes.pipe(
      mergeMap(processor),
      filter((n): n is TNode => !!n),
    );
}

async function applyLabelsFormatting<TNode extends { label: string | ConcatenatedValue }>(
  node: TNode,
  valueFormatter: IPrimitiveValueFormatter,
): Promise<TNode & { label: string }> {
  return {
    ...node,
    label: await formatConcatenatedValue({
      value: node.label,
      valueFormatter,
    }),
  };
}

function createParentNodeKeysList(parentNode: ParentHierarchyNode | undefined) {
  if (!parentNode) {
    return [];
  }
  return [...parentNode.parentKeys, parentNode.key];
}

function filterQueryByInstanceKeys(query: ECSqlQueryDef, filteredInstanceKeys: InstanceKey[] | undefined): ECSqlQueryDef {
  if (!filteredInstanceKeys || !filteredInstanceKeys.length) {
    return query;
  }
  const MAX_ALLOWED_BINDINGS = 1000;
  // istanbul ignore else
  if (filteredInstanceKeys.length < MAX_ALLOWED_BINDINGS) {
    return {
      ...query,
      ecsql: `
        SELECT *
        FROM (${query.ecsql}) q
        WHERE q.ECInstanceId IN (${filteredInstanceKeys.map(() => "?").join(",")})
      `,
      bindings: [...(query.bindings ?? []), ...filteredInstanceKeys.map((k): ECSqlBinding => ({ type: "id", value: k.id }))],
    };
  }
  // istanbul ignore next
  return {
    ...query,
    ecsql: `
      SELECT *
      FROM (${query.ecsql}) q
      WHERE InVirtualSet(?, q.ECInstanceId)
    `,
    bindings: [...(query.bindings ?? []), { type: "idset", value: filteredInstanceKeys.map((k) => k.id) }],
  };
}

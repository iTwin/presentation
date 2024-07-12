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
import { GenericInstanceFilter } from "@itwin/core-common";
import {
  ConcatenatedValue,
  createDefaultValueFormatter,
  ECClassHierarchyInspector,
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryDef,
  formatConcatenatedValue,
  InstanceKey,
  IPrimitiveValueFormatter,
  normalizeFullClassName,
} from "@itwin/presentation-shared";
import { DefineHierarchyLevelProps, HierarchyDefinition, HierarchyNodesDefinition } from "./HierarchyDefinition";
import { RowsLimitExceededError } from "./HierarchyErrors";
import {
  HierarchyNode,
  NonGroupingHierarchyNode,
  ParentHierarchyNode,
  ParsedHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "./HierarchyNode";
import { HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier";
import { InstancesNodeKey } from "./HierarchyNodeKey";
import { CachedNodesObservableEntry, ChildNodeObservablesCache, ParsedQueryNodesObservable } from "./internal/ChildNodeObservablesCache";
import { LOGGING_NAMESPACE as CommonLoggingNamespace, createNodeIdentifierForLogging, hasChildren } from "./internal/Common";
import { eachValueFrom } from "./internal/EachValueFrom";
import { FilteringHierarchyDefinition } from "./internal/FilteringHierarchyDefinition";
import { createQueryLogMessage, doLog, log } from "./internal/LoggingUtils";
import { createDetermineChildrenOperator } from "./internal/operators/DetermineChildren";
import { createGroupingOperator } from "./internal/operators/Grouping";
import { createHideIfNoChildrenOperator } from "./internal/operators/HideIfNoChildren";
import { createHideNodesInHierarchyOperator } from "./internal/operators/HideNodesInHierarchy";
import { partition } from "./internal/operators/Partition";
import { reduceToMergeMapList } from "./internal/operators/ReduceToMergeMap";
import { shareReplayWithErrors } from "./internal/operators/ShareReplayWithErrors";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting";
import { SubscriptionScheduler } from "./internal/SubscriptionScheduler";
import { readNodes } from "./internal/TreeNodesReader";
import { LimitingECSqlQueryExecutor } from "./LimitingECSqlQueryExecutor";
import { NodeSelectClauseColumnNames } from "./NodeSelectQueryFactory";

const LOGGING_NAMESPACE = `${CommonLoggingNamespace}.HierarchyProvider`;
const PERF_LOGGING_NAMESPACE = `${LOGGING_NAMESPACE}.Performance`;
const DEFAULT_QUERY_CONCURRENCY = 10;
const DEFAULT_QUERY_CACHE_SIZE = 1;

/**
 * Props for the `HierarchyProvider.getNodes` call.
 * @beta
 */
export interface GetHierarchyNodesProps {
  /** Parent node to get children for. Pass `undefined` to get root nodes. */
  parentNode: ParentHierarchyNode | undefined;

  /** Optional hierarchy level filter. Has no effect if `parentNode` is a `GroupingNode`. */
  instanceFilter?: GenericInstanceFilter;

  /**
   * Optional hierarchy level size limit override. This value is passed to `LimitingECSqlQueryExecutor` used
   * by this provider to override query rows limit per hierarchy level. If not provided, defaults to whatever
   * is used by the limiting query executor.
   *
   * Has no effect if `parentNode` is a `GroupingNode`.
   */
  hierarchyLevelSizeLimit?: number | "unbounded";

  /** When set to true ignores the cache and fetches the nodes again. */
  ignoreCache?: boolean;
}

/**
 * An interface for a hierarchy provider knows how to create child nodes for a given parent node.
 * @beta
 */
export interface HierarchyProvider {
  /** Gets nodes for the specified parent node. */
  getNodes(props: GetHierarchyNodesProps): AsyncIterableIterator<HierarchyNode>;

  /** Gets instance keys for the specified parent node. */
  getNodeInstanceKeys(props: Omit<GetHierarchyNodesProps, "ignoreCache">): AsyncIterableIterator<InstanceKey>;

  /** Notifies the provider that the underlying data source has changed and caches should be invalidated. */
  notifyDataSourceChanged(): void;

  /**
   * Overrides the property value formatter used by the hierarchy provider. Setting to `undefined`
   * resets the formatter to the result of `createDefaultValueFormatter` called with default parameters.
   */
  setFormatter(formatter: IPrimitiveValueFormatter | undefined): void;
}

/**
 * Defines the strings used by hierarchy provider.
 * @beta
 */
interface HierarchyProviderLocalizedStrings {
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

/**
 * A path of hierarchy node identifiers for filtering the hierarchy with additional options.
 * @beta
 */
export type FilteringPath = HierarchyNodeIdentifiersPath | { path: HierarchyNodeIdentifiersPath; options?: { autoExpand?: boolean } };

/**
 * Props for `createHierarchyProvider`.
 * @beta
 */
interface HierarchyProviderProps {
  /**
   * An object that provides access to iModel's data and metadata.
   *
   * @see `ECSchemaProvider`
   * @see `LimitingECSqlQueryExecutor`
   * @see `ECClassHierarchyInspector`
   */
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor & ECClassHierarchyInspector;

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

  /**
   * A values formatter for formatting node labels. Defaults to the
   * result of `createDefaultValueFormatter` called with default parameters.
   */
  formatter?: IPrimitiveValueFormatter;

  /** A set of localized strings to use. Defaults to English strings. */
  localizedStrings?: Partial<HierarchyProviderLocalizedStrings>;

  /** Props for filtering the hierarchy. */
  filtering?: {
    /** A list of node identifiers from root to target node. */
    paths: FilteringPath[];
  };
}

/**
 * Creates an instance of `HierarchyProvider` that creates a hierarchy based on given iModel and
 * a hierarchy definition, which defines each hierarchy level through ECSQL queries.
 *
 * @beta
 */
export function createHierarchyProvider(props: HierarchyProviderProps): HierarchyProvider {
  return new HierarchyProviderImpl(props);
}

class HierarchyProviderImpl implements HierarchyProvider {
  private _imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor & ECClassHierarchyInspector;
  private _valuesFormatter: IPrimitiveValueFormatter;
  private _localizedStrings: HierarchyProviderLocalizedStrings;
  private _queryScheduler: SubscriptionScheduler;
  private _nodesCache?: ChildNodeObservablesCache;

  /**
   * Hierarchy level definitions factory used by this provider.
   *
   * @note This does not necessarily match the `hierarchyDefinition` passed through props when constructing
   * the provider. For example, it may be a factory that decorates given `hierarchyDefinition` with filtering
   * features.
   */
  public readonly hierarchyDefinition: HierarchyDefinition;

  /**
   * A limiting ECSQL query executor used by this provider.
   * @see HierarchyProviderProps.queryExecutor
   */
  public get queryExecutor(): LimitingECSqlQueryExecutor {
    return this._imodelAccess;
  }

  public constructor(props: HierarchyProviderProps) {
    this._imodelAccess = props.imodelAccess;
    this.hierarchyDefinition = props.hierarchyDefinition;
    if (props.filtering) {
      const filteringDefinition = new FilteringHierarchyDefinition({
        classHierarchy: this._imodelAccess,
        source: this.hierarchyDefinition,
        nodeIdentifierPaths: props.filtering.paths,
      });
      this.hierarchyDefinition = filteringDefinition;
    }
    this._valuesFormatter = props?.formatter ?? createDefaultValueFormatter();
    this._localizedStrings = { other: "Other", unspecified: "Not specified", ...props?.localizedStrings };
    this._queryScheduler = new SubscriptionScheduler(props.queryConcurrency ?? DEFAULT_QUERY_CONCURRENCY);

    const queryCacheSize = props.queryCacheSize ?? DEFAULT_QUERY_CACHE_SIZE;
    if (queryCacheSize !== 0) {
      this._nodesCache = new ChildNodeObservablesCache({
        // we divide the size by 2, because each variation also counts as a query that we cache
        size: Math.ceil(queryCacheSize / 2),
        variationsCount: 1,
      });
    }
  }

  /**
   * Sets `HierarchyProvider` values formatter that formats nodes' labels. If provided `undefined`, then defaults to the
   * result of `createDefaultValueFormatter` called with default parameters.
   */
  public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
    this._valuesFormatter = formatter ?? createDefaultValueFormatter();
  }

  private onGroupingNodeCreated(groupingNode: ProcessedGroupingHierarchyNode, props: GetHierarchyNodesProps) {
    this._nodesCache?.set({ ...props, parentNode: groupingNode }, { observable: from(groupingNode.children), processingStatus: "pre-processed" });
  }

  private createParsedQueryNodesObservable(
    props: DefineHierarchyLevelProps & { hierarchyLevelSizeLimit?: number | "unbounded"; filteredInstanceKeys?: InstanceKey[] },
  ): ParsedQueryNodesObservable {
    doLog({
      category: PERF_LOGGING_NAMESPACE,
      message: /* istanbul ignore next */ () => `Requesting hierarchy level definitions for ${createNodeIdentifierForLogging(props.parentNode)}`,
    });
    // stream hierarchy level definitions
    const definitions = from(defer(async () => this.hierarchyDefinition.defineHierarchyLevel(props))).pipe(
      mergeAll(),
      finalize(() =>
        doLog({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Received all hierarchy level definitions for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
    // pipe definitions to nodes and put "share replay" on it
    return definitions.pipe(
      mergeMap((def): ObservableInput<ParsedHierarchyNode> => {
        if (HierarchyNodesDefinition.isCustomNode(def)) {
          return of(def.node);
        }
        return this._queryScheduler.scheduleSubscription(
          of(def.query).pipe(
            map((query) => filterQueryByInstanceKeys(query, props.filteredInstanceKeys)),
            log({
              category: `${LOGGING_NAMESPACE}.Queries`,
              message: /* istanbul ignore next */ (query) =>
                `Query direct nodes for parent ${createNodeIdentifierForLogging(props.parentNode)}: ${createQueryLogMessage(query)}`,
            }),
            mergeMap((query) =>
              readNodes({ queryExecutor: this.queryExecutor, query, limit: props.hierarchyLevelSizeLimit, parser: this.hierarchyDefinition.parseNode }),
            ),
          ),
        );
      }),
      finalize(() =>
        doLog({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Read all child nodes ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
      shareReplayWithErrors(),
    );
  }

  private createInitializedNodesObservable(nodes: Observable<ParsedHierarchyNode>, parentNode: ParentHierarchyNode | undefined) {
    return nodes.pipe(
      // we're going to be mutating the nodes, but don't want to mutate the original one, so just clone it here once
      map((node) => ({ ...node })),
      // set parent node keys on the parsed node
      map((node) => Object.assign(node, { parentKeys: createParentNodeKeysList(parentNode) })),
      // format `ConcatenatedValue` labels into string labels
      mergeMap(async (node) => applyLabelsFormatting(node, this._imodelAccess, this._valuesFormatter)),
      // we have `ProcessedHierarchyNode` from here
      preProcessNodes(this.hierarchyDefinition),
      finalize(() =>
        doLog({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Finished initializing child nodes for ${createNodeIdentifierForLogging(parentNode)}`,
        }),
      ),
      shareReplayWithErrors(),
    );
  }

  private createPreProcessedNodesObservable(
    queryNodesObservable: ParsedQueryNodesObservable,
    props: GetHierarchyNodesProps,
  ): Observable<ProcessedHierarchyNode> {
    return this.createInitializedNodesObservable(queryNodesObservable, props.parentNode).pipe(
      createHideIfNoChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n }).hasNodes),
      createHideNodesInHierarchyOperator(
        // note: for child nodes created because of hidden parent, we want to use parent's request props (instance filter, limit)
        (n) => this.getChildNodesObservables({ ...props, parentNode: n }).processedNodes,
        false,
      ),
      finalize(() =>
        doLog({
          category: PERF_LOGGING_NAMESPACE,
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
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Finished processing child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
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
      postProcessNodes(this.hierarchyDefinition),
      sortNodesByLabelOperator,
      map((n): HierarchyNode => {
        if (HierarchyNode.isCustom(n) || HierarchyNode.isInstancesNode(n)) {
          delete n.processingParams;
        }
        return Object.assign(n, {
          children: hasChildren(n),
        });
      }),
      finalize(() =>
        doLog({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Finished finalizing child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
  }

  private createHasNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    possiblyKnownChildrenObservable?: ParsedQueryNodesObservable,
  ): Observable<boolean> {
    const loggingCategory = `${LOGGING_NAMESPACE}.HasNodes`;
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

  private getCachedObservableEntry(props: GetHierarchyNodesProps): CachedNodesObservableEntry {
    const loggingCategory = `${LOGGING_NAMESPACE}.GetCachedObservableEntry`;
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
        assert(HierarchyNode.isCustom(parentNode) || HierarchyNode.isInstancesNode(parentNode));
        parentNonGroupingNode = parentNode;
      }
    }

    const nonGroupingNodeChildrenRequestProps = {
      ...restProps,
      parentNode: parentNonGroupingNode,
      ...(filteredInstanceKeys ? { filteredInstanceKeys } : undefined),
    };
    const value = { observable: this.createParsedQueryNodesObservable(nonGroupingNodeChildrenRequestProps), processingStatus: "none" as const };
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

    assert(!parentNode || HierarchyNode.isCustom(parentNode) || HierarchyNode.isInstancesNode(parentNode));

    // split the definitions based on whether they're for custom nodes or for instance nodes
    const [customDefs, instanceDefs] = partition(
      from(this.hierarchyDefinition.defineHierarchyLevel({ parentNode, instanceFilter })).pipe(mergeAll()),
      HierarchyNodesDefinition.isCustomNode,
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
              const reader = this.queryExecutor.createQueryReader({ ...query, ecsql }, { rowFormat: "Indexes", limit: hierarchyLevelSizeLimit });
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
    // - if a custom node is hidden, we'll want to retrieve instance keys of its children, otherwise we don't care about it,
    // - if an instance key is hidden, we want to create a merged node similar to what we do in `createHideNodesInHierarchyOperator`
    const hiddenParentNodes = merge(
      customDefs.pipe(
        mergeMap((def) => (def.node.processingParams?.hideInHierarchy ? this.createInitializedNodesObservable(of(def.node), parentNode) : EMPTY)),
      ),
      hiddenNodeInstanceKeys.pipe(
        // first merge all keys by class
        reduceToMergeMapList(
          ({ key }) => key.className,
          ({ key }) => key.id,
        ),
        // then, for each class, create a temp node
        mergeMap(
          (mergedMap): Array<ParentHierarchyNode & { key: InstancesNodeKey }> =>
            [...mergedMap.entries()].map(([className, ids]) => ({
              key: {
                type: "instances",
                instanceKeys: ids.map((id) => ({ className, id })),
              },
              parentKeys: [],
              label: "",
            })),
        ),
      ),
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
    doLog({
      category: loggingCategory,
      message: /* istanbul ignore next */ () => `Requesting keys for ${createNodeIdentifierForLogging(props.parentNode)}`,
    });
    return eachValueFrom(this.getNodeInstanceKeysObs(props));
  }

  /**
   * A function that should be called when the underlying data source, used by `HierarchyProviderProps.schemaProvider`,
   * `HierarchyProviderProps.queryExecutor` or `HierarchyProviderProps.hierarchyDefinition`, changes.
   *
   * Calling the function invalidates internal caches to make sure fresh data is retrieved on new requests.
   */
  public notifyDataSourceChanged() {
    this._nodesCache?.clear();
  }
}

function preProcessNodes(hierarchyFactory: HierarchyDefinition) {
  return hierarchyFactory.preProcessNode
    ? processNodes(hierarchyFactory.preProcessNode.bind(hierarchyFactory))
    : (o: Observable<ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode>) => o;
}

function postProcessNodes(hierarchyFactory: HierarchyDefinition) {
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
  schemaProvider: ECSchemaProvider,
  valueFormatter: IPrimitiveValueFormatter,
): Promise<TNode & { label: string }> {
  return {
    ...node,
    label: await formatConcatenatedValue({
      value: node.label,
      schemaProvider,
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

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "../internal/DisposePolyfill.js";

import {
  catchError,
  concat,
  defaultIfEmpty,
  defer,
  EMPTY,
  filter,
  finalize,
  from,
  fromEventPattern,
  identity,
  map,
  merge,
  mergeAll,
  mergeMap,
  of,
  reduce,
  Subject,
  take,
  takeUntil,
  tap,
} from "rxjs";
import { assert, BeEvent, Guid, StopWatch } from "@itwin/core-bentley";
import { createDefaultValueFormatter, formatConcatenatedValue, InstanceKey, normalizeFullClassName } from "@itwin/presentation-shared";
import { RowsLimitExceededError } from "../HierarchyErrors.js";
import { HierarchyNode } from "../HierarchyNode.js";
import { HierarchyNodeKey } from "../HierarchyNodeKey.js";
import { HierarchySearchPath } from "../HierarchySearch.js";
import {
  LOGGING_NAMESPACE as BASE_LOGGING_NAMESPACE,
  LOGGING_NAMESPACE_INTERNAL as BASE_LOGGING_NAMESPACE_INTERNAL,
  LOGGING_NAMESPACE_PERFORMANCE as BASE_LOGGING_NAMESPACE_PERFORMANCE,
  createNodeIdentifierForLogging,
  hasChildren,
} from "../internal/Common.js";
import { eachValueFrom } from "../internal/EachValueFrom.js";
import { doLog, log } from "../internal/LoggingUtils.js";
import { partition } from "../internal/operators/Partition.js";
import { reduceToMergeMapList } from "../internal/operators/ReduceToMergeMap.js";
import { shareReplayWithErrors } from "../internal/operators/ShareReplayWithErrors.js";
import { sortNodesByLabelOperator } from "../internal/operators/Sorting.js";
import { getRxjsHierarchyDefinition } from "../internal/RxjsHierarchyDefinition.js";
import { SubscriptionScheduler } from "../internal/SubscriptionScheduler.js";
import { HierarchyCache } from "./HierarchyCache.js";
import { HierarchyNodesDefinition } from "./IModelHierarchyDefinition.js";
import { NodeSelectClauseColumnNames } from "./NodeSelectQueryFactory.js";
import { createDetermineChildrenOperator } from "./operators/DetermineChildren.js";
import { createGroupingOperator } from "./operators/Grouping.js";
import { createHideIfNoChildrenOperator } from "./operators/HideIfNoChildren.js";
import { createHideNodesInHierarchyOperator } from "./operators/HideNodesInHierarchy.js";
import { SearchHierarchyDefinition } from "./SearchHierarchyDefinition.js";
import { readNodes } from "./TreeNodesReader.js";

import type { Observable, ObservableInput, ObservedValueOf } from "rxjs";
import type { GuidString } from "@itwin/core-bentley";
import type {
  ConcatenatedValue,
  ECClassHierarchyInspector,
  ECSchemaProvider,
  ECSqlBinding,
  ECSqlQueryDef,
  Event,
  EventArgs,
  IPrimitiveValueFormatter,
} from "@itwin/presentation-shared";
import type { NonGroupingHierarchyNode, ParentHierarchyNode } from "../HierarchyNode.js";
import type { GenericNodeKey, IModelInstanceKey, InstancesNodeKey } from "../HierarchyNodeKey.js";
import type { GetHierarchyNodesProps, HierarchyProvider } from "../HierarchyProvider.js";
import type { RxjsHierarchyDefinition } from "../internal/RxjsHierarchyDefinition.js";
import type {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyDefinition,
  InstanceNodesQueryDefinition,
} from "./IModelHierarchyDefinition.js";
import type { ProcessedGroupingHierarchyNode, ProcessedHierarchyNode, SourceGenericHierarchyNode, SourceInstanceHierarchyNode } from "./IModelHierarchyNode.js";
import type { LimitingECSqlQueryExecutor } from "./LimitingECSqlQueryExecutor.js";

const LOGGING_NAMESPACE = `${BASE_LOGGING_NAMESPACE}.IModelHierarchyProvider`;
const LOGGING_NAMESPACE_INTERNAL = `${BASE_LOGGING_NAMESPACE_INTERNAL}.IModelHierarchyProvider`;
const LOGGING_NAMESPACE_PERFORMANCE = `${BASE_LOGGING_NAMESPACE_PERFORMANCE}.IModelHierarchyProvider`;

const DEFAULT_QUERY_CONCURRENCY = 10;
const DEFAULT_QUERY_CACHE_SIZE = 1;

/**
 * Defines the strings used by hierarchy provider.
 * @public
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

/** @public */
type IModelAccess = ECSchemaProvider & LimitingECSqlQueryExecutor & ECClassHierarchyInspector & { imodelKey: string };

/**
 * Props for `createIModelHierarchyProvider`.
 * @public
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

  /**
   * An event that is raised when iModel data, that may affect the hierarchy, changes. The created provider
   * subscribes to the event to know that it needs to reload the data, and unsubscribes on disposal.
   */
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

  /** Props for search the hierarchy. */
  search?: {
    /** A list of node identifiers from root to target node. */
    paths: HierarchySearchPath[];
  };
}

/**
 * Creates an instance of `HierarchyProvider` that creates a hierarchy based on given the iModel and
 * a hierarchy definition, which defines each hierarchy level through ECSQL queries.
 *
 * @public
 */
export function createIModelHierarchyProvider(props: IModelHierarchyProviderProps): HierarchyProvider & Disposable {
  const { imodelAccess, imodelChanged, ...restProps } = props;
  return createMergedIModelHierarchyProvider({ ...restProps, imodels: [{ imodelAccess, imodelChanged }] });
}

/**
 * Props for `createMergedIModelHierarchyProvider`.
 * @alpha
 */
interface MergedIModelHierarchyProviderProps extends Omit<IModelHierarchyProviderProps, "imodelAccess" | "imodelChanged"> {
  /**
   * A list of iModels to create merged hierarchy for.
   *
   * **Warning:** These **must** all be different versions of the same iModel, ordered from the earliest to the
   * latest version. Not obeying this rule may result in undefined behavior.
   */
  imodels: Array<{
    /**
     * An object that provides access to iModel's data and metadata.
     *
     * @see `ECSchemaProvider`
     * @see `LimitingECSqlQueryExecutor`
     * @see `ECClassHierarchyInspector`
     */
    imodelAccess: IModelAccess;

    /**
     * An event that is raised when iModel data, that may affect the hierarchy, changes. The created provider
     * subscribes to the event to know that it needs to reload the data, and unsubscribes on disposal.
     */
    imodelChanged?: Event<() => void>;
  }>;
}

/**
 * Creates an instance of `HierarchyProvider` that creates a hierarchy based on multiple version of **the same** iModel
 * and a hierarchy definition, which defines each hierarchy level through ECSQL queries.
 *
 * **Warning:** This is an experimental API that **should not be used in production**.
 *
 * @alpha
 */
export function createMergedIModelHierarchyProvider(props: MergedIModelHierarchyProviderProps): HierarchyProvider & Disposable {
  return new IModelHierarchyProviderImpl(props);
}

interface RequestContextProp {
  requestContext: {
    requestId: string;
  };
}

type WithSourceNameOverride<T> = T & { sourceName?: string };

class IModelHierarchyProviderImpl implements HierarchyProvider {
  private _imodels: Array<{ imodelAccess: IModelAccess; imodelChanged?: Event<() => void> }>;
  private _hierarchyChanged: BeEvent<(args: EventArgs<HierarchyProvider["hierarchyChanged"]>) => void>;
  private _valuesFormatter: IPrimitiveValueFormatter;
  private _sourceHierarchyDefinition: RxjsHierarchyDefinition;
  private _activeHierarchyDefinition: RxjsHierarchyDefinition;
  private _localizedStrings: IModelHierarchyProviderLocalizedStrings;
  private _queryConcurrency: number;
  private _querySchedulers: Map<string, SubscriptionScheduler>;
  private _nodesCache?: HierarchyCache<HierarchyCacheEntry>;
  private _unsubscribe?: () => void;
  private _dispose = new Subject<void>();
  #componentId: GuidString;
  #componentName: string;
  #sourceName: string;

  public constructor(props: WithSourceNameOverride<MergedIModelHierarchyProviderProps>) {
    if (props.imodels.length === 0) {
      throw new Error(`Creating an iModel hierarchy provider requires at least one iModel.`);
    }

    this.#componentId = Guid.createValue();
    this.#componentName = "IModelHierarchyProviderImpl";
    /* c8 ignore next */
    this.#sourceName = props.sourceName ?? `${this.#componentName}:${this.#componentId}`;
    this._imodels = props.imodels;
    this._hierarchyChanged = new BeEvent();
    this._activeHierarchyDefinition = this._sourceHierarchyDefinition = getRxjsHierarchyDefinition(props.hierarchyDefinition);
    this._valuesFormatter = props.formatter ?? createDefaultValueFormatter();
    this._localizedStrings = { other: "Other", unspecified: "Not specified", ...props.localizedStrings };
    this._queryConcurrency = props.queryConcurrency ?? DEFAULT_QUERY_CONCURRENCY;
    this._querySchedulers = new Map();
    this.setHierarchySearch(props.search);

    const queryCacheSize = props.queryCacheSize ?? DEFAULT_QUERY_CACHE_SIZE;
    if (queryCacheSize !== 0) {
      this._nodesCache = new HierarchyCache({
        // we divide the size by 2, because each variation also counts as a query that we cache
        size: Math.ceil(queryCacheSize / 2),
        variationsCount: 1,
      });
    }

    const imodelChangeSubscription = from(this._imodels)
      .pipe(
        mergeMap(({ imodelAccess, imodelChanged }) =>
          imodelChanged
            ? fromEventPattern(
                (handler) => imodelChanged.addListener(handler),
                (handler) => imodelChanged.removeListener(handler),
                () => imodelAccess,
              )
            : EMPTY,
        ),
      )
      .subscribe(({ imodelKey }) => {
        this.invalidateHierarchyCache(`Data source changed: "${imodelKey}"`);
        this._dispose.next();
        this._hierarchyChanged.raiseEvent({});
      });
    this._unsubscribe = () => {
      imodelChangeSubscription.unsubscribe();
    };
  }

  public [Symbol.dispose]() {
    this._dispose.next();
    this._unsubscribe?.();
  }

  /* c8 ignore next 3 */
  public dispose() {
    this[Symbol.dispose]();
  }

  public get hierarchyChanged() {
    return this._hierarchyChanged;
  }

  private getQueryScheduler(imodelKey: string) {
    let scheduler = this._querySchedulers.get(imodelKey);
    if (!scheduler) {
      scheduler = new SubscriptionScheduler(this._queryConcurrency);
      this._querySchedulers.set(imodelKey, scheduler);
    }
    return scheduler;
  }

  private getPrimaryIModelAccess() {
    return this._imodels[this._imodels.length - 1].imodelAccess;
  }

  private invalidateHierarchyCache(reason?: string) {
    doLog({
      category: `${LOGGING_NAMESPACE}.Events`,
      message: /* c8 ignore next */ () => (reason ? `${reason}: clear hierarchy cache` : `Clear hierarchy cache`),
    });
    this._nodesCache?.clear();
  }

  /**
   * Sets `HierarchyProvider` values formatter that formats nodes' labels. If provided `undefined`, then defaults to the
   * result of `createDefaultValueFormatter` called with default parameters.
   */
  public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
    this._valuesFormatter = formatter ?? createDefaultValueFormatter();
    this._hierarchyChanged.raiseEvent({ formatterChange: { newFormatter: this._valuesFormatter } });
  }

  public setHierarchySearch(props: IModelHierarchyProviderProps["search"]) {
    if (!props) {
      if (this._sourceHierarchyDefinition !== this._activeHierarchyDefinition) {
        this._activeHierarchyDefinition = this._sourceHierarchyDefinition;
        this.invalidateHierarchyCache("Hierarchy search reset");
      }
      this._hierarchyChanged.raiseEvent({ searchChange: { newSearch: undefined } });
      return;
    }
    this._activeHierarchyDefinition = new SearchHierarchyDefinition({
      imodelAccess: this.getPrimaryIModelAccess(),
      source: this._sourceHierarchyDefinition,
      sourceName: this.#sourceName,
      targetPaths: props.paths,
    });
    this.invalidateHierarchyCache("Hierarchy search set");
    this._dispose.next();
    this._hierarchyChanged.raiseEvent({ searchChange: { newSearch: props } });
  }

  private onGroupingNodeCreated(groupingNode: ProcessedGroupingHierarchyNode, props: GetHierarchyNodesProps) {
    this._nodesCache?.set({ ...props, parentNode: groupingNode }, { observable: from(groupingNode.children), processingStatus: "pre-processed" });
  }

  private createHierarchyLevelDefinitionsObservable(
    props: Omit<DefineHierarchyLevelProps, "imodelAccess"> & RequestContextProp,
  ): Observable<
    { imodelAccess: IModelAccess; imodelAccessIndex: number } & (
      | { hierarchyNodesDefinition: GenericHierarchyNodeDefinition }
      | { hierarchyNodesDefinition: InstanceNodesQueryDefinition }
    )
  > {
    const { requestContext, ...defineHierarchyLevelProps } = props;
    doLog({
      category: LOGGING_NAMESPACE_PERFORMANCE,
      message: /* c8 ignore next */ () =>
        `[${requestContext.requestId}] Requesting hierarchy level definitions for ${createNodeIdentifierForLogging(props.parentNode)}`,
    });

    return from(this._imodels).pipe(
      mergeMap(({ imodelAccess }, imodelAccessIndex) => {
        let parentNode = props.parentNode;
        if (parentNode && HierarchyNode.isGeneric(parentNode) && parentNode.key.source && parentNode.key.source !== this.#sourceName) {
          return EMPTY;
        }
        if (parentNode && HierarchyNode.isInstancesNode(parentNode)) {
          parentNode = {
            ...parentNode,
            key: {
              ...parentNode.key,
              instanceKeys: parentNode.key.instanceKeys.filter((ik) => !ik.imodelKey || ik.imodelKey === imodelAccess.imodelKey),
            },
          };
          assert(HierarchyNodeKey.isInstances(parentNode.key));
          if (parentNode.key.instanceKeys.length === 0) {
            return EMPTY;
          }
        }
        return this._activeHierarchyDefinition.defineHierarchyLevel({ ...defineHierarchyLevelProps, parentNode, imodelAccess }).pipe(
          mergeAll(),
          map(
            /* Using `as` to work around TS not understanding that `{ x: A, y: B | C }` is the same as `{ x: A } & ({ y: B } | { y: C })` */
            (hierarchyNodesDefinition) =>
              ({ imodelAccess, imodelAccessIndex, hierarchyNodesDefinition }) as ObservedValueOf<
                ReturnType<typeof this.createHierarchyLevelDefinitionsObservable>
              >,
          ),
        );
      }),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* c8 ignore next */ () =>
            `[${requestContext.requestId}] Received all hierarchy level definitions for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
  }

  private createSourceNodesObservable(
    props: Omit<DefineHierarchyLevelProps, "imodelAccess"> & {
      hierarchyLevelSizeLimit?: number | "unbounded";
      targetInstanceKeys?: InstanceKey[];
    } & RequestContextProp,
  ): SourceNodesObservable {
    // pipe definitions to nodes and put "share replay" on it
    return this.createHierarchyLevelDefinitionsObservable(props).pipe(
      mergeMap(({ imodelAccess, imodelAccessIndex, hierarchyNodesDefinition: def }) =>
        defer((): Observable<SourceHierarchyNode> => {
          if (HierarchyNodesDefinition.isGenericNode(def)) {
            return of({
              ...def.node,
              key: { type: "generic" as const, id: def.node.key, source: this.#sourceName },
            });
          }
          return this.getQueryScheduler(imodelAccess.imodelKey).scheduleSubscription(
            of(def.query).pipe(
              map((query) => createInstanceKeysFilteredQuery(query, props.targetInstanceKeys)),
              mergeMap((query) =>
                readNodes({
                  queryExecutor: imodelAccess,
                  query,
                  limit: props.hierarchyLevelSizeLimit,
                  parser: this._activeHierarchyDefinition.parseNode
                    ? ({ row }) => this._activeHierarchyDefinition.parseNode!({ row, parentNode: props.parentNode, imodelKey: imodelAccess.imodelKey })
                    : undefined,
                }),
              ),
              map((node) => ({
                ...node,
                key: { ...node.key, instanceKeys: node.key.instanceKeys.map((key) => ({ ...key, imodelKey: imodelAccess.imodelKey })) },
              })),
            ),
          );
        }).pipe(map((node: SourceHierarchyNode) => ({ imodelAccess, imodelAccessIndex, node }))),
      ),
      mergeNodes,
      map(({ node }) => node),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* c8 ignore next */ () => `[${props.requestContext.requestId}] Read all child nodes ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
      shareReplayWithErrors(),
    );
  }

  private createPreProcessedNodesObservable(
    queryNodesObservable: SourceNodesObservable,
    props: GetHierarchyNodesProps & RequestContextProp,
  ): Observable<ProcessedHierarchyNode> {
    return queryNodesObservable.pipe(
      // we're going to be mutating the nodes, but don't want to mutate the original one, so just clone it here once
      map((node) => ({ ...node })),
      // set parent node keys on the source node
      map((node) => Object.assign(node, { parentKeys: createParentNodeKeysList(props.parentNode) })),
      // format `ConcatenatedValue` labels into string labels
      mergeMap((node) => applyLabelsFormatting(node, this._valuesFormatter)),
      // we have `ProcessedHierarchyNode` from here
      // let consumers step-in
      preProcessNodes(this._activeHierarchyDefinition, props.parentNode),
      // process hiding
      createHideIfNoChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n, requestContext: props.requestContext }).hasNodes),
      createHideNodesInHierarchyOperator(
        // note: for child nodes created because of hidden parent, we want to use parent's request props (instance filter, limit)
        (n) => this.getChildNodesObservables({ ...props, parentNode: n }).processedNodes,
        false,
      ),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* c8 ignore next */ () =>
            `[${props.requestContext.requestId}] Finished pre-processing child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
  }

  private createProcessedNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    props: GetHierarchyNodesProps & RequestContextProp,
  ): Observable<ProcessedHierarchyNode> {
    return preprocessedNodesObservable.pipe(
      createGroupingOperator(this.getPrimaryIModelAccess(), props.parentNode, this._valuesFormatter, this._localizedStrings, undefined, (gn) =>
        this.onGroupingNodeCreated(gn, props),
      ),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* c8 ignore next */ () =>
            `[${props.requestContext.requestId}] Finished grouping child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
  }

  private createFinalizedNodesObservable(
    processedNodesObservable: Observable<ProcessedHierarchyNode>,
    props: GetHierarchyNodesProps & RequestContextProp,
  ): Observable<HierarchyNode> {
    return processedNodesObservable.pipe(
      createDetermineChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n, requestContext: props.requestContext }).hasNodes),
      postProcessNodes(this._activeHierarchyDefinition, props.parentNode),
      sortNodesByLabelOperator,
      map((n): HierarchyNode => {
        if ("processingParams" in n) {
          delete n.processingParams;
        }
        return { ...n, children: hasChildren(n) };
      }),
      takeUntil(this._dispose),
      finalize(() =>
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* c8 ignore next */ () =>
            `[${props.requestContext.requestId}] Finished finalizing child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
        }),
      ),
    );
  }

  private createHasNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    possiblyKnownChildrenObservable: SourceNodesObservable | undefined,
    props: RequestContextProp,
  ): Observable<boolean> {
    const loggingCategory = `${LOGGING_NAMESPACE_INTERNAL}.HasNodes`;
    return concat((possiblyKnownChildrenObservable ?? EMPTY).pipe(filter((n) => hasChildren(n))), preprocessedNodesObservable).pipe(
      log({
        category: loggingCategory,
        message: /* c8 ignore next */ (n) => `[${props.requestContext.requestId}] Node before mapping to 'true': ${createNodeIdentifierForLogging(n)}`,
      }),
      take(1),
      map(() => true),
      defaultIfEmpty(false),
      catchError((e: Error) => {
        doLog({
          category: loggingCategory,
          message: /* c8 ignore next */ () => `[${props.requestContext.requestId}] Error while determining children: ${e.message}`,
        });
        if (e instanceof RowsLimitExceededError) {
          return of(true);
        }
        throw e;
      }),
      log({ category: loggingCategory, message: /* c8 ignore next */ (r) => `[${props.requestContext.requestId}] Result: ${r}` }),
    );
  }

  private getCachedObservableEntry(props: GetHierarchyNodesProps & RequestContextProp): HierarchyCacheEntry {
    const loggingCategory = `${LOGGING_NAMESPACE}.QueryResultsCache`;
    const { parentNode, ...restProps } = props;
    const cached = props.ignoreCache || !this._nodesCache ? undefined : this._nodesCache.get(props);
    if (cached) {
      doLog({
        category: loggingCategory,
        message: /* c8 ignore next */ () =>
          `[${props.requestContext.requestId}] Found query nodes observable for ${createNodeIdentifierForLogging(parentNode)}`,
      });
      return cached;
    }

    // if we don't find an entry for a grouping node, we load its instances by getting a query and applying
    // a search based on grouped instance keys
    let targetInstanceKeys: InstanceKey[] | undefined;
    let parentNonGroupingNode: ParentHierarchyNode<NonGroupingHierarchyNode> | undefined;
    if (parentNode) {
      if (HierarchyNode.isGroupingNode(parentNode)) {
        parentNonGroupingNode = parentNode.nonGroupingAncestor;
        targetInstanceKeys = parentNode.groupedInstanceKeys;
      } else {
        // not sure why type checker doesn't pick this up
        assert(HierarchyNode.isGeneric(parentNode) || HierarchyNode.isInstancesNode(parentNode));
        parentNonGroupingNode = parentNode;
      }
    }

    const nonGroupingNodeChildrenRequestProps = {
      ...restProps,
      parentNode: parentNonGroupingNode,
      ...(targetInstanceKeys ? { targetInstanceKeys } : undefined),
    };
    const value = { observable: this.createSourceNodesObservable(nonGroupingNodeChildrenRequestProps), processingStatus: "none" as const };
    this._nodesCache?.set(nonGroupingNodeChildrenRequestProps, value);
    doLog({
      category: loggingCategory,
      message: /* c8 ignore next */ () => `[${props.requestContext.requestId}] Saved query nodes observable for ${createNodeIdentifierForLogging(parentNode)}`,
    });
    return value;
  }

  private getChildNodesObservables(props: GetHierarchyNodesProps & { hierarchyLevelSizeLimit?: number | "unbounded" } & RequestContextProp) {
    const entry = this.getCachedObservableEntry(props);
    switch (entry.processingStatus) {
      case "none": {
        const pre = this.createPreProcessedNodesObservable(entry.observable, props);
        const post = this.createProcessedNodesObservable(pre, props);
        return {
          processedNodes: post,
          hasNodes: this.createHasNodesObservable(pre, entry.observable, props),
          finalizedNodes: this.createFinalizedNodesObservable(post, props),
        };
      }
      case "pre-processed": {
        const post = this.createProcessedNodesObservable(entry.observable, props);
        return {
          processedNodes: post,
          hasNodes: this.createHasNodesObservable(entry.observable, undefined, props),
          finalizedNodes: this.createFinalizedNodesObservable(post, props),
        };
      }
    }
  }

  /**
   * Creates and runs a query based on provided props, then processes retrieved nodes and returns them.
   */
  public getNodes(props: GetHierarchyNodesProps): AsyncIterableIterator<HierarchyNode> {
    const requestContext = { requestId: Guid.createValue() };
    const loggingCategory = `${LOGGING_NAMESPACE}.GetNodes`;
    const timer = new StopWatch(undefined, true);
    let error: any;
    let nodesCount = 0;
    doLog({
      category: loggingCategory,
      message: /* c8 ignore next */ () => `[${requestContext.requestId}] Requesting child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
    });
    return eachValueFrom(
      this.getChildNodesObservables({ ...props, requestContext }).finalizedNodes.pipe(
        tap(() => ++nodesCount),
        catchError((e) => {
          error = e;
          throw e;
        }),
        finalize(() => {
          doLog({
            category: loggingCategory,
            message: /* c8 ignore next */ () =>
              /* c8 ignore next 3 */ error
                ? `[${requestContext.requestId}] Error creating child nodes for ${createNodeIdentifierForLogging(props.parentNode)}: ${error instanceof Error ? error.message : error.toString()}`
                : `[${requestContext.requestId}] Returned ${nodesCount} child nodes for ${createNodeIdentifierForLogging(props.parentNode)} in ${timer.currentSeconds.toFixed(2)} s.`,
          });
        }),
      ),
    );
  }

  private getNodeInstanceKeysObs(props: Omit<GetHierarchyNodesProps, "ignoreCache"> & RequestContextProp): Observable<InstanceKey> {
    const { parentNode, instanceFilter, hierarchyLevelSizeLimit = "unbounded", requestContext } = props;
    if (parentNode && HierarchyNode.isGroupingNode(parentNode)) {
      return from(parentNode.groupedInstanceKeys);
    }
    assert(!parentNode || HierarchyNode.isGeneric(parentNode) || HierarchyNode.isInstancesNode(parentNode));

    // split the definitions based on whether they're for generic nodes or for instance nodes
    const hierarchyLevelDefinitions = this.createHierarchyLevelDefinitionsObservable({ parentNode, instanceFilter, requestContext });
    const [instanceDefs, genericDefs] = partition(
      hierarchyLevelDefinitions,
      (
        x,
      ): x is Omit<ObservedValueOf<typeof hierarchyLevelDefinitions>, "hierarchyNodesDefinition"> & {
        hierarchyNodesDefinition: InstanceNodesQueryDefinition;
      } => HierarchyNodesDefinition.isInstanceNodesQuery(x.hierarchyNodesDefinition),
    );

    // query instance keys and a flag whether they should be hidden
    const instanceKeys = instanceDefs.pipe(
      mergeMap(({ imodelAccess, hierarchyNodesDefinition: def }) =>
        this.getQueryScheduler(imodelAccess.imodelKey).scheduleSubscription(
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
              const reader = imodelAccess.createQueryReader(
                { ...query, ecsql },
                {
                  rowFormat: "Indexes",
                  limit: hierarchyLevelSizeLimit,
                  restartToken: `${this.#componentName}/${this.#componentId}/node-instance-keys/${Guid.createValue()}`,
                },
              );
              return from(reader).pipe(
                map((row) => ({
                  key: {
                    className: normalizeFullClassName(row[0]),
                    id: row[1],
                    imodelKey: imodelAccess.imodelKey,
                  } satisfies IModelInstanceKey,
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
      genericDefs.pipe(
        filter(({ hierarchyNodesDefinition }) => !!hierarchyNodesDefinition.node.processingParams?.hideInHierarchy),
        map(
          ({ hierarchyNodesDefinition }): GenericNodeKey => ({
            type: "generic",
            id: hierarchyNodesDefinition.node.key,
            source: this.#sourceName,
          }),
        ),
      ),
      hiddenNodeInstanceKeys.pipe(
        // first merge all keys by class
        reduceToMergeMapList(
          ({ key }) => key.className,
          ({ key }) => key,
        ),
        // then, for each class, create an instance key
        mergeMap((mergedMap): InstancesNodeKey[] =>
          [...mergedMap.entries()].map(([className, keys]) => ({
            type: "instances",
            instanceKeys: keys.map(({ id, imodelKey }) => ({ className, id, imodelKey })),
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
      hiddenParentNodes.pipe(mergeMap((hiddenNode) => this.getNodeInstanceKeysObs({ parentNode: hiddenNode, requestContext }))),
    ).pipe(takeUntil(this._dispose));
  }

  /**
   * Creates an iterator for all child hierarchy level instance keys, taking into account any hidden hierarchy levels
   * that there may be under the given parent node.
   */
  public getNodeInstanceKeys(props: Omit<GetHierarchyNodesProps, "ignoreCache">): AsyncIterableIterator<InstanceKey> {
    const requestContext = { requestId: Guid.createValue() };
    const loggingCategory = `${LOGGING_NAMESPACE}.GetNodeInstanceKeys`;
    const timer = new StopWatch(undefined, true);
    doLog({
      category: loggingCategory,
      message: /* c8 ignore next */ () => `[${requestContext.requestId}] Requesting keys for ${createNodeIdentifierForLogging(props.parentNode)}`,
    });
    let error: any;
    let keysCount = 0;
    return eachValueFrom(
      this.getNodeInstanceKeysObs({ ...props, requestContext }).pipe(
        tap(() => ++keysCount),
        catchError((e) => {
          error = e;
          throw e;
        }),
        finalize(() => {
          doLog({
            category: loggingCategory,
            message: /* c8 ignore next */ () =>
              /* c8 ignore next 3 */ error
                ? `[${requestContext.requestId}] Error creating node instance keys for ${createNodeIdentifierForLogging(props.parentNode)}: ${error instanceof Error ? error.message : error.toString()}`
                : `[${requestContext.requestId}] Returned ${keysCount} instance keys for ${createNodeIdentifierForLogging(props.parentNode)} in ${timer.currentSeconds.toFixed(2)} s.`,
          });
        }),
      ),
    );
  }
}

type SourceHierarchyNode = SourceInstanceHierarchyNode | (Omit<SourceGenericHierarchyNode, "key"> & { key: GenericNodeKey });
type SourceNodesObservable = Observable<SourceHierarchyNode>;
type ProcessedNodesObservable = Observable<ProcessedHierarchyNode>;
type HierarchyCacheEntry =
  | { observable: SourceNodesObservable; processingStatus: "none" }
  | { observable: ProcessedNodesObservable; processingStatus: "pre-processed" };

function preProcessNodes(hierarchyFactory: RxjsHierarchyDefinition, parentNode: ParentHierarchyNode | undefined) {
  return hierarchyFactory.preProcessNode ? processNodes(hierarchyFactory.preProcessNode, parentNode) : identity;
}

function postProcessNodes(hierarchyFactory: RxjsHierarchyDefinition, parentNode: ParentHierarchyNode | undefined) {
  return hierarchyFactory.postProcessNode ? processNodes(hierarchyFactory.postProcessNode, parentNode) : identity;
}

function processNodes<TNode>(
  processor: (props: { node: TNode; parentNode?: ParentHierarchyNode }) => Observable<TNode>,
  parentNode: ParentHierarchyNode | undefined,
) {
  return (nodes: Observable<TNode>) => nodes.pipe(mergeMap((node) => processor({ node, parentNode })));
}

function applyLabelsFormatting<TNode extends { label: string | ConcatenatedValue }>(
  node: TNode,
  valueFormatter: IPrimitiveValueFormatter,
): Observable<TNode & { label: string }> {
  return from(
    formatConcatenatedValue({
      value: node.label,
      valueFormatter,
    }),
  ).pipe(
    map((label) => ({
      ...node,
      label,
    })),
  );
}

function createParentNodeKeysList(parentNode: ParentHierarchyNode | undefined) {
  if (!parentNode) {
    return [];
  }
  return [...parentNode.parentKeys, parentNode.key];
}

function createInstanceKeysFilteredQuery(query: ECSqlQueryDef, targetInstanceKeys: InstanceKey[] | undefined): ECSqlQueryDef {
  if (!targetInstanceKeys || !targetInstanceKeys.length) {
    return query;
  }
  const MAX_ALLOWED_BINDINGS = 1000;
  if (targetInstanceKeys.length < MAX_ALLOWED_BINDINGS) {
    return {
      ...query,
      ecsql: `
        SELECT *
        FROM (${query.ecsql}) q
        WHERE q.ECInstanceId IN (${targetInstanceKeys.map(() => "?").join(",")})
      `,
      bindings: [...(query.bindings ?? []), ...targetInstanceKeys.map((k): ECSqlBinding => ({ type: "id", value: k.id }))],
    };
  }
  /* c8 ignore start */
  return {
    ...query,
    ecsql: `
      SELECT *
      FROM (${query.ecsql}) q
      WHERE InVirtualSet(?, q.ECInstanceId)
    `,
    bindings: [...(query.bindings ?? []), { type: "idset", value: targetInstanceKeys.map((k) => k.id) }],
  };
  /* c8 ignore end */
}

interface MergeNodesInput {
  imodelAccess: IModelAccess;
  imodelAccessIndex: number;
  node: SourceHierarchyNode;
}
function mergeNodes(source: ObservableInput<MergeNodesInput>) {
  return from(source).pipe(
    reduce((acc, input) => {
      for (let i = 0; i < acc.length; ++i) {
        if (input.imodelAccess === acc[i].imodelAccess) {
          // don't attempt to merge nodes if they come from the same provider
          continue;
        }

        // the first argument for `tryMergeNodes` acts as the primary data source, so we have to make sure we pass
        // the node with higher `imodelAccessIndex` first
        const candidates =
          input.imodelAccessIndex > acc[i].imodelAccessIndex
            ? { imodelAccess: input.imodelAccess, imodelAccessIndex: input.imodelAccessIndex, primary: input.node, secondary: acc[i].node }
            : { imodelAccess: acc[i].imodelAccess, imodelAccessIndex: acc[i].imodelAccessIndex, primary: acc[i].node, secondary: input.node };
        const merged = tryMergeNodes(candidates.primary, candidates.secondary);
        if (merged) {
          acc[i] = { node: merged, imodelAccess: candidates.imodelAccess, imodelAccessIndex: candidates.imodelAccessIndex };
          return acc;
        }
      }
      acc.push(input);
      return acc;
    }, new Array<MergeNodesInput>()),
    mergeAll(),
  );
}
function mergeSearchProps(primary: SourceHierarchyNode["search"], secondary: SourceHierarchyNode["search"]): SourceHierarchyNode["search"] {
  if (!primary || !secondary) {
    return primary ?? secondary;
  }

  const hasSearchTargetAncestor = primary.hasSearchTargetAncestor || secondary.hasSearchTargetAncestor;
  const childrenTargetPaths = [...(primary.childrenTargetPaths ?? []), ...(secondary.childrenTargetPaths ?? [])];
  return {
    ...(hasSearchTargetAncestor ? { hasSearchTargetAncestor } : undefined),
    ...(childrenTargetPaths.length ? { childrenTargetPaths } : undefined),
    ...(primary.isSearchTarget || secondary.isSearchTarget
      ? {
          isSearchTarget: true,
          searchTargetOptions: HierarchySearchPath.mergeOptions(
            primary.isSearchTarget ? primary.searchTargetOptions : undefined,
            secondary.isSearchTarget ? secondary.searchTargetOptions : undefined,
          ),
        }
      : {
          isSearchTarget: false,
        }),
  };
}
function tryMergeInstanceNodes(primary: SourceHierarchyNode, secondary: SourceHierarchyNode): SourceHierarchyNode | undefined {
  if (
    HierarchyNode.isInstancesNode(primary) &&
    HierarchyNode.isInstancesNode(secondary) &&
    primary.key.instanceKeys.some((lhsKey) => secondary.key.instanceKeys.some((rhsKey) => InstanceKey.equals(lhsKey, rhsKey)))
  ) {
    const searchProps = mergeSearchProps(primary.search, secondary.search);
    return {
      ...primary,
      key: {
        type: "instances",
        instanceKeys: primary.key.instanceKeys.concat(secondary.key.instanceKeys),
      },
      ...(searchProps ? { search: searchProps } : undefined),
    };
  }
  return undefined;
}
function tryMergeGenericNodes(primary: SourceHierarchyNode, secondary: SourceHierarchyNode): SourceHierarchyNode | undefined {
  if (HierarchyNode.isGeneric(primary) && HierarchyNode.isGeneric(secondary) && primary.key.id === secondary.key.id) {
    const searchProps = mergeSearchProps(primary.search, secondary.search);
    return {
      ...primary,
      ...(searchProps ? { search: searchProps } : undefined),
    };
  }
  return undefined;
}
function tryMergeNodes(primary: SourceHierarchyNode, secondary: SourceHierarchyNode): SourceHierarchyNode | undefined {
  return tryMergeInstanceNodes(primary, secondary) ?? tryMergeGenericNodes(primary, secondary) ?? undefined;
}

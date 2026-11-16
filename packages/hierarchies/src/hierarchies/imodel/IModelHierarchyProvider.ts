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
  first,
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
  throwError,
  toArray,
} from "rxjs";
import { assert, BeEvent, Guid, StopWatch } from "@itwin/core-bentley";
import {
  createDefaultValueFormatter,
  createIModelInstanceLabelSelectClauseFactory,
  eachValueFrom,
  formatConcatenatedValue,
  InstanceKey,
  normalizeFullClassName,
} from "@itwin/presentation-shared";
import { NodesQueryRowsLimitExceededError, RowsLimitExceededError } from "../HierarchyErrors.js";
import { HierarchyNode } from "../HierarchyNode.js";
import { HierarchySearchTree } from "../HierarchySearch.js";
import {
  LOGGING_NAMESPACE as BASE_LOGGING_NAMESPACE,
  LOGGING_NAMESPACE_INTERNAL as BASE_LOGGING_NAMESPACE_INTERNAL,
  LOGGING_NAMESPACE_PERFORMANCE as BASE_LOGGING_NAMESPACE_PERFORMANCE,
  createNodeIdentifierForLogging,
  hasChildren,
} from "../internal/Common.js";
import { doLog, log } from "../internal/LoggingUtils.js";
import { partition } from "../internal/operators/Partition.js";
import { reduceToMergeMapList } from "../internal/operators/ReduceToMergeMap.js";
import { shareReplayWithErrors } from "../internal/operators/ShareReplayWithErrors.js";
import { sortNodesByLabelOperator } from "../internal/operators/Sorting.js";
import { getRxjsHierarchyDefinition } from "../internal/RxjsHierarchyDefinition.js";
import { SubscriptionScheduler } from "../internal/SubscriptionScheduler.js";
import { HierarchyCache } from "./HierarchyCache.js";
import { HierarchyNodesDefinition } from "./IModelHierarchyDefinition.js";
import { ProcessedHierarchyNode } from "./IModelHierarchyNode.js";
import { createNodesQueryClauseFactory, NodeSelectClauseColumnNames } from "./NodeSelectQueryFactory.js";
import { createDetermineChildrenOperator } from "./operators/DetermineChildren.js";
import { createGroupingOperator } from "./operators/Grouping.js";
import { createHideIfNoChildrenOperator } from "./operators/HideIfNoChildren.js";
import { createHideNodesInHierarchyOperator } from "./operators/HideNodesInHierarchy.js";
import { SearchHierarchyDefinition } from "./SearchHierarchyDefinition.js";
import { parseNodes, readNodes } from "./TreeNodesReader.js";
import { ECSQL_PREFIX } from "./Utils.js";

import type { Observable, ObservableInput, ObservedValueOf } from "rxjs";
import type { GuidString } from "@itwin/core-bentley";
import type {
  ConcatenatedValue,
  ECSchemaProvider,
  ECSqlQueryDef,
  Event,
  EventArgs,
  IInstanceLabelSelectClauseFactory,
  IPrimitiveValueFormatter,
  Props,
} from "@itwin/presentation-shared";
import type { GroupingHierarchyNode, NonGroupingHierarchyNode, ParentHierarchyNode } from "../HierarchyNode.js";
import type { GenericNodeKey, HierarchyNodeKey, IModelInstanceKey } from "../HierarchyNodeKey.js";
import type { GetHierarchyNodesProps, HierarchyProvider } from "../HierarchyProvider.js";
import type {
  HierarchyDefinitionWithParentProps,
  ParentNodeProps,
  RxjsHierarchyDefinition,
} from "../internal/RxjsHierarchyDefinition.js";
import type {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyDefinition,
  InstanceNodesQueryDefinition,
} from "./IModelHierarchyDefinition.js";
import type {
  ProcessedGenericHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceGenericHierarchyNode,
  SourceInstanceHierarchyNode,
} from "./IModelHierarchyNode.js";
import type { LimitingECSqlQueryExecutor } from "./LimitingECSqlQueryExecutor.js";
import type { NodesQueryClauseFactory } from "./NodeSelectQueryFactory.js";

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
type IModelAccess = ECSchemaProvider & LimitingECSqlQueryExecutor & { imodelKey: string };

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
   */
  imodelAccess: IModelAccess;

  /**
   * An event that is raised when iModel data, that may affect the hierarchy, changes. The created provider
   * subscribes to the event to know that it needs to reload the data, and unsubscribes on disposal.
   */
  imodelChanged?: Event<() => void>;

  /**
   * A definition that describes how to create each level of the hierarchy. Its `defineHierarchyLevel` method is called
   * as needed to get the definitions for requested parent nodes.
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

  /**
   * Props for searching the hierarchy.
   *
   * Note: this just provides a quick way to set the search when creating a new hierarchy provider, but the
   * search can be changed at any time by calling `setHierarchySearch` on the provider instance.
   */
  search?: {
    /** A list of search trees that define paths from root to search target nodes. */
    paths: HierarchySearchTree[];
  };

  /**
   * A factory for creating ECSQL select clauses for instance labels. The clause is injected into
   * hierarchy node queries to select labels for instance-based nodes.
   *
   * Defaults to the result of `createIModelInstanceLabelSelectClauseFactory` called with the provided `imodelAccess`.
   *
   * @see `IInstanceLabelSelectClauseFactory`
   */
  instanceLabelSelectClauseFactory?: IInstanceLabelSelectClauseFactory;
}

/**
 * Creates an instance of `HierarchyProvider` that creates a hierarchy based on given the iModel and
 * a hierarchy definition, which defines each hierarchy level through ECSQL queries.
 *
 * @public
 */
export function createIModelHierarchyProvider(props: IModelHierarchyProviderProps): HierarchyProvider & Disposable {
  const { imodelAccess, imodelChanged, instanceLabelSelectClauseFactory, hierarchyDefinition, ...restProps } = props;
  return createMergedIModelHierarchyProvider({
    ...restProps,
    imodels: [{ imodelAccess, imodelChanged, instanceLabelSelectClauseFactory }],
    getHierarchyDefinition: () => hierarchyDefinition,
  });
}

/**
 * Props for `createMergedIModelHierarchyProvider`.
 * @public
 */
interface MergedIModelHierarchyProviderProps extends Omit<
  IModelHierarchyProviderProps,
  "imodelAccess" | "imodelChanged" | "instanceLabelSelectClauseFactory" | "hierarchyDefinition"
> {
  /**
   * Creates a hierarchy definition for each iModel, allowing definitions to use iModel-specific data and metadata.
   * Called once per iModel when the provider is created. The latest iModel's definition is used for
   * pre-processing and post-processing nodes after merging.
   */
  getHierarchyDefinition: (props: { imodelAccess: IModelAccess }) => HierarchyDefinition;

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
     */
    imodelAccess: IModelAccess;

    /**
     * An event that is raised when iModel data, that may affect the hierarchy, changes. The created provider
     * subscribes to the event to know that it needs to reload the data, and unsubscribes on disposal.
     */
    imodelChanged?: Event<() => void>;

    /**
     * A factory for creating ECSQL select clauses for instance labels. The clause is injected into
     * hierarchy node queries to select labels for instance-based nodes.
     *
     * Defaults to the result of `createIModelInstanceLabelSelectClauseFactory` called with the provided `imodelAccess`.
     *
     * @see `IInstanceLabelSelectClauseFactory`
     */
    instanceLabelSelectClauseFactory?: IInstanceLabelSelectClauseFactory;
  }>;
}

/**
 * Creates an instance of `HierarchyProvider` that creates a hierarchy based on multiple version of **the same** iModel
 * and a hierarchy definition, which defines each hierarchy level through ECSQL queries.
 * @public
 */
export function createMergedIModelHierarchyProvider(
  props: MergedIModelHierarchyProviderProps,
): HierarchyProvider & Disposable {
  const provider: HierarchyProvider & Disposable = new IModelHierarchyProviderImpl({
    ...props,
    // the provider passes grouping parent nodes only to `preProcessNode` and `postProcessNode`, so
    // `defineHierarchyLevel` and `parseNode` always get non-grouping parent nodes, as their types say
    getHierarchyDefinition: props.getHierarchyDefinition as (
      ...args: Parameters<typeof props.getHierarchyDefinition>
    ) => HierarchyDefinitionWithParentProps<ParentNodeProps>,
    parentPropsHandler: parentNodePropsHandler,
  });
  return provider;
}

interface RequestContextProp {
  requestContext: {
    requestId: string;
    /**
     * Collects errors of hierarchy levels that exceeded the limit while creating nodes for `getNodes`. When set, such
     * hierarchy levels don't fail - their nodes, created from rows read before the limit was exceeded, are used instead.
     */
    limitExceededErrors?: RowsLimitExceededError[];
  };
}

type WithSourceNameOverride<T> = T & { sourceName?: string };

/**
 * Functions that `IModelHierarchyProviderImpl` uses to work with props that identify the parent of a hierarchy level
 * (`TParentProps`), without knowing what the props are. This allows hierarchy levels to be identified by parent nodes,
 * paths of instance keys or anything else - whoever creates the provider supplies these functions.
 *
 * The provider passes the props to hierarchy definition's callbacks as they are.
 */
export interface HierarchyLevelParentPropsHandler<TParentProps extends {}> {
  /**
   * Returns the grouping node, if the parent of the hierarchy level is a grouping node. Grouping nodes are created by
   * the provider, and the provider passes them to `createGroupingNodeChildrenParentProps` to identify their children.
   *
   * The provider uses the node to limit groupings of its children, and to load its children by its grouped instance
   * keys, if they're not cached.
   */
  getGroupingParentNode(parentProps: TParentProps): ParentHierarchyNode<GroupingHierarchyNode> | undefined;

  /** Returns attributes, that the provider assigns to grouping nodes it creates for the hierarchy level. */
  getGroupingNodeAttributes(parentProps: TParentProps): Partial<Pick<GroupingHierarchyNode, "nonGroupingAncestor">>;

  /**
   * Returns keys of the hierarchy level's parent node and its ancestors, from the root. The keys are assigned to child
   * nodes as `parentKeys`, and used to cache hierarchy levels.
   */
  getParentKeys(parentProps: TParentProps): HierarchyNodeKey[];

  /**
   * Returns props of the hierarchy level, whose nodes are grouped by the given grouping parent node. Called only for
   * parents, that have `getGroupingParentNode`.
   */
  getGroupedHierarchyLevelParentProps(parentProps: TParentProps): TParentProps;

  /** Creates props that identify the hierarchy level of the given grouping node's children. */
  createGroupingNodeChildrenParentProps(props: {
    node: ProcessedGroupingHierarchyNode;
    parentProps: TParentProps;
  }): TParentProps;

  /**
   * Creates props that identify hierarchy levels of the given node's children. The node's children are nodes of all the
   * returned hierarchy levels - e.g. when parents are identified by single instance keys, a node with multiple instance
   * keys has a hierarchy level for each of them. Returns an empty list if the node's children can't be requested - such
   * nodes are considered to have no children.
   */
  createChildrenParentProps(props: { node: ProcessedHierarchyNode; parentProps: TParentProps }): TParentProps[];

  /**
   * Returns props of the hierarchy level, narrowed to the given iModel - used when the provider loads the hierarchy
   * level from multiple versions of the same iModel. Returns `undefined` if the iModel has no nodes for the hierarchy
   * level. Called only for non-grouping parents.
   */
  getIModelParentProps(props: {
    parentProps: TParentProps;
    imodelKey: string;
    sourceName: string;
  }): TParentProps | undefined;

  /**
   * Wraps the given hierarchy definition to apply hierarchy search. If not provided, hierarchy search is not supported
   * and it has no effect.
   */
  createSearchHierarchyDefinition?: (props: {
    imodelAccess: IModelAccess;
    source: RxjsHierarchyDefinition<TParentProps>;
    sourceName: string;
    targetPaths: HierarchySearchTree[];
  }) => RxjsHierarchyDefinition<TParentProps>;

  /** Creates a string that identifies the parent for logging purposes. */
  createIdentifierForLogging(parentProps: TParentProps): string;
}

/** Props for requesting a hierarchy level of a parent, identified by `TParentProps`. */
type HierarchyLevelRequest<TParentProps> = Omit<GetHierarchyNodesProps, "parentNode"> &
  RequestContextProp & { parentProps: TParentProps };

/** Props for `IModelHierarchyProviderImpl` constructor. */
type IModelHierarchyProviderImplProps<TParentProps extends {}> = WithSourceNameOverride<
  Omit<MergedIModelHierarchyProviderProps, "getHierarchyDefinition"> & {
    getHierarchyDefinition: (
      props: Props<MergedIModelHierarchyProviderProps["getHierarchyDefinition"]>,
    ) => HierarchyDefinitionWithParentProps<TParentProps>;
    /** Functions for working with props, that identify parents of hierarchy levels. */
    parentPropsHandler: HierarchyLevelParentPropsHandler<TParentProps>;
  }
>;

/**
 * An iModel hierarchy provider, whose hierarchy level requests identify parents by `TParentProps`. The provider doesn't
 * know what the props are - it uses the given `parentPropsHandler` to work with them, and passes them to the hierarchy
 * definition as they are.
 */
export class IModelHierarchyProviderImpl<TParentProps extends {}> {
  private readonly _imodelProps: MergedIModelHierarchyProviderProps["imodels"];
  private _imodelContexts: Array<{
    imodelAccess: IModelAccess;
    imodelChanged?: Event<() => void>;
    nodeSelectClauseFactory: NodesQueryClauseFactory;
    sourceHierarchyDefinition: RxjsHierarchyDefinition<TParentProps>;
  }>;
  readonly #parentPropsHandler: HierarchyLevelParentPropsHandler<TParentProps>;
  private _targetPaths?: HierarchySearchTree[];
  private _hierarchyChanged: BeEvent<(args: EventArgs<HierarchyProvider["hierarchyChanged"]>) => void>;
  private _valuesFormatter: IPrimitiveValueFormatter;
  private _localizedStrings: IModelHierarchyProviderLocalizedStrings;
  private _queryConcurrency: number;
  private _querySchedulers: Map<string, SubscriptionScheduler>;
  private _nodesCache?: HierarchyCache<HierarchyCacheEntry>;
  private _unsubscribe?: () => void;
  private _dispose = new Subject<void>();
  #componentId: GuidString;
  #componentName: string;
  #sourceName: string;

  public constructor(props: IModelHierarchyProviderImplProps<TParentProps>) {
    if (props.imodels.length === 0) {
      throw new Error(`Creating an iModel hierarchy provider requires at least one iModel.`);
    }

    this.#componentId = Guid.createValue();
    this.#componentName = "IModelHierarchyProviderImpl";
    this.#sourceName = props.sourceName ?? `${this.#componentName}:${this.#componentId}`;
    this._imodelProps = props.imodels;
    this.#parentPropsHandler = props.parentPropsHandler;
    this._imodelContexts = props.imodels.map((imodelProps) => {
      const sourceHierarchyDefinition = getRxjsHierarchyDefinition(
        props.getHierarchyDefinition({ imodelAccess: imodelProps.imodelAccess }),
      );
      return { ...this.#createIModelState(imodelProps), sourceHierarchyDefinition };
    });
    this._hierarchyChanged = new BeEvent();
    this._valuesFormatter = props.formatter ?? createDefaultValueFormatter();
    this._localizedStrings = { other: "Other", unspecified: "Not specified", ...props.localizedStrings };
    this._queryConcurrency = props.queryConcurrency ?? DEFAULT_QUERY_CONCURRENCY;
    this._querySchedulers = new Map();
    this.#setHierarchySearch(props.search);

    const queryCacheSize = props.queryCacheSize ?? DEFAULT_QUERY_CACHE_SIZE;
    if (queryCacheSize !== 0) {
      this._nodesCache = new HierarchyCache({
        // we divide the size by 2, because each variation also counts as a query that we cache
        size: Math.ceil(queryCacheSize / 2),
        variationsCount: 1,
      });
    }

    const imodelChangeSubscription = from(this._imodelContexts)
      .pipe(
        mergeMap(({ imodelAccess, imodelChanged }, index) =>
          imodelChanged
            ? fromEventPattern(
                (handler) => imodelChanged.addListener(handler),
                (handler) => imodelChanged.removeListener(handler),
                () => ({ imodelKey: imodelAccess.imodelKey, index }),
              )
            : EMPTY,
        ),
      )
      .subscribe(({ imodelKey, index }) => {
        this.invalidateHierarchyCache(`Data source changed: "${imodelKey}"`);
        this._dispose.next();
        // The iModel's schemas may have changed, so re-create the query factories to drop their schema-derived caches.
        this._imodelContexts[index] = {
          ...this._imodelContexts[index],
          ...this.#createIModelState(this._imodelProps[index]),
        };
        this._hierarchyChanged.raiseEvent({});
      });
    this._unsubscribe = () => {
      imodelChangeSubscription.unsubscribe();
    };
  }

  #createIModelState(imodelProps: MergedIModelHierarchyProviderProps["imodels"][number]) {
    const { imodelAccess, imodelChanged } = imodelProps;
    const instanceLabelSelectClauseFactory =
      imodelProps.instanceLabelSelectClauseFactory ?? createIModelInstanceLabelSelectClauseFactory({ imodelAccess });
    const nodeSelectClauseFactory = createNodesQueryClauseFactory({ imodelAccess, instanceLabelSelectClauseFactory });
    return { imodelAccess, imodelChanged, nodeSelectClauseFactory };
  }

  public [Symbol.dispose]() {
    this._dispose.next();
    this._unsubscribe?.();
  }

  /* v8 ignore next -- @preserve */
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

  private getPrimaryIModelContext() {
    return this._imodelContexts[this._imodelContexts.length - 1];
  }

  private getEffectiveHierarchyDefinition({
    imodelAccess,
    sourceHierarchyDefinition,
  }: {
    imodelAccess: IModelAccess;
    sourceHierarchyDefinition: RxjsHierarchyDefinition<TParentProps>;
  }): RxjsHierarchyDefinition<TParentProps> {
    const { createSearchHierarchyDefinition } = this.#parentPropsHandler;
    return this._targetPaths === undefined || !createSearchHierarchyDefinition
      ? sourceHierarchyDefinition
      : createSearchHierarchyDefinition({
          imodelAccess,
          source: sourceHierarchyDefinition,
          sourceName: this.#sourceName,
          targetPaths: this._targetPaths,
        });
  }

  private invalidateHierarchyCache(reason?: string) {
    /* v8 ignore next -- @preserve */
    doLog({
      category: `${LOGGING_NAMESPACE}.Events`,
      message: () => (reason ? `${reason}: clear hierarchy cache` : `Clear hierarchy cache`),
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
    this.#setHierarchySearch(props);
  }

  #setHierarchySearch(props: IModelHierarchyProviderProps["search"]) {
    if (!props) {
      if (this._targetPaths !== undefined) {
        this._targetPaths = undefined;
        this.invalidateHierarchyCache("Hierarchy search reset");
      }
      this._hierarchyChanged.raiseEvent({ searchChange: { newSearch: undefined } });
      return;
    }
    this._targetPaths = props.paths;
    this.invalidateHierarchyCache("Hierarchy search set");
    this._dispose.next();
    this._hierarchyChanged.raiseEvent({ searchChange: { newSearch: props } });
  }

  private onGroupingNodeCreated(
    groupingNode: ProcessedGroupingHierarchyNode,
    props: HierarchyLevelRequest<TParentProps>,
  ) {
    const childParentProps = this.#parentPropsHandler.createGroupingNodeChildrenParentProps({
      node: groupingNode,
      parentProps: props.parentProps,
    });
    Object.assign(groupingNode, this.#parentPropsHandler.getGroupingNodeAttributes(props.parentProps));
    this._nodesCache?.set(
      { ...props, parentKeys: this.#parentPropsHandler.getParentKeys(childParentProps) },
      { observable: from(groupingNode.children), processingStatus: "pre-processed" },
    );
  }

  private createHierarchyLevelDefinitionsObservable(
    props: Pick<HierarchyLevelRequest<TParentProps>, "parentProps" | "instanceFilter" | "requestContext">,
  ): Observable<
    {
      imodelAccess: IModelAccess;
      imodelAccessIndex: number;
      hierarchyDefinition: RxjsHierarchyDefinition<TParentProps>;
      imodelParentProps: TParentProps;
    } & (
      | { hierarchyNodesDefinition: GenericHierarchyNodeDefinition }
      | { hierarchyNodesDefinition: InstanceNodesQueryDefinition }
    )
  > {
    const { requestContext, instanceFilter, parentProps } = props;
    /* v8 ignore next -- @preserve */
    doLog({
      category: LOGGING_NAMESPACE_PERFORMANCE,
      message: () =>
        `[${requestContext.requestId}] Requesting hierarchy level definitions for ${this.#parentPropsHandler.createIdentifierForLogging(parentProps)}`,
    });

    return from(this._imodelContexts).pipe(
      map((context) => ({ ...context, hierarchyDefinition: this.getEffectiveHierarchyDefinition(context) })),
      mergeMap(({ imodelAccess, nodeSelectClauseFactory, hierarchyDefinition }, imodelAccessIndex) => {
        const imodelParentProps = this.#parentPropsHandler.getIModelParentProps({
          parentProps,
          imodelKey: imodelAccess.imodelKey,
          sourceName: this.#sourceName,
        });
        if (!imodelParentProps) {
          return EMPTY;
        }
        return hierarchyDefinition
          .defineHierarchyLevel(
            createDefineHierarchyLevelProps(imodelParentProps, {
              instanceFilter,
              createSelectClause: async (selectClauseProps) =>
                nodeSelectClauseFactory.createSelectClause(selectClauseProps),
              /* v8 ignore start */
              createFilterClauses: async (filterClausesProps) =>
                nodeSelectClauseFactory.createFilterClauses(filterClausesProps),
              /* v8 ignore stop */
            }),
          )
          .pipe(
            mergeAll(),
            map(
              /* Using `as` to work around TS not understanding that `{ x: A, y: B | C }` is the same as `{ x: A } & ({ y: B } | { y: C })` */
              (hierarchyNodesDefinition) =>
                ({
                  imodelAccess,
                  imodelAccessIndex,
                  hierarchyDefinition,
                  imodelParentProps,
                  hierarchyNodesDefinition,
                }) as ObservedValueOf<ReturnType<typeof this.createHierarchyLevelDefinitionsObservable>>,
            ),
          );
      }),
      finalize(() => {
        /* v8 ignore next -- @preserve */
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: () =>
            `[${requestContext.requestId}] Received all hierarchy level definitions for ${this.#parentPropsHandler.createIdentifierForLogging(parentProps)}`,
        });
      }),
    );
  }

  private createSourceNodesObservable(
    props: HierarchyLevelRequest<TParentProps> & { targetInstanceKeys?: InstanceKey[] },
  ): SourceNodesObservable {
    // the observable is shared and never re-subscribed (see `shareReplayWithErrors` below), so there's no need to
    // scope the errors' list per subscription
    const limitExceededErrors: RowsLimitExceededError[] = [];
    const createSourceNodesFromDefinition = ({
      imodelAccess,
      hierarchyDefinition: { parseNode },
      imodelParentProps,
      hierarchyNodesDefinition: def,
    }: ObservedValueOf<
      ReturnType<typeof this.createHierarchyLevelDefinitionsObservable>
    >): Observable<SourceHierarchyNode> => {
      if (HierarchyNodesDefinition.isGenericNode(def)) {
        return of({ ...def.node, key: { type: "generic" as const, id: def.node.key, source: this.#sourceName } });
      }
      const query = createInstanceKeysFilteredQuery(def.query, props.targetInstanceKeys);
      const parser: Props<typeof parseNodes>["parser"] = parseNode
        ? ({ row }) => parseNode({ ...imodelParentProps, row, imodelKey: imodelAccess.imodelKey })
        : undefined;
      return this.getQueryScheduler(imodelAccess.imodelKey).scheduleSubscription(
        readNodes({ queryExecutor: imodelAccess, query, limit: props.hierarchyLevelSizeLimit, parser }).pipe(
          catchError((e) => {
            if (!(e instanceof RowsLimitExceededError)) {
              throw e;
            }
            // don't fail other definitions of the hierarchy level - emit nodes created from rows that were read before
            // the limit was exceeded, and fail the hierarchy level after all its nodes are emitted
            limitExceededErrors.push(e);
            return parseNodes({ rows: e.rows, parser });
          }),
          map((node): SourceInstanceHierarchyNode => ({
            ...node,
            key: {
              ...node.key,
              instanceKeys: node.key.instanceKeys.map((key) => ({ ...key, imodelKey: imodelAccess.imodelKey })),
            },
          })),
        ),
      );
    };

    const definitions = this.createHierarchyLevelDefinitionsObservable(props);
    let sourceNodes: Observable<SourceHierarchyNode>;
    if (this._imodelContexts.length === 1) {
      sourceNodes = definitions.pipe(mergeMap((definition) => createSourceNodesFromDefinition(definition)));
    } else {
      sourceNodes = definitions.pipe(
        mergeMap((definition) =>
          createSourceNodesFromDefinition(definition).pipe(
            map((node: SourceHierarchyNode) => ({
              imodelAccess: definition.imodelAccess,
              imodelAccessIndex: definition.imodelAccessIndex,
              node,
            })),
          ),
        ),
        mergeNodes,
        map(({ node }) => node),
      );
    }

    // the error is emitted after all nodes, so caching the observable caches both - nodes and the error
    return concat(
      sourceNodes,
      // check for errors only after all nodes are emitted
      defer(() => (limitExceededErrors.length ? throwError(() => limitExceededErrors[0]) : EMPTY)),
    ).pipe(
      finalize(() => {
        /* v8 ignore next -- @preserve */
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: () =>
            `[${props.requestContext.requestId}] Read all child nodes ${this.#parentPropsHandler.createIdentifierForLogging(props.parentProps)}`,
        });
      }),
      shareReplayWithErrors(),
    );
  }

  private createPreProcessedNodesObservable({
    sourceNodes,
    keepHiddenNodes,
    ...props
  }: HierarchyLevelRequest<TParentProps> & {
    sourceNodes: SourceNodesObservable;
    /** When set, nodes hidden in the hierarchy are kept instead of being replaced with their children. */
    keepHiddenNodes?: boolean;
  }): Observable<ProcessedHierarchyNode> {
    return sourceNodes.pipe(
      catchError((e) => {
        // source nodes observable emits nodes created from rows that were read before the limit was exceeded, and only
        // then fails - if requested, collect the error and let the nodes go through the rest of the pipeline
        const { limitExceededErrors } = props.requestContext;
        if (e instanceof RowsLimitExceededError && limitExceededErrors) {
          limitExceededErrors.push(e);
          return EMPTY;
        }
        throw e;
      }),
      // we're going to be mutating the nodes, but don't want to mutate the original one, so just clone it here once
      map((node) => ({ ...node })),
      // set parent node keys on the source node
      map((node) => Object.assign(node, { parentKeys: this.#parentPropsHandler.getParentKeys(props.parentProps) })),
      // format `ConcatenatedValue` labels into string labels
      mergeMap((node) => applyLabelsFormatting(node, this._valuesFormatter)),
      // we have `ProcessedHierarchyNode` from here
      // let consumers step-in
      preProcessNodes(this.getEffectiveHierarchyDefinition(this.getPrimaryIModelContext()), props.parentProps),
      // process hiding
      createHideIfNoChildrenOperator((n) => this.hasChildNodes(n, props)),
      keepHiddenNodes
        ? identity
        : createHideNodesInHierarchyOperator(
            // note: for child nodes created because of hidden parent, we want to use parent's request props (instance filter, limit)
            (n) =>
              merge(
                ...this.#parentPropsHandler
                  .createChildrenParentProps({ node: n, parentProps: props.parentProps })
                  .map((parentProps) => this.getChildNodesObservables({ ...props, parentProps }).processedNodes),
              ),
            false,
          ),
      finalize(() => {
        /* v8 ignore next -- @preserve */
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: () =>
            `[${props.requestContext.requestId}] Finished pre-processing child nodes for ${this.#parentPropsHandler.createIdentifierForLogging(props.parentProps)}`,
        });
      }),
    );
  }

  private createProcessedNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    props: HierarchyLevelRequest<TParentProps>,
  ): Observable<ProcessedHierarchyNode> {
    return preprocessedNodesObservable.pipe(
      createGroupingOperator(
        this.getPrimaryIModelContext().imodelAccess,
        this.#parentPropsHandler.getGroupingParentNode(props.parentProps),
        this._valuesFormatter,
        this._localizedStrings,
        undefined,
        (gn) => this.onGroupingNodeCreated(gn, props),
      ),
      finalize(() => {
        /* v8 ignore next -- @preserve */
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: () =>
            `[${props.requestContext.requestId}] Finished grouping child nodes for ${this.#parentPropsHandler.createIdentifierForLogging(props.parentProps)}`,
        });
      }),
    );
  }

  private createFinalizedNodesObservable(
    processedNodesObservable: Observable<ProcessedHierarchyNode>,
    props: HierarchyLevelRequest<TParentProps>,
  ): Observable<HierarchyNode> {
    return processedNodesObservable.pipe(
      createDetermineChildrenOperator((n) => this.hasChildNodes(n, props)),
      postProcessNodes(this.getEffectiveHierarchyDefinition(this.getPrimaryIModelContext()), props.parentProps),
      sortNodesByLabelOperator,
      map((n): HierarchyNode => {
        if ("processingParams" in n) {
          delete n.processingParams;
        }
        return { ...n, children: hasChildren(n) };
      }),
      takeUntil(this._dispose),
      finalize(() => {
        /* v8 ignore next -- @preserve */
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: () =>
            `[${props.requestContext.requestId}] Finished finalizing child nodes for ${this.#parentPropsHandler.createIdentifierForLogging(props.parentProps)}`,
        });
      }),
    );
  }

  private createHasNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    possiblyKnownChildrenObservable: SourceNodesObservable | undefined,
    props: RequestContextProp,
  ): Observable<boolean> {
    const loggingCategory = `${LOGGING_NAMESPACE_INTERNAL}.HasNodes`;
    return concat(
      (possiblyKnownChildrenObservable ?? EMPTY).pipe(filter((n) => hasChildren(n))),
      preprocessedNodesObservable,
    ).pipe(
      /* v8 ignore next -- @preserve */
      log({
        category: loggingCategory,
        message: (n) =>
          `[${props.requestContext.requestId}] Node before mapping to 'true': ${createNodeIdentifierForLogging(n)}`,
      }),
      take(1),
      map(() => true),
      defaultIfEmpty(false),
      catchError((e: Error) => {
        /* v8 ignore next -- @preserve */
        doLog({
          category: loggingCategory,
          message: () => `[${props.requestContext.requestId}] Error while determining children: ${e.message}`,
        });
        if (e instanceof RowsLimitExceededError) {
          return of(true);
        }
        throw e;
      }),
      /* v8 ignore next -- @preserve */
      log({ category: loggingCategory, message: (r) => `[${props.requestContext.requestId}] Result: ${r}` }),
    );
  }

  private getCachedObservableEntry(props: HierarchyLevelRequest<TParentProps>): HierarchyCacheEntry {
    const loggingCategory = `${LOGGING_NAMESPACE}.QueryResultsCache`;
    const handler = this.#parentPropsHandler;
    const cached =
      props.ignoreCache || !this._nodesCache
        ? undefined
        : this._nodesCache.get({ ...props, parentKeys: handler.getParentKeys(props.parentProps) });
    if (cached) {
      /* v8 ignore next -- @preserve */
      doLog({
        category: loggingCategory,
        message: () =>
          `[${props.requestContext.requestId}] Found query nodes observable for ${handler.createIdentifierForLogging(props.parentProps)}`,
      });
      return cached;
    }

    // if we don't find an entry for a grouping node, we load its instances by getting a query and applying
    // a search based on grouped instance keys
    const groupingParentNode = handler.getGroupingParentNode(props.parentProps);
    const nonGroupingNodeChildrenRequestProps = groupingParentNode
      ? {
          ...props,
          parentProps: handler.getGroupedHierarchyLevelParentProps(props.parentProps),
          targetInstanceKeys: groupingParentNode.groupedInstanceKeys,
        }
      : props;
    const value = {
      observable: this.createSourceNodesObservable(nonGroupingNodeChildrenRequestProps),
      processingStatus: "none" as const,
    };
    this._nodesCache?.set(
      {
        ...nonGroupingNodeChildrenRequestProps,
        parentKeys: handler.getParentKeys(nonGroupingNodeChildrenRequestProps.parentProps),
      },
      value,
    );
    /* v8 ignore next -- @preserve */
    doLog({
      category: loggingCategory,
      message: () =>
        `[${props.requestContext.requestId}] Saved query nodes observable for ${handler.createIdentifierForLogging(props.parentProps)}`,
    });
    return value;
  }

  private createFinalizedNodesWithHiddenNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    props: HierarchyLevelRequest<TParentProps>,
  ): Observable<HierarchyNode & { isHidden?: boolean }> {
    return defer(() => {
      // hidden nodes skip grouping and finalization
      const [hiddenNodes, visibleNodes] = partition(preprocessedNodesObservable, isHiddenNode);
      return merge(
        hiddenNodes.pipe(
          map(({ processingParams: _, ...node }) => ({ ...node, children: node.children !== false, isHidden: true })),
        ),
        this.createFinalizedNodesObservable(this.createProcessedNodesObservable(visibleNodes, props), props),
      );
    });
  }

  /** Determines whether the given node has children. */
  private hasChildNodes(node: ProcessedHierarchyNode, props: HierarchyLevelRequest<TParentProps>) {
    return merge(
      ...this.#parentPropsHandler
        .createChildrenParentProps({ node, parentProps: props.parentProps })
        .map(
          (parentProps) =>
            this.getChildNodesObservables({ parentProps, requestContext: props.requestContext }).hasNodes,
        ),
    ).pipe(first((hasNodes) => hasNodes, false));
  }

  private getChildNodesObservables(props: HierarchyLevelRequest<TParentProps> & { returnHiddenNodes?: boolean }) {
    const { returnHiddenNodes, ...requestProps } = props;
    const entry = this.getCachedObservableEntry(requestProps);
    const createPreProcessedNodes = (
      requestContext: RequestContextProp["requestContext"],
      keepHiddenNodes?: boolean,
    ) =>
      entry.processingStatus === "none"
        ? this.createPreProcessedNodesObservable({
            ...requestProps,
            requestContext,
            sourceNodes: entry.observable,
            keepHiddenNodes,
          })
        : entry.observable;
    const processedNodes = this.createProcessedNodesObservable(
      createPreProcessedNodes(requestProps.requestContext),
      requestProps,
    );
    return {
      processedNodes,
      hasNodes: this.createHasNodesObservable(
        // determining children treats hierarchy level exceeding the limit as having children - don't record such errors
        // into request's limit exceeded errors, because the request itself doesn't contain nodes of this hierarchy level
        createPreProcessedNodes({ ...requestProps.requestContext, limitExceededErrors: undefined }),
        entry.processingStatus === "none" ? entry.observable : undefined,
        requestProps,
      ),
      finalizedNodes: returnHiddenNodes
        ? this.createFinalizedNodesWithHiddenNodesObservable(
            createPreProcessedNodes(requestProps.requestContext, true),
            requestProps,
          )
        : this.createFinalizedNodesObservable(processedNodes, requestProps),
    };
  }

  /**
   * Creates and runs a query based on provided props, then processes retrieved nodes and returns them.
   */
  public getNodes(
    props: Omit<GetHierarchyNodesProps, "parentNode"> & TParentProps,
  ): AsyncIterableIterator<HierarchyNode> {
    return eachValueFrom(this.getNodesObservable(props));
  }

  /**
   * Same as `getNodes`, but returns an observable. When `returnHiddenNodes` is set, nodes that are hidden in the
   * hierarchy are returned with `isHidden` flag instead of their children, and they're not grouped.
   */
  public getNodesObservable(
    props: Omit<GetHierarchyNodesProps, "parentNode"> & { returnHiddenNodes?: boolean } & TParentProps,
  ): Observable<HierarchyNode & { isHidden?: boolean }> {
    const { parentProps, ...requestProps } = splitRequestProps(props);
    const limitExceededErrors: RowsLimitExceededError[] = [];
    const requestContext = { requestId: Guid.createValue(), limitExceededErrors };
    const loggingCategory = `${LOGGING_NAMESPACE}.GetNodes`;
    const timer = new StopWatch(undefined, true);
    let error: any;
    let nodesCount = 0;
    /* v8 ignore next -- @preserve */
    doLog({
      category: loggingCategory,
      message: () =>
        `[${requestContext.requestId}] Requesting child nodes for ${this.#parentPropsHandler.createIdentifierForLogging(parentProps)}`,
    });
    return this.getChildNodesObservables({ ...requestProps, parentProps, requestContext }).finalizedNodes.pipe(
      toArray(),
      mergeMap((nodes) =>
        // hierarchy levels that exceeded the limit didn't fail, so that their nodes are created - fail the request now
        limitExceededErrors.length
          ? throwError(
              () =>
                new NodesQueryRowsLimitExceededError({
                  limit: Math.min(...limitExceededErrors.map((e) => e.limit)),
                  nodes,
                }),
            )
          : from(nodes),
      ),
      tap(() => ++nodesCount),
      catchError((e) => {
        error = e;
        throw e;
      }),
      finalize(() => {
        /* v8 ignore next -- @preserve */
        doLog({
          category: loggingCategory,
          message: () =>
            error
              ? `[${requestContext.requestId}] Error creating child nodes for ${this.#parentPropsHandler.createIdentifierForLogging(parentProps)}: ${error instanceof Error ? error.message : error.toString()}`
              : `[${requestContext.requestId}] Returned ${nodesCount} child nodes for ${this.#parentPropsHandler.createIdentifierForLogging(parentProps)} in ${timer.currentSeconds.toFixed(2)} s.`,
        });
      }),
    );
  }

  private getNodeInstanceKeysObs(
    props: Omit<HierarchyLevelRequest<TParentProps>, "ignoreCache">,
  ): Observable<InstanceKey> {
    const { parentProps, instanceFilter, hierarchyLevelSizeLimit = "unbounded", requestContext } = props;
    const groupingParentNode = this.#parentPropsHandler.getGroupingParentNode(parentProps);
    if (groupingParentNode) {
      return from(groupingParentNode.groupedInstanceKeys);
    }

    // split the definitions based on whether they're for generic nodes or for instance nodes
    const hierarchyLevelDefinitions = this.createHierarchyLevelDefinitionsObservable({
      parentProps,
      instanceFilter,
      requestContext,
    });
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
        map(({ hierarchyNodesDefinition }): ProcessedGenericHierarchyNode => ({
          key: { type: "generic", id: hierarchyNodesDefinition.node.key, source: this.#sourceName },
          parentKeys: [],
          label: "",
        })),
      ),
      hiddenNodeInstanceKeys.pipe(
        // first merge all keys by class
        reduceToMergeMapList(
          ({ key }) => key.className,
          ({ key }) => key,
        ),
        // then, for each class, create an instances node
        mergeMap((mergedMap): ProcessedInstanceHierarchyNode[] =>
          [...mergedMap.entries()].map(([className, keys]) => ({
            key: { type: "instances", instanceKeys: keys.map(({ id, imodelKey }) => ({ className, id, imodelKey })) },
            parentKeys: [],
            label: "",
          })),
        ),
      ),
    );

    // merge visible instance keys from this level & the ones we get recursively requesting from deeper levels
    return merge(
      visibleNodeInstanceKeys.pipe(map(({ key }) => key)),
      hiddenParentNodes.pipe(
        mergeMap((hiddenNode) =>
          merge(
            ...this.#parentPropsHandler
              .createChildrenParentProps({ node: hiddenNode, parentProps })
              .map((childParentProps) =>
                this.getNodeInstanceKeysObs({ parentProps: childParentProps, requestContext }),
              ),
          ),
        ),
      ),
    ).pipe(takeUntil(this._dispose));
  }

  /**
   * Creates an iterator for all child hierarchy level instance keys, taking into account any hidden hierarchy levels
   * that there may be under the given parent node.
   */
  public getNodeInstanceKeys(
    props: Omit<GetHierarchyNodesProps, "parentNode" | "ignoreCache"> & TParentProps,
  ): AsyncIterableIterator<InstanceKey> {
    const { parentProps, instanceFilter, hierarchyLevelSizeLimit } = splitRequestProps(props);
    const handler = this.#parentPropsHandler;
    const requestContext = { requestId: Guid.createValue() };
    const loggingCategory = `${LOGGING_NAMESPACE}.GetNodeInstanceKeys`;
    const timer = new StopWatch(undefined, true);
    /* v8 ignore next -- @preserve */
    doLog({
      category: loggingCategory,
      message: () =>
        `[${requestContext.requestId}] Requesting keys for ${handler.createIdentifierForLogging(parentProps)}`,
    });
    let error: any;
    let keysCount = 0;
    return eachValueFrom(
      this.getNodeInstanceKeysObs({
        instanceFilter,
        hierarchyLevelSizeLimit,
        parentProps: parentProps,
        requestContext,
      }).pipe(
        tap(() => ++keysCount),
        catchError((e) => {
          error = e;
          throw e;
        }),
        finalize(() => {
          /* v8 ignore next -- @preserve */
          doLog({
            category: loggingCategory,
            message: () =>
              error
                ? `[${requestContext.requestId}] Error creating node instance keys for ${handler.createIdentifierForLogging(parentProps)}: ${error instanceof Error ? error.message : error.toString()}`
                : `[${requestContext.requestId}] Returned ${keysCount} instance keys for ${handler.createIdentifierForLogging(parentProps)} in ${timer.currentSeconds.toFixed(2)} s.`,
          });
        }),
      ),
    );
  }
}

type SourceHierarchyNode =
  | SourceInstanceHierarchyNode
  | (Omit<SourceGenericHierarchyNode, "key"> & { key: GenericNodeKey });
type SourceNodesObservable = Observable<SourceHierarchyNode>;
type ProcessedNodesObservable = Observable<ProcessedHierarchyNode>;
type HierarchyCacheEntry =
  | { observable: SourceNodesObservable; processingStatus: "none" }
  | { observable: ProcessedNodesObservable; processingStatus: "pre-processed" };

function isHiddenNode(
  node: ProcessedHierarchyNode,
): node is ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode {
  return !ProcessedHierarchyNode.isGroupingNode(node) && !!node.processingParams?.hideInHierarchy;
}

/** Splits props of a hierarchy level request into props that identify the parent, and the rest. */
function splitRequestProps<TParentProps extends {}>(
  props: Omit<GetHierarchyNodesProps, "parentNode"> & { returnHiddenNodes?: boolean } & TParentProps,
) {
  const { instanceFilter, hierarchyLevelSizeLimit, ignoreCache, returnHiddenNodes, ...parentProps } = props;
  return {
    instanceFilter,
    hierarchyLevelSizeLimit,
    ignoreCache,
    returnHiddenNodes,
    // the rest of the props identify the parent, but TS can't infer that for generic types
    parentProps: parentProps as unknown as TParentProps,
  };
}

function createDefineHierarchyLevelProps<TParentProps extends {}>(
  parentProps: TParentProps,
  props: Omit<DefineHierarchyLevelProps, "parentNode">,
): DefineHierarchyLevelProps<TParentProps> {
  return { ...parentProps, ...props };
}

function preProcessNodes<TParentProps extends {}>(
  { preProcessNode }: RxjsHierarchyDefinition<TParentProps>,
  parentProps: TParentProps,
) {
  return preProcessNode
    ? (nodes: Observable<ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode>) =>
        nodes.pipe(mergeMap((node) => preProcessNode({ node, ...parentProps })))
    : identity;
}

function postProcessNodes<TParentProps extends {}>(
  { postProcessNode }: RxjsHierarchyDefinition<TParentProps>,
  parentProps: TParentProps,
) {
  return postProcessNode
    ? (nodes: Observable<ProcessedHierarchyNode>) =>
        nodes.pipe(mergeMap((node) => postProcessNode({ node, ...parentProps })))
    : identity;
}

function getNonGroupingParentNode(
  parentNode: ParentHierarchyNode | undefined,
): ParentHierarchyNode<NonGroupingHierarchyNode> | undefined {
  if (!parentNode) {
    return undefined;
  }
  if (HierarchyNode.isGroupingNode(parentNode)) {
    return parentNode.nonGroupingAncestor;
  }
  // not sure why type checker doesn't pick this up
  assert(HierarchyNode.isGeneric(parentNode) || HierarchyNode.isInstancesNode(parentNode));
  return parentNode;
}

/** Handles hierarchy levels identified by parent nodes - the default for hierarchy definitions. */
const parentNodePropsHandler: HierarchyLevelParentPropsHandler<ParentNodeProps> = {
  getGroupingParentNode: ({ parentNode }) =>
    parentNode && HierarchyNode.isGroupingNode(parentNode) ? parentNode : undefined,
  getGroupingNodeAttributes: ({ parentNode }) => {
    const nonGroupingAncestor = getNonGroupingParentNode(parentNode);
    return nonGroupingAncestor ? { nonGroupingAncestor } : {};
  },
  getParentKeys: ({ parentNode }) => (parentNode ? [...parentNode.parentKeys, parentNode.key] : []),
  getGroupedHierarchyLevelParentProps: ({ parentNode }) => ({ parentNode: getNonGroupingParentNode(parentNode) }),
  createGroupingNodeChildrenParentProps: ({ node }) => ({ parentNode: node }),
  createChildrenParentProps: ({ node }) => [{ parentNode: node }],
  getIModelParentProps: ({ parentProps: { parentNode }, imodelKey, sourceName }) => {
    if (!parentNode) {
      return { parentNode };
    }
    // not sure why type checker doesn't pick this up
    assert(HierarchyNode.isGeneric(parentNode) || HierarchyNode.isInstancesNode(parentNode));
    if (HierarchyNode.isGeneric(parentNode)) {
      // generic nodes of other providers have no children in this provider
      return parentNode.key.source && parentNode.key.source !== sourceName ? undefined : { parentNode };
    }
    // only take instance keys of the iModel the hierarchy level is loaded from
    const instanceKeys = parentNode.key.instanceKeys.filter((ik) => !ik.imodelKey || ik.imodelKey === imodelKey);
    return instanceKeys.length === 0
      ? undefined
      : { parentNode: { ...parentNode, key: { ...parentNode.key, instanceKeys } } };
  },
  createSearchHierarchyDefinition: (props) => new SearchHierarchyDefinition(props),
  /* v8 ignore next -- @preserve */
  createIdentifierForLogging: ({ parentNode }) => createNodeIdentifierForLogging(parentNode),
};

function applyLabelsFormatting<TNode extends { label: string | ConcatenatedValue }>(
  node: TNode,
  valueFormatter: IPrimitiveValueFormatter,
): Observable<TNode & { label: string }> {
  return from(formatConcatenatedValue({ value: node.label, valueFormatter })).pipe(
    map((label) => ({ ...node, label })),
  );
}

function createInstanceKeysFilteredQuery(
  query: ECSqlQueryDef,
  targetInstanceKeys: InstanceKey[] | undefined,
): ECSqlQueryDef {
  if (!targetInstanceKeys || !targetInstanceKeys.length) {
    return query;
  }

  if (Array.isArray(query.bindings)) {
    return {
      ...query,
      ecsql: `
        SELECT *
        FROM (${query.ecsql}) q
        JOIN IdSet(?) targetInstanceKeys ON targetInstanceKeys.id = q.ECInstanceId
        ECSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES
      `,
      bindings: [...query.bindings, { type: "idset", value: targetInstanceKeys.map((k) => k.id) }],
    };
  }
  const ecsqlVarTargetInstanceKeys = `${ECSQL_PREFIX}targetInstanceKeys`;
  return {
    ...query,
    ecsql: `
      SELECT *
      FROM (${query.ecsql}) q
      JOIN IdSet(:${ecsqlVarTargetInstanceKeys}) targetInstanceKeys ON targetInstanceKeys.id = q.ECInstanceId
      ECSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES
    `,
    bindings: {
      ...query.bindings,
      [ecsqlVarTargetInstanceKeys]: { type: "idset", value: targetInstanceKeys.map((k) => k.id) },
    },
  };
}

interface MergeNodesInput {
  imodelAccess: IModelAccess;
  imodelAccessIndex: number;
  node: SourceHierarchyNode;
}
// TODO: MISSING_COVERAGE
/* v8 ignore start */
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
            ? {
                imodelAccess: input.imodelAccess,
                imodelAccessIndex: input.imodelAccessIndex,
                primary: input.node,
                secondary: acc[i].node,
              }
            : {
                imodelAccess: acc[i].imodelAccess,
                imodelAccessIndex: acc[i].imodelAccessIndex,
                primary: acc[i].node,
                secondary: input.node,
              };
        const merged = tryMergeNodes(candidates.primary, candidates.secondary);
        if (merged) {
          acc[i] = {
            node: merged,
            imodelAccess: candidates.imodelAccess,
            imodelAccessIndex: candidates.imodelAccessIndex,
          };
          return acc;
        }
      }
      acc.push(input);
      return acc;
    }, new Array<MergeNodesInput>()),
    mergeAll(),
  );
}
function mergeSearchAttribute(
  primary: SourceHierarchyNode["search"],
  secondary: SourceHierarchyNode["search"],
): SourceHierarchyNode["search"] {
  if (!primary) {
    return secondary;
  }
  if (!secondary) {
    return primary;
  }

  const hasSearchTargetAncestor = primary.hasSearchTargetAncestor || secondary.hasSearchTargetAncestor;
  const isSearchTarget = primary.isSearchTarget || secondary.isSearchTarget;
  const searchOptions = HierarchySearchTree.mergeOptions(primary.options, secondary.options);

  const childrenTargetPathsBuilder = HierarchySearchTree.createBuilder();
  primary.childrenTargetPaths?.forEach((tree) => childrenTargetPathsBuilder.accept({ tree }));
  secondary.childrenTargetPaths?.forEach((tree) => childrenTargetPathsBuilder.accept({ tree }));
  const childrenTargetPaths = childrenTargetPathsBuilder.getTree();

  return {
    ...(hasSearchTargetAncestor ? { hasSearchTargetAncestor } : undefined),
    ...(childrenTargetPaths.length ? { childrenTargetPaths } : undefined),
    ...(isSearchTarget ? { isSearchTarget } : undefined),
    ...(searchOptions ? { options: searchOptions } : undefined),
  };
}
function mergeBaseNodeAttributes(
  primary: Omit<SourceHierarchyNode, "key" | "label" | "extendedData" | "processingParams">,
  secondary: Omit<SourceHierarchyNode, "key" | "label" | "extendedData" | "processingParams">,
) {
  const search = mergeSearchAttribute(primary.search, secondary.search);
  return {
    ...(primary.autoExpand || secondary.autoExpand ? { autoExpand: true } : undefined),
    ...(primary.children && secondary.children ? { children: true } : undefined),
    ...(primary.supportsFiltering || secondary.supportsFiltering ? { supportsFiltering: true } : undefined),
    ...(search ? { search } : undefined),
  };
}
function tryMergeInstanceNodes(
  primary: SourceHierarchyNode,
  secondary: SourceHierarchyNode,
): SourceHierarchyNode | undefined {
  if (
    HierarchyNode.isInstancesNode(primary) &&
    HierarchyNode.isInstancesNode(secondary) &&
    primary.key.instanceKeys.some((lhsKey) =>
      secondary.key.instanceKeys.some((rhsKey) => InstanceKey.equals(lhsKey, rhsKey)),
    )
  ) {
    return {
      ...primary,
      key: { type: "instances", instanceKeys: primary.key.instanceKeys.concat(secondary.key.instanceKeys) },
      ...mergeBaseNodeAttributes(primary, secondary),
    };
  }
  return undefined;
}
function tryMergeGenericNodes(
  primary: SourceHierarchyNode,
  secondary: SourceHierarchyNode,
): SourceHierarchyNode | undefined {
  if (HierarchyNode.isGeneric(primary) && HierarchyNode.isGeneric(secondary) && primary.key.id === secondary.key.id) {
    return { ...primary, ...mergeBaseNodeAttributes(primary, secondary) };
  }
  return undefined;
}
function tryMergeNodes(primary: SourceHierarchyNode, secondary: SourceHierarchyNode): SourceHierarchyNode | undefined {
  return tryMergeInstanceNodes(primary, secondary) ?? tryMergeGenericNodes(primary, secondary) ?? undefined;
}
/* v8 ignore stop */

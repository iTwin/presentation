/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "../internal/DisposePolyfill.js";

import {
  BehaviorSubject,
  concatMap,
  defaultIfEmpty,
  defer,
  EMPTY,
  filter,
  finalize,
  from,
  map,
  of,
  repeat,
  take,
  takeUntil,
  tap,
  throwError,
} from "rxjs";
import { BeEvent, Guid, StopWatch } from "@itwin/core-bentley";
import { createDefaultValueFormatter } from "@itwin/presentation-shared";
import { HierarchyRequestInterruptedError, InvalidContinuationTokenError } from "../HierarchyErrors.js";
import { HierarchyNodeKey } from "../HierarchyNodeKey.js";
import { LOGGING_NAMESPACE as BASE_LOGGING_NAMESPACE, createNodeIdentifierForLogging } from "../internal/Common.js";
import { doLog } from "../internal/LoggingUtils.js";
import { getRxjsHierarchyDefinition } from "../internal/RxjsHierarchyDefinition.js";
import { SubscriptionScheduler } from "../internal/SubscriptionScheduler.js";
import {
  createGenericSourceNode,
  createIModelNodesQueryClauseFactory,
  defineHierarchyLevel,
  getOwnParentNode,
  parseSourceInstanceNode,
  preProcessSourceNode,
  toFinalNode,
} from "./HierarchyProviderUtils.js";
import { HierarchyNodesDefinition } from "./IModelHierarchyDefinition.js";
import { SearchHierarchyDefinition } from "./SearchHierarchyDefinition.js";
import { readNodeRows } from "./TreeNodesReader.js";

import type { MonoTypeOperatorFunction, Observable, Subscription } from "rxjs";
import type { GenericInstanceFilter } from "@itwin/core-common";
import type {
  ContinuableAsyncIterableIterator,
  ECSchemaProvider,
  ECSqlQueryDef,
  Event,
  EventListener,
  IInstanceLabelSelectClauseFactory,
  InstanceKey,
  IPrimitiveValueFormatter,
} from "@itwin/presentation-shared";
import type { NonGroupingHierarchyNode, ParentHierarchyNode } from "../HierarchyNode.js";
import type { GetHierarchyNodesProps, HierarchyProvider } from "../HierarchyProvider.js";
import type { HierarchySearchTree } from "../HierarchySearch.js";
import type { RxjsHierarchyDefinition } from "../internal/RxjsHierarchyDefinition.js";
import type { ProviderSourceNode } from "./HierarchyProviderUtils.js";
import type {
  GenericHierarchyNodeDefinition,
  HierarchyDefinition,
  InstanceNodesQueryDefinition,
} from "./IModelHierarchyDefinition.js";
import type { ProcessedGenericHierarchyNode, ProcessedInstanceHierarchyNode } from "./IModelHierarchyNode.js";
import type { LimitingECSqlQueryExecutor } from "./LimitingECSqlQueryExecutor.js";
import type { NodesQueryClauseFactory } from "./NodeSelectQueryFactory.js";

const LOGGING_NAMESPACE = `${BASE_LOGGING_NAMESPACE}.StreamingIModelHierarchyProvider`;
const DEFAULT_QUERY_CONCURRENCY = 10;
const DEFAULT_PAGE_SIZE = 1000;

/**
 * Props for `createStreamingIModelHierarchyProvider`.
 * @beta
 */
export interface StreamingIModelHierarchyProviderProps {
  /**
   * An object that provides access to iModel's data and metadata.
   *
   * @note The provider limits the number of rows returned by its queries on its own (see `pageSize`), so it runs
   * them with `limit: "unbounded"`.
   *
   * @see `ECSchemaProvider`
   * @see `LimitingECSqlQueryExecutor`
   */
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor & { imodelKey: string };

  /**
   * An event that is raised when iModel data, that may affect the hierarchy, changes. The created provider
   * subscribes to the event to know that it needs to reload the data, and unsubscribes on disposal.
   */
  imodelChanged?: Event<() => void>;

  /**
   * A definition that describes how to create each level of the hierarchy. Its `defineHierarchyLevel` method is called
   * as needed to get the definitions for requested parent nodes.
   *
   * The provider doesn't group, sort or merge nodes, so grouping processing params assigned to nodes are ignored. Nodes
   * are returned in the order of hierarchy level definitions and, within each instance nodes query definition, in the
   * order of query results.
   */
  hierarchyDefinition: HierarchyDefinition;

  /**
   * Maximum number of rows requested from the iModel by a single query. Results of hierarchy level definition queries
   * are loaded in pages of this size - the next page is requested only when the consumer requests a node that's not
   * in the already loaded pages.
   *
   * Must be a positive integer. Defaults to `1000`.
   */
  pageSize?: number;

  /** Maximum number of queries that the provider attempts to execute in parallel. Defaults to `10`. */
  queryConcurrency?: number;

  /**
   * A values formatter for formatting node labels. Defaults to the result of `createDefaultValueFormatter` called with
   * default parameters. May be overridden by calling `setFormatter` on the provider instance.
   */
  formatter?: IPrimitiveValueFormatter;

  /**
   * A factory for creating ECSQL select clauses for instance labels. The clause is injected into
   * hierarchy node queries to select labels for instance-based nodes.
   *
   * Defaults to the result of `createIModelInstanceLabelSelectClauseFactory` called with the provided `imodelAccess`.
   */
  instanceLabelSelectClauseFactory?: IInstanceLabelSelectClauseFactory;

  /**
   * Hierarchy search that limits the hierarchy to paths leading to the search targets. May be changed by calling
   * `setHierarchySearch` on the provider instance.
   */
  search?: {
    /** A list of search trees that define paths from root to search target nodes. */
    paths: HierarchySearchTree[];
  };
}

/**
 * Props for `StreamingIModelHierarchyProvider.getNodes` call.
 *
 * The provider loads nodes in pages and doesn't cache them, so `hierarchyLevelSizeLimit` and `ignoreCache` have no
 * effect.
 * @beta
 */
export interface GetStreamedHierarchyNodesProps extends GetHierarchyNodesProps<
  ParentHierarchyNode<NonGroupingHierarchyNode>
> {
  /**
   * A token, previously returned by `ContinuableAsyncIterableIterator.getContinuationToken` for the same iModel,
   * parent node, instance filter and hierarchy search. When specified, the provider continues streaming nodes from the
   * one that follows the node, the token belongs to.
   * Continuing from the last node in the hierarchy level returns no nodes. Tokens created before an iModel change can't
   * be used after it.
   */
  continuationToken?: string;
}

/**
 * A hierarchy provider that streams hierarchy level nodes as they're requested, loading them from the iModel in
 * pages, and allows continuing from any returned node using iterator's continuation token.
 *
 * @beta
 */
export interface StreamingIModelHierarchyProvider extends HierarchyProvider<NonGroupingHierarchyNode>, Disposable {
  /**
   * An event that provider raises due to a hierarchy change that requires a reload. In-flight `getNodes` requests fail
   * with `HierarchyRequestInterruptedError` when the event is raised. Continuation tokens of nodes returned before an
   * iModel change can't be used after it.
   */
  readonly hierarchyChanged: HierarchyProvider["hierarchyChanged"];

  /**
   * Streams child nodes of the specified parent node, in the order of hierarchy level definitions and, within each
   * instance nodes query definition, in the order of query results.
   *
   * Nodes are loaded on demand - the provider doesn't run queries until a node that needs them is requested, and
   * stopping the iteration stops loading. Query results are loaded in pages of `StreamingIModelHierarchyProviderProps.pageSize`
   * rows.
   *
   * Nodes with `hideInHierarchy` processing param are replaced by their children in place. Nodes with `hideIfNoChildren`
   * processing param are omitted if they have no children.
   *
   * @throws `InvalidContinuationTokenError` if the given `continuationToken` can't be used: it's malformed, was created
   * for a different iModel, parent node, instance filter or hierarchy search, or was created before an iModel change
   * or it points to a hierarchy level definition that doesn't exist.
   * @throws `HierarchyRequestInterruptedError` from the iterator, if the hierarchy changes or the provider is disposed
   * after `getNodes` is called and before all nodes are streamed, or if the provider was already disposed when
   * `getNodes` was called. The iterator only finishes without an error after the last node of the hierarchy level.
   */
  getNodes(props: GetStreamedHierarchyNodesProps): ContinuableAsyncIterableIterator<NonGroupingHierarchyNode>;

  /**
   * Overrides the property value formatter used to format node labels. Setting to `undefined` resets the formatter
   * to the result of `createDefaultValueFormatter` called with default parameters.
   *
   * @note Changing formatter fails in-flight `getNodes` requests with `HierarchyRequestInterruptedError` and triggers
   * the `hierarchyChanged` event with `formatterChange` arg.
   */
  setFormatter(formatter: IPrimitiveValueFormatter | undefined): void;

  /**
   * Streams instance keys of nodes in the specified parent node's child hierarchy level, replacing hidden nodes with
   * instance keys of their children. Nodes with `hideIfNoChildren` processing param are included without checking
   * whether they have children.
   *
   * @throws `InvalidContinuationTokenError` and `HierarchyRequestInterruptedError` under the same conditions as
   * `getNodes`.
   */
  getNodeInstanceKeys(
    props: Omit<GetStreamedHierarchyNodesProps, "ignoreCache">,
  ): ContinuableAsyncIterableIterator<InstanceKey>;

  /**
   * Sets the hierarchy search, which limits the hierarchy to paths leading to the search targets. Setting to
   * `undefined` removes the search.
   *
   * @note Changing the search fails in-flight requests with `HierarchyRequestInterruptedError` and triggers the
   * `hierarchyChanged` event with `searchChange` arg. Continuation tokens are only accepted with the search they were
   * created with.
   */
  setHierarchySearch(props: StreamingIModelHierarchyProviderProps["search"]): void;
}

/**
 * Creates a `StreamingIModelHierarchyProvider` that creates a hierarchy based on the given iModel and a hierarchy definition,
 * which defines each hierarchy level through ECSQL queries.
 *
 * Unlike the provider created by `createIModelHierarchyProvider`, this one doesn't group, sort or merge nodes. Instead,
 * it streams nodes in hierarchy definition order, loading them in pages as they're requested, and assigns each node
 * a continuation token that allows continuing the stream from that node.
 *
 * @throws `Error` if `pageSize` is not a positive integer.
 * @beta
 */
export function createStreamingIModelHierarchyProvider(
  props: StreamingIModelHierarchyProviderProps,
): StreamingIModelHierarchyProvider {
  return new StreamingIModelHierarchyProviderImpl(props);
}

type StreamingParentNode = ParentHierarchyNode<NonGroupingHierarchyNode>;
type StreamingProcessedNode = ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode;

interface ResumeProps {
  offset: number;
  /** Set when resuming inside the hidden node at `offset`; otherwise that node is skipped. */
  nestedContinuationToken?: ContinuationToken;
}

interface LevelNode {
  node: StreamingProcessedNode;
  position: LevelPosition;
  /** Set if reading should resume inside this (hidden) node's child hierarchy level. */
  nestedContinuationToken?: ContinuationToken;
}

interface ReadLevelProps<TResult> {
  parentNode: StreamingParentNode | undefined;
  instanceFilter?: GenericInstanceFilter;
  /** Relative to this hierarchy level. */
  continuationToken?: ContinuationToken;
  /** Awaited before requesting each query page and processing each node. */
  demand: Observable<unknown>;
  processNode: (node: LevelNode) => Observable<TResult>;
}

interface StreamLevelProps extends Omit<ReadLevelProps<never>, "processNode"> {
  /** Differs from `parentNode` when that one is hidden. */
  requestedParentNode: StreamingParentNode | undefined;
  /** Token of the hidden parent node - prefix for tokens of this level's nodes. */
  parentContinuationToken: ContinuationToken;
  tokenContext: ContinuationTokenContext;
}

interface ReadSourceNode {
  sourceNode: ProviderSourceNode;
  offset: number;
  nestedContinuationToken?: ContinuationToken;
}

class StreamingIModelHierarchyProviderImpl implements StreamingIModelHierarchyProvider {
  readonly #imodelAccess: StreamingIModelHierarchyProviderProps["imodelAccess"];
  readonly #sourceHierarchyDefinition: RxjsHierarchyDefinition;
  // wrapped with search, if one is set
  #hierarchyDefinition: RxjsHierarchyDefinition;
  #searchFingerprint = "";
  readonly #hierarchyChanged = new BeEvent<EventListener<HierarchyProvider["hierarchyChanged"]>>();
  readonly #createNodesQueryClauseFactory: () => NodesQueryClauseFactory;
  readonly #componentId = Guid.createValue();
  readonly #sourceName: string;
  readonly #pageSize: number;
  readonly #queryScheduler: SubscriptionScheduler;
  // incremented on any hierarchy change or disposal - requests started before that fail
  readonly #interruptGeneration = new BehaviorSubject(0);
  // incremented on iModel change - older continuation tokens become invalid
  #hierarchyGeneration = 0;
  #disposed = false;
  #nodesQueryClauseFactory: NodesQueryClauseFactory;
  #valuesFormatter: IPrimitiveValueFormatter;
  #unsubscribe?: () => void;

  public constructor(props: StreamingIModelHierarchyProviderProps & { sourceName?: string }) {
    this.#pageSize = props.pageSize ?? DEFAULT_PAGE_SIZE;
    this.#queryScheduler = new SubscriptionScheduler(props.queryConcurrency ?? DEFAULT_QUERY_CONCURRENCY);
    if (!Number.isSafeInteger(this.#pageSize) || this.#pageSize < 1) {
      throw new Error(`Invalid page size: ${this.#pageSize}. Expected a positive integer.`);
    }
    this.#imodelAccess = props.imodelAccess;
    this.#sourceName = props.sourceName ?? `StreamingIModelHierarchyProvider:${this.#componentId}`;
    this.#sourceHierarchyDefinition = getRxjsHierarchyDefinition(props.hierarchyDefinition);
    this.#hierarchyDefinition = this.#sourceHierarchyDefinition;
    this.#applySearch(props.search);
    this.#valuesFormatter = props.formatter ?? createDefaultValueFormatter();
    this.#createNodesQueryClauseFactory = () =>
      createIModelNodesQueryClauseFactory({
        imodelAccess: props.imodelAccess,
        instanceLabelSelectClauseFactory: props.instanceLabelSelectClauseFactory,
      });
    this.#nodesQueryClauseFactory = this.#createNodesQueryClauseFactory();

    if (props.imodelChanged) {
      const imodelChanged = props.imodelChanged;
      const onIModelChanged = () => {
        /* v8 ignore next -- @preserve */
        doLog({
          category: `${LOGGING_NAMESPACE}.Events`,
          message: () => `Data source changed: "${this.#imodelAccess.imodelKey}"`,
        });
        this.#interrupt();
        ++this.#hierarchyGeneration;
        // the iModel's schemas may have changed, so re-create the query factory to drop its schema-derived caches
        this.#nodesQueryClauseFactory = this.#createNodesQueryClauseFactory();
        this.#hierarchyChanged.raiseEvent({});
      };
      imodelChanged.addListener(onIModelChanged);
      this.#unsubscribe = () => imodelChanged.removeListener(onIModelChanged);
    }
  }

  #interrupt() {
    this.#interruptGeneration.next(this.#interruptGeneration.value + 1);
  }

  public [Symbol.dispose]() {
    this.#disposed = true;
    this.#interrupt();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  public get hierarchyChanged() {
    return this.#hierarchyChanged;
  }

  public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
    this.#interrupt();
    this.#valuesFormatter = formatter ?? createDefaultValueFormatter();
    this.#hierarchyChanged.raiseEvent({ formatterChange: { newFormatter: this.#valuesFormatter } });
  }

  public setHierarchySearch(props: StreamingIModelHierarchyProviderProps["search"]) {
    this.#interrupt();
    this.#applySearch(props);
    this.#hierarchyChanged.raiseEvent({ searchChange: { newSearch: props } });
  }

  #applySearch(search: StreamingIModelHierarchyProviderProps["search"]) {
    this.#hierarchyDefinition = search
      ? new SearchHierarchyDefinition({
          imodelAccess: this.#imodelAccess,
          source: this.#sourceHierarchyDefinition,
          sourceName: this.#sourceName,
          targetPaths: search.paths,
        })
      : this.#sourceHierarchyDefinition;
    this.#searchFingerprint = ContinuationTokenContext.createSearchFingerprint(search);
  }

  /** Emits on any hierarchy change after this call or if the provider is disposed. */
  #createInterrupt(): Observable<unknown> {
    const generation = this.#interruptGeneration.value;
    return this.#interruptGeneration.pipe(filter((value) => this.#disposed || value !== generation));
  }

  #createContinuationTokenContext(props: Omit<GetStreamedHierarchyNodesProps, "ignoreCache">) {
    return new ContinuationTokenContext({
      continuationToken: props.continuationToken,
      generation: this.#hierarchyGeneration,
      imodelKey: this.#imodelAccess.imodelKey,
      parentNode: props.parentNode,
      instanceFilter: props.instanceFilter,
      searchFingerprint: this.#searchFingerprint,
    });
  }

  public getNodes(props: GetStreamedHierarchyNodesProps): ContinuableAsyncIterableIterator<NonGroupingHierarchyNode> {
    const tokenContext = this.#createContinuationTokenContext(props);
    return this.#createIterator({
      tokenContext,
      createSource: (demand) => this.#getNodesObservable({ ...props, tokenContext, demand }),
    });
  }

  public getNodeInstanceKeys(
    props: Omit<GetStreamedHierarchyNodesProps, "ignoreCache">,
  ): ContinuableAsyncIterableIterator<InstanceKey> {
    const tokenContext = this.#createContinuationTokenContext(props);
    return this.#createIterator({
      tokenContext,
      createSource: (demand) =>
        this.#readInstanceKeys({
          parentNode: props.parentNode,
          instanceFilter: props.instanceFilter,
          continuationToken: tokenContext.resumeFrom,
          parentContinuationToken: [],
          tokenContext,
          demand,
        }),
    });
  }

  /**
   * The source must emit only when `demand` emits, so that each value is returned to the consumer right away and the
   * continuation token, advanced by the source, matches the last returned value.
   */
  #createIterator<T>({
    tokenContext,
    createSource,
  }: {
    tokenContext: ContinuationTokenContext;
    createSource: (demand: Observable<unknown>) => Observable<T>;
  }): ContinuableAsyncIterableIterator<T> {
    // values requested by the consumer, but not yet received
    const pendingRequestsCount = new BehaviorSubject(0);
    // created here, so that changes before iteration starts interrupt the request too
    const interrupt = this.#createInterrupt();
    return createContinuableAsyncIterableIterator({
      iterator: requestOnDemand({
        source: createSource(pendingRequestsCount.pipe(filter((count) => count > 0))).pipe(
          tap(() => pendingRequestsCount.next(pendingRequestsCount.value - 1)),
          throwOnInterrupt(interrupt),
        ),
        onRequest: () => pendingRequestsCount.next(pendingRequestsCount.value + 1),
      }),
      getContinuationToken: () => tokenContext.getCurrentToken(),
    });
  }

  /** Reads instance keys of the hierarchy level, replacing hidden nodes with their children's keys. */
  #readInstanceKeys({
    parentNode,
    instanceFilter,
    continuationToken,
    parentContinuationToken,
    tokenContext,
    demand,
  }: Pick<
    StreamLevelProps,
    "parentNode" | "instanceFilter" | "continuationToken" | "parentContinuationToken" | "tokenContext" | "demand"
  >): Observable<InstanceKey> {
    return this.#readLevel({
      parentNode,
      instanceFilter,
      continuationToken,
      demand,
      processNode: ({ node, position, nestedContinuationToken }) => {
        if (node.processingParams?.hideInHierarchy) {
          return node.children === false
            ? EMPTY
            : this.#readInstanceKeys({
                parentNode: node,
                instanceFilter,
                continuationToken: nestedContinuationToken,
                parentContinuationToken: [...parentContinuationToken, position],
                tokenContext,
                demand,
              });
        }
        if (!HierarchyNodeKey.isInstances(node.key)) {
          return EMPTY;
        }
        const { instanceKeys } = node.key;
        return from(instanceKeys).pipe(
          concatMap((key, index) =>
            onDemand(demand, () => {
              // advance only on the last key, so that resuming doesn't skip the node's remaining keys
              if (index === instanceKeys.length - 1) {
                tokenContext.advance(parentContinuationToken, position);
              }
              return of(key);
            }),
          ),
        );
      },
    });
  }

  #getNodesObservable({
    parentNode,
    instanceFilter,
    tokenContext,
    demand,
  }: Omit<GetStreamedHierarchyNodesProps, "continuationToken"> & {
    tokenContext: ContinuationTokenContext;
    demand: Observable<unknown>;
  }): Observable<NonGroupingHierarchyNode> {
    return defer(() => {
      const timer = new StopWatch(undefined, true);
      let nodesCount = 0;
      return this.#streamLevel({
        parentNode,
        requestedParentNode: parentNode,
        instanceFilter,
        continuationToken: tokenContext.resumeFrom,
        parentContinuationToken: [],
        tokenContext,
        demand,
      }).pipe(
        tap(() => ++nodesCount),
        finalize(() => {
          /* v8 ignore next -- @preserve */
          doLog({
            category: `${LOGGING_NAMESPACE}.GetNodes`,
            message: () =>
              `Returned ${nodesCount} child nodes for ${createNodeIdentifierForLogging(parentNode)} in ${timer.currentSeconds.toFixed(2)} s.`,
          });
        }),
      );
    });
  }

  /** Streams final nodes of the hierarchy level, replacing hidden nodes with their children. */
  #streamLevel(props: StreamLevelProps): Observable<NonGroupingHierarchyNode> {
    const { parentNode, requestedParentNode, instanceFilter, parentContinuationToken, tokenContext, demand } = props;
    return this.#readLevel({
      parentNode,
      instanceFilter,
      continuationToken: props.continuationToken,
      demand,
      processNode: ({ node, position, nestedContinuationToken }) => {
        if (!node.processingParams?.hideInHierarchy) {
          return this.#finalizeNode({ node, parentNode: requestedParentNode }).pipe(
            tap(() => tokenContext.advance(parentContinuationToken, position)),
          );
        }
        if (node.children === false) {
          return EMPTY;
        }
        return this.#streamLevel({
          parentNode: node,
          requestedParentNode,
          instanceFilter,
          continuationToken: nestedContinuationToken,
          parentContinuationToken: [...parentContinuationToken, position],
          tokenContext,
          demand,
        });
      },
    });
  }

  /** Reads pre-processed nodes of the hierarchy level and processes them one by one, each after `demand` emits. */
  #readLevel<TResult>(props: ReadLevelProps<TResult>): Observable<TResult> {
    const { parentNode, instanceFilter, demand, processNode } = props;
    const ownParentNode = parentNode
      ? getOwnParentNode(parentNode, { sourceName: this.#sourceName, imodelKey: this.#imodelAccess.imodelKey })
      : undefined;
    const isParentNodeFromOtherSource = !!parentNode && !ownParentNode;
    if (isParentNodeFromOtherSource) {
      return EMPTY;
    }
    const resumePosition: LevelPosition | undefined = props.continuationToken?.[0];
    const resumeNestedContinuationToken = props.continuationToken?.slice(1) ?? [];
    const startDefinitionIndex = resumePosition?.definitionIndex ?? 0;
    return defineHierarchyLevel({
      hierarchyDefinition: this.#hierarchyDefinition,
      nodesQueryClauseFactory: this.#nodesQueryClauseFactory,
      parentNode: ownParentNode,
      ...(instanceFilter ? { instanceFilter } : undefined),
    }).pipe(
      concatMap((definitions) => {
        if (startDefinitionIndex >= definitions.length && resumePosition) {
          return throwError(
            () =>
              new InvalidContinuationTokenError(
                "Continuation token points to a hierarchy level definition that doesn't exist.",
              ),
          );
        }
        return from(definitions.slice(startDefinitionIndex)).pipe(
          concatMap((definition, index) => {
            const definitionIndex = startDefinitionIndex + index;
            const resume: ResumeProps | undefined =
              resumePosition?.definitionIndex === definitionIndex
                ? {
                    offset: resumePosition.offset,
                    ...(resumeNestedContinuationToken.length
                      ? { nestedContinuationToken: resumeNestedContinuationToken }
                      : undefined),
                  }
                : undefined;
            const processSourceNode = ({ sourceNode, offset, nestedContinuationToken }: ReadSourceNode) =>
              this.#preProcessNode({ sourceNode, parentNode }).pipe(
                concatMap((node) =>
                  processNode({
                    node,
                    position: { definitionIndex, offset },
                    ...(nestedContinuationToken ? { nestedContinuationToken } : undefined),
                  }),
                ),
              );
            return HierarchyNodesDefinition.isGenericNode(definition)
              ? from(this.#readGenericNode({ definition, resume })).pipe(
                  concatMap((sourceNode) => onDemand(demand, () => processSourceNode(sourceNode))),
                )
              : this.#readInstanceNodes({ definition, parentNode, resume, demand, processSourceNode });
          }),
        );
      }),
    );
  }

  #readGenericNode({
    definition,
    resume,
  }: {
    definition: GenericHierarchyNodeDefinition;
    resume: ResumeProps | undefined;
  }): ReadSourceNode[] {
    if (resume && !resume.nestedContinuationToken) {
      return [];
    }
    return [
      {
        sourceNode: createGenericSourceNode(definition, this.#sourceName),
        offset: 0,
        ...(resume ? { nestedContinuationToken: resume.nestedContinuationToken } : undefined),
      },
    ];
  }

  /** Reads query results in pages. Each page and each row is processed only after `demand` emits. */
  #readInstanceNodes<TResult>({
    definition,
    parentNode,
    resume,
    demand,
    processSourceNode,
  }: {
    definition: InstanceNodesQueryDefinition;
    parentNode: StreamingParentNode | undefined;
    resume: ResumeProps | undefined;
    demand: Observable<unknown>;
    processSourceNode: (sourceNode: ReadSourceNode) => Observable<TResult>;
  }): Observable<TResult> {
    // when resuming after a visible node, start at the row that follows it; when resuming inside a hidden
    // node's children, start at the hidden node's row to re-create it
    const startOffset = resume ? (resume.nestedContinuationToken ? resume.offset : resume.offset + 1) : 0;
    return defer(() => {
      let pagesCount = 0;
      let pageRowsCount = 0;
      const readNextPage = defer(() => {
        const pageOffset = startOffset + pagesCount++ * this.#pageSize;
        pageRowsCount = 0;
        // only reading the page is scheduled - processing its rows may run other queries, which would otherwise
        // wait for a slot taken by this one
        return this.#queryScheduler
          .scheduleSubscription(
            readNodeRows({
              queryExecutor: this.#imodelAccess,
              query: createPageQuery({ query: definition.query, offset: pageOffset, limit: this.#pageSize }),
              // the query has its own limit - reaching it means there's another page rather than a failure
              limit: "unbounded",
            }),
          )
          .pipe(
            tap(() => ++pageRowsCount),
            concatMap((row, index) =>
              onDemand(demand, () => {
                const offset = pageOffset + index;
                return parseSourceInstanceNode({
                  row,
                  parentNode,
                  imodelKey: this.#imodelAccess.imodelKey,
                  parseNode: this.#hierarchyDefinition.parseNode,
                }).pipe(
                  concatMap((sourceNode) =>
                    processSourceNode({
                      sourceNode,
                      offset,
                      ...(resume?.nestedContinuationToken && offset === resume.offset
                        ? { nestedContinuationToken: resume.nestedContinuationToken }
                        : undefined),
                    }),
                  ),
                );
              }),
            ),
          );
      });
      return onDemand(demand, () =>
        readNextPage.pipe(
          // a page that has less rows than requested is the last one
          repeat({ delay: () => (pageRowsCount < this.#pageSize ? EMPTY : demand.pipe(take(1))) }),
        ),
      );
    });
  }

  /** Completes without a value if the node should be omitted. */
  #finalizeNode({
    node,
    parentNode,
  }: {
    node: StreamingProcessedNode;
    parentNode: StreamingParentNode | undefined;
  }): Observable<NonGroupingHierarchyNode> {
    const { postProcessNode } = this.#hierarchyDefinition;
    return this.#determineChildren(node).pipe(
      filter((children) => children || !node.processingParams?.hideIfNoChildren),
      concatMap((children) =>
        postProcessNode ? postProcessNode({ node: { ...node, children }, parentNode }) : of({ ...node, children }),
      ),
      map((postProcessed) => toFinalNode(postProcessed as StreamingProcessedNode)),
    );
  }

  /** Completes without a value if the node is omitted. */
  #preProcessNode({
    sourceNode,
    parentNode,
  }: {
    sourceNode: ProviderSourceNode;
    parentNode: StreamingParentNode | undefined;
  }): Observable<StreamingProcessedNode> {
    return preProcessSourceNode({
      node: sourceNode,
      parentNode,
      valueFormatter: this.#valuesFormatter,
      preProcessNode: this.#hierarchyDefinition.preProcessNode,
    }).pipe(map((node) => omitGroupingParams(node)));
  }

  #determineChildren(node: StreamingProcessedNode): Observable<boolean> {
    return node.children !== undefined ? of(node.children) : this.#hasChildren(node);
  }

  #hasChildren(node: StreamingProcessedNode): Observable<boolean> {
    return this.#readLevel({
      parentNode: node,
      // determining children isn't limited by what the consumer has requested - it stops at the first child instead
      demand: of(undefined),
      // hidden and `hideIfNoChildren` children only count if they have children themselves
      processNode: ({ node: child }) =>
        child.processingParams?.hideInHierarchy || child.processingParams?.hideIfNoChildren
          ? this.#determineChildren(child)
          : of(true),
    }).pipe(
      filter((childHasChildren) => childHasChildren),
      take(1),
      defaultIfEmpty(false),
    );
  }
}

/** Fails the stream with `HierarchyRequestInterruptedError` when `interrupt` emits. */
function throwOnInterrupt<T>(interrupt: Observable<unknown>): MonoTypeOperatorFunction<T> {
  return takeUntil(
    interrupt.pipe(
      map(() => {
        throw new HierarchyRequestInterruptedError();
      }),
    ),
  );
}

function onDemand<T>(demand: Observable<unknown>, work: () => Observable<T>): Observable<T> {
  return demand.pipe(take(1), concatMap(work));
}

/**
 * Subscribes to `source` on the first `next()` call and calls `onRequest` whenever more values are needed. Unlike
 * async generators, `return()` takes effect immediately, even while a `next()` call is pending.
 */
function requestOnDemand<T>({ source, onRequest }: { source: Observable<T>; onRequest: () => void }): AsyncIterator<T> {
  const values: T[] = [];
  const pending: Array<{ resolve: (result: IteratorResult<T>) => void; reject: (reason: unknown) => void }> = [];
  let subscription: Subscription | undefined;
  let finished = false;
  // wrapped to tell apart "no error" from an error with `undefined` reason
  let error: { reason: unknown } | undefined;
  const done = (): IteratorResult<T> => ({ done: true, value: undefined });
  const settle = () => {
    while (pending.length && values.length) {
      pending.shift()!.resolve({ done: false, value: values.shift()! });
    }
    if (pending.length && error) {
      // the error is reported once - subsequent `next()` calls report the iterator as done
      const { reason } = error;
      error = undefined;
      pending.shift()!.reject(reason);
    }
    if (finished) {
      pending.splice(0).forEach(({ resolve }) => resolve(done()));
    }
  };
  return {
    async next() {
      // register the request before subscribing, because `source` may emit synchronously
      const result = new Promise<IteratorResult<T>>((resolve, reject) => pending.push({ resolve, reject }));
      // a buffered value already satisfies the request, so only ask `source` for more when there's none
      if (!finished && !values.length) {
        onRequest();
        subscription ??= source.subscribe({
          next: (value) => {
            values.push(value);
            settle();
          },
          error: (reason: unknown) => {
            error = { reason };
            finished = true;
            settle();
          },
          complete: () => {
            finished = true;
            settle();
          },
        });
      }
      settle();
      return result;
    },
    async return() {
      // unsubscribing cancels any in-flight work, e.g. a query that's waiting for a page
      subscription?.unsubscribe();
      values.length = 0;
      error = undefined;
      finished = true;
      settle();
      return done();
    },
  };
}

function createContinuableAsyncIterableIterator<T>({
  iterator,
  getContinuationToken,
}: {
  iterator: AsyncIterator<T>;
  getContinuationToken: () => string | undefined;
}): ContinuableAsyncIterableIterator<T> {
  return {
    getContinuationToken,
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      return iterator.next();
    },
    async return() {
      return iterator.return!();
    },
  };
}

function omitGroupingParams<TNode extends StreamingProcessedNode>(node: TNode): TNode {
  if (!node.processingParams || !("grouping" in node.processingParams)) {
    return node;
  }
  const { grouping: _, ...processingParams } = node.processingParams;
  return { ...node, processingParams };
}

function createPageQuery({
  query,
  offset,
  limit,
}: {
  query: ECSqlQueryDef;
  offset: number;
  limit: number;
}): ECSqlQueryDef {
  return { ...query, ecsql: `SELECT * FROM (${query.ecsql}) LIMIT ${limit} OFFSET ${offset}` };
}

/** Index of the hierarchy level definition and query row (`0` for generic nodes) a node was created from. */
interface LevelPosition {
  definitionIndex: number;
  offset: number;
}

/**
 * Path to a node in a hierarchy level: each position, except the last one, points to a hidden node, and the next one -
 * to a node in its child hierarchy level.
 */
type ContinuationToken = LevelPosition[];

/**
 * Continuation tokens of a single request: validates the token the request was made with, and tracks the last node,
 * whose values were all returned. Tokens can only be used with the same request and hierarchy generation.
 */
class ContinuationTokenContext {
  static readonly #VERSION = 1;

  readonly #generation: number;
  readonly #fingerprint: string;
  readonly #initialToken: string | undefined;
  // combined into a token only when it's requested
  #currentParentToken: ContinuationToken = [];
  #currentPosition: LevelPosition | undefined;

  public readonly resumeFrom: ContinuationToken | undefined;

  /** @throws `InvalidContinuationTokenError` */
  public constructor(props: {
    continuationToken: string | undefined;
    generation: number;
    imodelKey: string;
    parentNode: ParentHierarchyNode | undefined;
    instanceFilter: GenericInstanceFilter | undefined;
    searchFingerprint: string;
  }) {
    this.#generation = props.generation;
    this.#fingerprint = ContinuationTokenContext.#hash([
      props.imodelKey,
      props.parentNode?.key,
      props.parentNode?.parentKeys,
      props.instanceFilter,
      props.searchFingerprint,
    ]);
    this.#initialToken = props.continuationToken;
    this.resumeFrom = props.continuationToken !== undefined ? this.#decode(props.continuationToken) : undefined;
  }

  /** Called when the node's last value is returned to the consumer. */
  public advance(parentToken: ContinuationToken, position: LevelPosition) {
    this.#currentParentToken = parentToken;
    this.#currentPosition = position;
  }

  public getCurrentToken(): string | undefined {
    return this.#currentPosition
      ? this.#encode([...this.#currentParentToken, this.#currentPosition])
      : this.#initialToken;
  }

  /** Expensive for large searches, so expected to be calculated once per search change. */
  public static createSearchFingerprint(search: { paths: HierarchySearchTree[] } | undefined): string {
    return search ? ContinuationTokenContext.#hash(search.paths) : "";
  }

  #encode(token: ContinuationToken): string {
    const payload: ContinuationTokenPayload = {
      v: ContinuationTokenContext.#VERSION,
      g: this.#generation,
      f: this.#fingerprint,
      p: token.map(({ definitionIndex, offset }) => [definitionIndex, offset]),
    };
    // URL-safe base64 without padding
    return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  #decode(token: string): ContinuationToken {
    let payload: unknown;
    try {
      payload = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      payload = undefined;
    }
    if (!ContinuationTokenContext.#isPayload(payload)) {
      throw new InvalidContinuationTokenError(`Invalid continuation token: "${token}".`);
    }
    if (payload.g !== this.#generation) {
      throw new InvalidContinuationTokenError(
        `Continuation token "${token}" was created before a hierarchy change and can't be used anymore.`,
      );
    }
    if (payload.f !== this.#fingerprint) {
      throw new InvalidContinuationTokenError(
        `Continuation token "${token}" was created for a different iModel, parent node, instance filter or hierarchy search.`,
      );
    }
    return payload.p.map(([definitionIndex, offset]) => ({ definitionIndex, offset }));
  }

  static #isPayload(value: unknown): value is ContinuationTokenPayload {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const { v, g, f, p } = value as {
      [key in keyof ContinuationTokenPayload]?: unknown;
    };
    return (
      v === ContinuationTokenContext.#VERSION &&
      Number.isSafeInteger(g) &&
      typeof f === "string" &&
      Array.isArray(p) &&
      p.length > 0 &&
      p.every(
        (position) =>
          Array.isArray(position) &&
          position.length === 2 &&
          position.every((item) => Number.isSafeInteger(item) && item >= 0),
      )
    );
  }

  /** 32-bit FNV-1a hash of the value's JSON with sorted object keys. */
  static #hash(value: unknown): string {
    const serialized = JSON.stringify(value, (_, item: unknown) =>
      typeof item === "object" && item !== null && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([lhs], [rhs]) => (lhs < rhs ? -1 : 1)))
        : item,
    );
    let hash = 0x811c9dc5;
    for (let i = 0; i < serialized.length; ++i) {
      hash ^= serialized.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }
}

interface ContinuationTokenPayload {
  /** Version */
  v: number;
  /** Hierarchy generation */
  g: number;
  /** Request fingerprint */
  f: string;
  /** `[definitionIndex, offset]` path */
  p: Array<[number, number]>;
}

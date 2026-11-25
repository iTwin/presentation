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
  Observable,
  of,
  repeat,
  take,
  tap,
  throwError,
} from "rxjs";
import { BeEvent, Guid, StopWatch } from "@itwin/core-bentley";
import { createDefaultValueFormatter } from "@itwin/presentation-shared";
import { HierarchyRequestInterruptedError, InvalidContinuationTokenError } from "../HierarchyErrors.js";
import { HierarchyNode } from "../HierarchyNode.js";
import { HierarchyNodeKey } from "../HierarchyNodeKey.js";
import { LOGGING_NAMESPACE as BASE_LOGGING_NAMESPACE, createNodeIdentifierForLogging } from "../internal/Common.js";
import { doLog } from "../internal/LoggingUtils.js";
import { getRxjsHierarchyDefinition } from "../internal/RxjsHierarchyDefinition.js";
import {
  createGenericSourceNode,
  createIModelNodesQueryClauseFactory,
  defineHierarchyLevel,
  getOwnParentNode,
  parseSourceNode,
  preProcessSourceNode,
  toFinalNode,
} from "./HierarchyProviderUtils.js";
import { HierarchyNodesDefinition } from "./IModelHierarchyDefinition.js";
import { SearchHierarchyDefinition } from "./SearchHierarchyDefinition.js";
import { readNodeRows } from "./TreeNodesReader.js";

import type { MonoTypeOperatorFunction, Subscription } from "rxjs";
import type { GenericInstanceFilter } from "@itwin/core-common";
import type {
  ECSchemaProvider,
  ECSqlQueryDef,
  ECSqlQueryRow,
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
  HierarchyLevelDefinition,
  InstanceNodesQueryDefinition,
} from "./IModelHierarchyDefinition.js";
import type { ProcessedGenericHierarchyNode, ProcessedInstanceHierarchyNode } from "./IModelHierarchyNode.js";
import type { LimitingECSqlQueryExecutor } from "./LimitingECSqlQueryExecutor.js";
import type { NodesQueryClauseFactory } from "./NodeSelectQueryFactory.js";

const LOGGING_NAMESPACE = `${BASE_LOGGING_NAMESPACE}.StreamingIModelHierarchyProvider`;
const DEFAULT_PAGE_SIZE = 10_000;

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
   * order of query results. Paging and continuation tokens rely on a query returning rows in the same order every time
   * it's run. Without an `ORDER BY` clause, that holds as long as the query, its bindings and the iModel stay the same,
   * but the order may change after an SQLite upgrade or a query planner statistics update. Use `ORDER BY` if
   * continuation tokens need to stay valid across such changes, e.g. when they're persisted.
   */
  hierarchyDefinition: HierarchyDefinition;

  /**
   * Maximum number of rows requested from the iModel by a single query. Results of hierarchy level definition queries
   * are loaded in pages of this size - the next page is requested only when the consumer requests a node that's not
   * in the already loaded pages.
   *
   * Must be a positive integer. Defaults to `10 000`.
   */
  pageSize?: number;

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
 * effect. Grouping parent nodes have no children, because the provider doesn't create grouping nodes.
 * @beta
 */
export interface GetStreamedHierarchyNodesProps extends GetHierarchyNodesProps {
  /**
   * A token, previously returned by `HierarchyNodesIterator.getContinuationToken` for the same parent node, instance
   * filter and hierarchy search. When specified, the provider continues streaming nodes from the one that follows the
   * node, the token belongs to.
   * Continuing from the last node in the hierarchy level returns no nodes. Tokens created before an iModel change can't
   * be used after it.
   */
  continuationToken?: string;
}

/**
 * An iterator of hierarchy nodes returned by `StreamingIModelHierarchyProvider.getNodes`, which tracks its position in
 * the hierarchy level.
 * @beta
 */
export interface HierarchyNodesIterator extends AsyncIterableIterator<NonGroupingHierarchyNode> {
  /**
   * Returns an opaque token that identifies position of the last node returned by `next()`. Pass it to
   * `StreamingIModelHierarchyProvider.getNodes` to continue streaming nodes from the one that follows that node.
   *
   * Before the first node is returned, returns `GetStreamedHierarchyNodesProps.continuationToken` the iterator was
   * requested with, which is `undefined` when streaming from the start of the hierarchy level.
   */
  getContinuationToken(): string | undefined;
}

/**
 * A hierarchy provider that streams hierarchy level nodes as they're requested, loading them from the iModel in
 * pages, and allows continuing from any returned node using iterator's continuation token.
 *
 * @beta
 */
export interface StreamingIModelHierarchyProvider extends HierarchyProvider, Disposable {
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
   * @throws `InvalidContinuationTokenError` if the given `continuationToken` is malformed, was created for a different
   * parent node, instance filter or hierarchy search, or was created before an iModel change.
   * @throws `InvalidContinuationTokenError` from the iterator, if the given `continuationToken` points to a hierarchy
   * level definition that doesn't exist.
   * @throws `HierarchyRequestInterruptedError` from the iterator, if the hierarchy changes or the provider is disposed
   * after `getNodes` is called and before all nodes are streamed, or if the provider was already disposed when
   * `getNodes` was called. The iterator only finishes without an error after the last node of the hierarchy level.
   */
  getNodes(props: GetStreamedHierarchyNodesProps): HierarchyNodesIterator;

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
   * @throws `HierarchyRequestInterruptedError` from the iterator, under the same conditions as `getNodes`.
   */
  getNodeInstanceKeys(props: Omit<GetHierarchyNodesProps, "ignoreCache">): AsyncIterableIterator<InstanceKey>;

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
/** A node streamed by `getNodes`, together with its continuation token. */
interface StreamedNode {
  node: NonGroupingHierarchyNode;
  continuationToken: string;
}
type StreamingProcessedNode = ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode;

/**
 * Identifies a node in a hierarchy level: `definitionIndex` is the index of hierarchy level definition the node was
 * created from and `offset` is the index of query row the node was created from (always `0` for generic nodes).
 */
interface LevelPosition {
  definitionIndex: number;
  offset: number;
}

/**
 * Identifies position of a node in a hierarchy level. Consists of a list of `LevelPosition`s, where each position,
 * except the last one, points to a hidden node (one with `hideInHierarchy` processing param), and each subsequent
 * position points to a node in that hidden node's child hierarchy level.
 *
 * Exposed to consumers as an opaque `string` through `HierarchyNodesIterator.getContinuationToken` and
 * `GetStreamedHierarchyNodesProps.continuationToken` - see `encodeContinuationToken` and `decodeContinuationToken`.
 *
 * Example: root hierarchy level is defined by a single query that returns `[a, b, hidden, d, e]`. The `hidden` node's
 * child hierarchy level is defined by a single query that returns `[c1, c2, cHidden, c4]`, and `cHidden` node's children
 * query returns `[c3_1, c3_2]`. The provider streams `[a, b, c1, c2, c3_1, c3_2, c4, d, e]` with these token paths
 * (as `definitionIndex:offset`):
 * - `d`: `[0:3]` - row `3` of definition `0`,
 * - `c1`: `[0:2, 0:0]` - row `0` of definition `0` under the hidden node at row `2` of definition `0`,
 * - `c3_1`: `[0:2, 0:2, 0:0]` - row `0` under `cHidden` (row `2`), which is under `hidden` (row `2`).
 */
type ContinuationToken = LevelPosition[];

interface ResumeProps {
  /** Offset of the row, at which to resume. */
  offset: number;
  /**
   * Continuation token in child hierarchy level of the (hidden) node at `offset`. If not set, the node at `offset` has
   * already been returned and should be skipped.
   */
  nestedContinuationToken?: ContinuationToken;
}

interface LevelNode {
  node: StreamingProcessedNode;
  /** Position of the node in its hierarchy level. */
  position: LevelPosition;
  /** Set if the node is hidden and reading should resume inside its child hierarchy level. */
  nestedContinuationToken?: ContinuationToken;
}

interface ReadLevelProps<TResult> {
  parentNode: StreamingParentNode | undefined;
  instanceFilter?: GenericInstanceFilter;
  /** Continuation token to resume reading from, relative to this hierarchy level. */
  continuationToken?: ContinuationToken;
  /** Emits when the next node should be read. Awaited before requesting each query page and processing each node. */
  demand: Observable<unknown>;
  processNode: (node: LevelNode) => Observable<TResult>;
}

interface StreamLevelProps extends Omit<ReadLevelProps<never>, "processNode"> {
  /** Parent node of the requested hierarchy level - an ancestor of `parentNode` when that one is hidden. */
  requestedParentNode: StreamingParentNode | undefined;
  /** Continuation token of the hidden parent node, used as a prefix for continuation tokens of this level's nodes. */
  parentContinuationToken: ContinuationToken;
  /** Request-specific data, encoded into continuation tokens of this level's nodes. */
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
  // the source hierarchy definition, wrapped with search, if one is set
  #hierarchyDefinition: RxjsHierarchyDefinition;
  // hash of the search paths, included in continuation tokens' fingerprints
  #searchFingerprint = "";
  readonly #hierarchyChanged = new BeEvent<EventListener<HierarchyProvider["hierarchyChanged"]>>();
  readonly #createNodesQueryClauseFactory: () => NodesQueryClauseFactory;
  readonly #componentId = Guid.createValue();
  readonly #sourceName: string;
  readonly #pageSize: number;
  // incremented whenever the hierarchy changes or the provider is disposed - requests started before that fail
  readonly #interruptGeneration = new BehaviorSubject(0);
  // incremented whenever the iModel changes - continuation tokens created before that can't be used anymore
  #hierarchyGeneration = 0;
  #disposed = false;
  #nodesQueryClauseFactory: NodesQueryClauseFactory;
  #valuesFormatter: IPrimitiveValueFormatter;
  #unsubscribe?: () => void;

  public constructor(props: StreamingIModelHierarchyProviderProps & { sourceName?: string }) {
    this.#pageSize = props.pageSize ?? DEFAULT_PAGE_SIZE;
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
    this.#searchFingerprint = search ? hashString(stableStringify(search.paths)) : "";
  }

  /** Creates an interrupt observable that emits on any hierarchy change after this call or if the provider is disposed. */
  #createInterrupt(): Observable<unknown> {
    const generation = this.#interruptGeneration.value;
    return this.#interruptGeneration.pipe(filter((value) => this.#disposed || value !== generation));
  }

  public getNodes(props: GetStreamedHierarchyNodesProps): HierarchyNodesIterator {
    const tokenContext: ContinuationTokenContext = {
      generation: this.#hierarchyGeneration,
      fingerprint: createRequestFingerprint({ ...props, searchFingerprint: this.#searchFingerprint }),
    };
    // decode the token eagerly to fail early on invalid input
    const continuationToken =
      props.continuationToken !== undefined
        ? decodeContinuationToken(props.continuationToken, tokenContext)
        : undefined;
    // number of nodes that the consumer has requested, but hasn't received yet
    const pendingRequestsCount = new BehaviorSubject(0);
    // the request is interrupted by any hierarchy change after this call, even if iteration hasn't started yet
    const interrupt = this.#createInterrupt();
    return createHierarchyNodesIterator({
      iterator: requestOnDemand({
        source: this.#getNodesObservable({ ...props, continuationToken, tokenContext, pendingRequestsCount }).pipe(
          throwOnInterrupt(interrupt),
        ),
        onRequest: () => pendingRequestsCount.next(pendingRequestsCount.value + 1),
      }),
      initialContinuationToken: props.continuationToken,
    });
  }

  public getNodeInstanceKeys({
    parentNode,
    instanceFilter,
  }: Omit<GetHierarchyNodesProps, "ignoreCache">): AsyncIterableIterator<InstanceKey> {
    const interrupt = this.#createInterrupt();
    const source: Observable<InstanceKey> =
      parentNode && HierarchyNode.isGroupingNode(parentNode)
        ? from(parentNode.groupedInstanceKeys)
        : this.#readInstanceKeys({ parentNode: parentNode && toDefinitionParentNode(parentNode), instanceFilter });
    return requestOnDemand({ source: source.pipe(throwOnInterrupt(interrupt)), onRequest: () => {} });
  }

  /** Reads instance keys of nodes in the given parent node's child hierarchy level, going into hidden nodes. */
  #readInstanceKeys({
    parentNode,
    instanceFilter,
  }: Pick<ReadLevelProps<never>, "parentNode" | "instanceFilter">): Observable<InstanceKey> {
    return this.#readLevel({
      parentNode,
      instanceFilter,
      // instance keys aren't requested one by one, so read them all
      demand: of(undefined),
      processNode: ({ node }) => {
        if (node.processingParams?.hideInHierarchy) {
          return node.children === false ? EMPTY : this.#readInstanceKeys({ parentNode: node, instanceFilter });
        }
        return HierarchyNodeKey.isInstances(node.key) ? from(node.key.instanceKeys) : EMPTY;
      },
    });
  }

  #getNodesObservable({
    parentNode,
    instanceFilter,
    continuationToken,
    tokenContext,
    pendingRequestsCount,
  }: Omit<GetStreamedHierarchyNodesProps, "continuationToken"> & {
    continuationToken: ContinuationToken | undefined;
    tokenContext: ContinuationTokenContext;
    pendingRequestsCount: BehaviorSubject<number>;
  }): Observable<StreamedNode> {
    return defer(() => {
      const requestedParentNode = parentNode ? toDefinitionParentNode(parentNode) : undefined;
      if (parentNode && !requestedParentNode) {
        return EMPTY;
      }
      const timer = new StopWatch(undefined, true);
      let nodesCount = 0;
      return this.#streamLevel({
        parentNode: requestedParentNode,
        requestedParentNode,
        instanceFilter,
        continuationToken,
        parentContinuationToken: [],
        tokenContext,
        // only read nodes that the consumer is waiting for
        demand: pendingRequestsCount.pipe(filter((count) => count > 0)),
      }).pipe(
        tap(() => {
          ++nodesCount;
          pendingRequestsCount.next(pendingRequestsCount.value - 1);
        }),
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

  /**
   * Streams nodes of a hierarchy level the way they're returned by `getNodes`, replacing hidden nodes with their
   * children.
   */
  #streamLevel(props: StreamLevelProps): Observable<StreamedNode> {
    const { parentNode, requestedParentNode, instanceFilter, parentContinuationToken, tokenContext, demand } = props;
    return this.#readLevel({
      parentNode,
      instanceFilter,
      continuationToken: props.continuationToken,
      demand,
      processNode: ({ node, position, nestedContinuationToken }) => {
        const nodeContinuationToken = [...parentContinuationToken, position];
        if (!node.processingParams?.hideInHierarchy) {
          return this.#finalizeNode({ node, parentNode: requestedParentNode }).pipe(
            map((finalNode): StreamedNode => ({
              node: finalNode,
              continuationToken: encodeContinuationToken(nodeContinuationToken, tokenContext),
            })),
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
          parentContinuationToken: nodeContinuationToken,
          tokenContext,
          demand,
        });
      },
    });
  }

  /**
   * Reads pre-processed nodes of a hierarchy level and processes them using the given `processNode` function. Nodes
   * are processed one by one, each of them - only after `demand` emits.
   */
  #readLevel<TResult>(props: ReadLevelProps<TResult>): Observable<TResult> {
    const { parentNode, instanceFilter, demand, processNode } = props;
    const ownParentNode = parentNode
      ? getOwnParentNode(parentNode, { sourceName: this.#sourceName, imodelKey: this.#imodelAccess.imodelKey })
      : undefined;
    if (parentNode && !ownParentNode) {
      return EMPTY;
    }
    const resumePosition: LevelPosition | undefined = props.continuationToken?.[0];
    const resumeNestedContinuationToken = props.continuationToken?.slice(1) ?? [];
    const startDefinitionIndex = resumePosition?.definitionIndex ?? 0;
    return this.#defineHierarchyLevel({ parentNode: ownParentNode, instanceFilter }).pipe(
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

  /**
   * Reads results of the given query in pages, processing each row using `processSourceNode`. A page is requested
   * when `demand` emits after all rows of the previous page are processed. Similarly, the next row is processed when
   * `demand` emits after the previous row is processed.
   */
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
        return this.#readQueryPage({ query: definition.query, offset: pageOffset }).pipe(
          tap(() => ++pageRowsCount),
          // rows of the page are read right away, but each of them is processed only when it's needed
          concatMap((row, index) =>
            onDemand(demand, () => {
              const offset = pageOffset + index;
              return this.#parseNode({ row, parentNode }).pipe(
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

  #readQueryPage({ query, offset }: { query: ECSqlQueryDef; offset: number }): Observable<ECSqlQueryRow> {
    return readNodeRows({
      queryExecutor: this.#imodelAccess,
      query: createPageQuery({ query, offset, limit: this.#pageSize }),
      // the query has its own limit - reaching it means there's another page rather than a failure
      limit: "unbounded",
    });
  }

  /** Finalizes the node the way it's returned by `getNodes`. Completes without a value if the node should be omitted. */
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

  #defineHierarchyLevel({
    parentNode,
    instanceFilter,
  }: Pick<ReadLevelProps<never>, "parentNode" | "instanceFilter">): Observable<HierarchyLevelDefinition> {
    return defineHierarchyLevel({
      hierarchyDefinition: this.#hierarchyDefinition,
      nodesQueryClauseFactory: this.#nodesQueryClauseFactory,
      parentNode,
      ...(instanceFilter ? { instanceFilter } : undefined),
    });
  }

  #parseNode({
    row,
    parentNode,
  }: {
    row: ECSqlQueryRow;
    parentNode: StreamingParentNode | undefined;
  }): Observable<ProviderSourceNode> {
    return parseSourceNode({
      row,
      parentNode,
      imodelKey: this.#imodelAccess.imodelKey,
      parseNode: this.#hierarchyDefinition.parseNode,
    });
  }

  /** Pre-processes the given source node. Completes without a value if the node is omitted. */
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
      // hidden children and children with `hideIfNoChildren` flag only count if they have children themselves - their
      // `children` attribute is used if set, otherwise their child hierarchy level is checked
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

/**
 * Fails the stream with `HierarchyRequestInterruptedError` if `interrupt` emits before the stream finishes. When
 * `interrupt` emits synchronously on subscription, the source isn't subscribed to at all.
 */
function throwOnInterrupt<T>(interrupt: Observable<unknown>): MonoTypeOperatorFunction<T> {
  return (source) =>
    new Observable<T>((subscriber) => {
      subscriber.add(interrupt.subscribe(() => subscriber.error(new HierarchyRequestInterruptedError())));
      if (!subscriber.closed) {
        subscriber.add(source.subscribe(subscriber));
      }
    });
}

/** Runs the given `work` when `demand` emits. */
function onDemand<T>(demand: Observable<unknown>, work: () => Observable<T>): Observable<T> {
  return demand.pipe(take(1), concatMap(work));
}

/**
 * Creates an iterator that subscribes to `source` on the first `next()` call and calls `onRequest` whenever the
 * consumer requests the next value. Unlike async generators, `return()` takes effect immediately, even while a `next()`
 * call is pending: it unsubscribes from `source` and settles pending `next()` calls as done.
 */
function requestOnDemand<T>({
  source,
  onRequest,
}: {
  source: Observable<T>;
  onRequest: () => void;
}): AsyncIterableIterator<T> {
  // values received from `source`, but not yet taken by `next()` calls
  const values: T[] = [];
  // `next()` calls waiting for a value
  const pending: Array<{ resolve: (result: IteratorResult<T>) => void; reject: (reason: unknown) => void }> = [];
  let subscription: Subscription | undefined;
  let finished = false;
  // wrapped to tell apart "no error" from an error with `undefined` reason
  let error: { reason: unknown } | undefined;
  const done = (): IteratorResult<T> => ({ done: true, value: undefined });
  // matches received values, errors and completion with pending `next()` calls
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
    [Symbol.asyncIterator]() {
      return this;
    },
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

/**
 * Returns the given parent node the way it's passed to the hierarchy definition, or `undefined` for grouping nodes,
 * whose children aren't defined by hierarchy definitions.
 */
function toDefinitionParentNode(parentNode: ParentHierarchyNode): StreamingParentNode | undefined {
  return HierarchyNode.isGroupingNode(parentNode) ? undefined : (parentNode as StreamingParentNode);
}

/**
 * Creates a `HierarchyNodesIterator` that returns nodes of the given iterator and tracks continuation token of the
 * last returned node.
 */
function createHierarchyNodesIterator({
  iterator,
  initialContinuationToken,
}: {
  iterator: AsyncIterableIterator<StreamedNode>;
  initialContinuationToken: string | undefined;
}): HierarchyNodesIterator {
  let continuationToken = initialContinuationToken;
  return {
    getContinuationToken() {
      return continuationToken;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      const result = await iterator.next();
      if (result.done) {
        return result;
      }
      continuationToken = result.value.continuationToken;
      return { done: false, value: result.value.node };
    },
    async return() {
      await iterator.return!();
      return { done: true, value: undefined };
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

/** Creates a query that returns up to `limit` rows of the given query, skipping the first `offset` rows. */
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

const CONTINUATION_TOKEN_VERSION = 1;

/** Request-specific data, encoded into continuation tokens and validated when a token is used. */
interface ContinuationTokenContext {
  /** Hierarchy generation the token was created in - tokens created before an iModel change can't be used after it. */
  generation: number;
  /** Fingerprint of the parent node, instance filter and hierarchy search the token was created for. */
  fingerprint: string;
}

/** Serialized form of a continuation token. */
interface ContinuationTokenPayload {
  /** Format version. */
  v: typeof CONTINUATION_TOKEN_VERSION;
  /** Hierarchy generation. */
  g: number;
  /** Parent node, instance filter and hierarchy search fingerprint. */
  f: string;
  /** Token path as `[definitionIndex, offset]` pairs. */
  p: Array<[number, number]>;
}

function encodeContinuationToken(token: ContinuationToken, context: ContinuationTokenContext): string {
  const payload: ContinuationTokenPayload = {
    v: CONTINUATION_TOKEN_VERSION,
    g: context.generation,
    f: context.fingerprint,
    p: token.map(({ definitionIndex, offset }) => [definitionIndex, offset]),
  };
  // the payload only contains ASCII characters, so `btoa` can encode it; use URL-safe base64 alphabet without padding
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeContinuationToken(token: string, context: ContinuationTokenContext): ContinuationToken {
  let payload: unknown;
  try {
    payload = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    payload = undefined;
  }
  if (!isContinuationTokenPayload(payload)) {
    throw new InvalidContinuationTokenError(`Invalid continuation token: "${token}".`);
  }
  if (payload.g !== context.generation) {
    throw new InvalidContinuationTokenError(
      `Continuation token "${token}" was created before a hierarchy change and can't be used anymore.`,
    );
  }
  if (payload.f !== context.fingerprint) {
    throw new InvalidContinuationTokenError(
      `Continuation token "${token}" was created for a different parent node, instance filter or hierarchy search.`,
    );
  }
  return payload.p.map(([definitionIndex, offset]) => ({ definitionIndex, offset }));
}

function isContinuationTokenPayload(value: unknown): value is ContinuationTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { v, g, f, p } = value as {
    [key in keyof ContinuationTokenPayload]?: unknown;
  };
  return (
    v === CONTINUATION_TOKEN_VERSION &&
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

/** Creates a short fingerprint of request's parent node key, its parent keys, instance filter and hierarchy search. */
function createRequestFingerprint({
  parentNode,
  instanceFilter,
  searchFingerprint,
}: GetStreamedHierarchyNodesProps & { searchFingerprint: string }): string {
  return hashString(stableStringify([parentNode?.key, parentNode?.parentKeys, instanceFilter, searchFingerprint]));
}

/** Serializes the value to JSON with object keys sorted, so equal values produce equal strings. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([lhs], [rhs]) => (lhs < rhs ? -1 : 1)))
      : item,
  );
}

/** Calculates 32-bit FNV-1a hash of the string and returns it in base 36 (at most 7 characters). */
function hashString(value: string): string {
  // FNV-1a 32-bit offset basis
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; ++i) {
    hash ^= value.charCodeAt(i);
    // multiply by FNV-1a 32-bit prime, keeping the result within 32 bits
    hash = Math.imul(hash, 0x01000193);
  }
  // convert to unsigned - the largest value, 2^32 - 1 (can always fit in at most 7 length string)
  return (hash >>> 0).toString(36);
}

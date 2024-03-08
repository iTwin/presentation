/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, concatMap, defaultIfEmpty, defer, filter, from, map, mergeMap, Observable, ObservableInput, of, take, tap } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import { assert, StopWatch } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { IMetadataProvider } from "./ECMetadata";
import { DefineHierarchyLevelProps, HierarchyNodesDefinition, IHierarchyLevelDefinitionsFactory } from "./HierarchyDefinition";
import { RowsLimitExceededError } from "./HierarchyErrors";
import {
  HierarchyNode,
  HierarchyNodeIdentifiersPath,
  ParentHierarchyNode,
  ParsedHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "./HierarchyNode";
import { CachedNodesObservableEntry, ChildNodeObservablesCache, ParsedQueryNodesObservable } from "./internal/ChildNodeObservablesCache";
import { LOGGING_NAMESPACE as CommonLoggingNamespace, hasChildren } from "./internal/Common";
import { FilteringHierarchyLevelDefinitionsFactory } from "./internal/FilteringHierarchyLevelDefinitionsFactory";
import { getClass } from "./internal/GetClass";
import { createDetermineChildrenOperator } from "./internal/operators/DetermineChildren";
import { createGroupingOperator } from "./internal/operators/Grouping";
import { createHideIfNoChildrenOperator } from "./internal/operators/HideIfNoChildren";
import { createHideNodesInHierarchyOperator } from "./internal/operators/HideNodesInHierarchy";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting";
import { shareReplayWithErrors } from "./internal/Rxjs";
import { SubscriptionScheduler } from "./internal/SubscriptionScheduler";
import { TreeQueryResultsReader } from "./internal/TreeNodesReader";
import { getLogger, ILogger } from "./Logging";
import { ILimitingECSqlQueryExecutor } from "./queries/LimitingECSqlQueryExecutor";
import { ConcatenatedValue, ConcatenatedValuePart } from "./values/ConcatenatedValue";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "./values/Formatting";
import { TypedPrimitiveValue } from "./values/Values";

const LOGGING_NAMESPACE = `${CommonLoggingNamespace}.HierarchyProvider`;
const DEFAULT_QUERY_CONCURRENCY = 10;

/**
 * Defines the strings used by hierarchy provider.
 * @beta
 */
export interface HierarchyProviderLocalizedStrings {
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
 * Props for [[HierarchyProvider]].
 * @beta
 */
export interface HierarchyProviderProps {
  /** IModel metadata provider for ECSchemas, ECClasses, ECProperties, etc. */
  metadataProvider: IMetadataProvider;
  /** A definition that describes how the hierarchy should be created. */
  hierarchyDefinition: IHierarchyLevelDefinitionsFactory;

  /**
   * IModel ECSQL query executor used to run queries.
   * @see createLimitingECSqlQueryExecutor
   */
  queryExecutor: ILimitingECSqlQueryExecutor;
  /** Maximum number of queries that the provider attempts to execute in parallel. Defaults to `10`. */
  queryConcurrency?: number;
  /** The amount of queries whose results are stored in-memory for quick retrieval. Defaults to `50`. */
  queryCacheSize?: number;

  /**
   * A values formatter for formatting node labels. Defaults to the
   * result of [[createDefaultValueFormatter]] called with default parameters.
   */
  formatter?: IPrimitiveValueFormatter;

  /** A set of localized strings to use. Defaults to English strings. */
  localizedStrings?: HierarchyProviderLocalizedStrings;

  /** Props for filtering the hierarchy. */
  filtering?: {
    /** A list of node identifiers from root to target node. */
    paths: HierarchyNodeIdentifiersPath[];
  };
}

/**
 * Props for [[HierarchyProvider.getNodes]] call.
 * @beta
 */
export interface GetHierarchyNodesProps {
  /** Parent node to get children for. Pass `undefined` to get root nodes. */
  parentNode: ParentHierarchyNode | undefined;
  /** Optional hierarchy level filter. Has no effect if `parentNode` is a [[GroupingNode]]. */
  instanceFilter?: GenericInstanceFilter;
  /**
   * Optional hierarchy level size limit override. This value is passed to `ILimitingECSqlQueryExecutor` used
   * by this provider to override query rows limit per hierarchy level. If not provided, defaults to whatever
   * is used by the limiting query executor.
   *
   * Has no effect if `parentNode` is a [[GroupingNode]].
   */
  hierarchyLevelSizeLimit?: number | "unbounded";
}

/**
 * A hierarchy provider that builds a hierarchy according to given hierarchy definition.
 * @beta
 */
export class HierarchyProvider {
  private _metadataProvider: IMetadataProvider;
  private _queryReader: TreeQueryResultsReader;
  private _valuesFormatter: IPrimitiveValueFormatter;
  private _localizedStrings: HierarchyProviderLocalizedStrings;
  private _queryScheduler: SubscriptionScheduler;
  private _nodesCache: ChildNodeObservablesCache;

  /**
   * Hierarchy level definitions factory used by this provider.
   *
   * @note This does not necessarily match the `hierarchyDefinition` passed through props when constructing
   * the provider. For example, it may a factory that decorates given `hierarchyDefinition` with filtering
   * features.
   */
  public readonly hierarchyDefinition: IHierarchyLevelDefinitionsFactory;

  /**
   * A limiting ECSQL query executor used by this provider.
   * @see HierarchyProviderProps.queryExecutor
   */
  public readonly queryExecutor: ILimitingECSqlQueryExecutor;

  public constructor(props: HierarchyProviderProps) {
    this._metadataProvider = props.metadataProvider;
    if (props.filtering) {
      const filteringDefinition = new FilteringHierarchyLevelDefinitionsFactory({
        metadataProvider: this._metadataProvider,
        source: props.hierarchyDefinition,
        nodeIdentifierPaths: props.filtering.paths,
      });
      this.hierarchyDefinition = filteringDefinition;
      this._queryReader = new TreeQueryResultsReader({ parser: filteringDefinition.parseNode });
    } else {
      this.hierarchyDefinition = props.hierarchyDefinition;
      this._queryReader = new TreeQueryResultsReader({ parser: props.hierarchyDefinition.parseNode });
    }
    this._valuesFormatter = props?.formatter ?? createDefaultValueFormatter();
    this._localizedStrings = props?.localizedStrings ?? { other: "Other", unspecified: "Not specified" };
    this._queryScheduler = new SubscriptionScheduler(props.queryConcurrency ?? DEFAULT_QUERY_CONCURRENCY);
    this._nodesCache = new ChildNodeObservablesCache({
      // we divide the size by 2, because each variation also counts as a query that we cache
      size: Math.round((props.queryCacheSize ?? 50) / 2),
      variationsCount: 1,
    });
    this.queryExecutor = props.queryExecutor;
  }

  /**
   * Sets [[HierarchyProvider]] values formatter that formats nodes' labels. If provided `undefined`, then defaults to the
   * result of [[createDefaultValueFormatter]] called with default parameters.
   */
  public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
    this._valuesFormatter = formatter ?? createDefaultValueFormatter();
  }

  /** @internal */
  public get queryScheduler(): { schedule: ILimitingECSqlQueryExecutor["createQueryReader"] } {
    return {
      schedule: (query, config) =>
        eachValueFrom(this._queryScheduler.scheduleSubscription(defer(() => from(this.queryExecutor.createQueryReader(query, config))))),
    };
  }

  private onGroupingNodeCreated(groupingNode: ProcessedGroupingHierarchyNode, props: GetHierarchyNodesProps) {
    assert(
      // istanbul ignore next
      !props.parentNode || HierarchyNode.isCustom(props.parentNode) || HierarchyNode.isInstancesNode(props.parentNode),
      `Expecting all grouping nodes to be created as part of root / custom / instances node children request, but one is created for: ${createNodeIdentifierForLogging(props.parentNode)}.`,
    );
    groupingNode.nonGroupingAncestor = props.parentNode;
    const didAdd = this._nodesCache.addGrouped({ ...props, parentNode: groupingNode }, from(groupingNode.children));
    // istanbul ignore next
    if (didAdd) {
      doLog({ category: "OnGroupingNodeCreated", message: `Cached grouped nodes observable for ${createNodeIdentifierForLogging(groupingNode)}` });
    } else {
      doLog({
        category: "OnGroupingNodeCreated",
        message: `Grouped nodes observable was not cached for ${createNodeIdentifierForLogging(groupingNode)}`,
        severity: "logWarning",
      });
    }
  }

  private createParsedQueryNodesObservable(props: DefineHierarchyLevelProps & { hierarchyLevelSizeLimit?: number | "unbounded" }): ParsedQueryNodesObservable {
    // stream hierarchy level definitions in order
    const definitions = from(this.hierarchyDefinition.defineHierarchyLevel(props)).pipe(
      concatMap((hierarchyLevelDefinition) => from(hierarchyLevelDefinition)),
    );
    // pipe definitions to nodes and put "share replay" on it
    return definitions.pipe(
      concatMap((def): ObservableInput<ParsedHierarchyNode> => {
        if (HierarchyNodesDefinition.isCustomNode(def)) {
          return of(def.node);
        }
        return this._queryScheduler.scheduleSubscription(
          of(def.query).pipe(
            log("Queries", (query) => `Query direct nodes for parent ${createNodeIdentifierForLogging(props.parentNode)}: ${query.ecsql}`),
            mergeMap((query) => defer(() => from(this._queryReader.read(this.queryExecutor, query, props.hierarchyLevelSizeLimit)))),
          ),
        );
      }),
      shareReplayWithErrors(),
    );
  }

  private createPreProcessedNodesObservable(
    queryNodesObservable: ParsedQueryNodesObservable,
    props: GetHierarchyNodesProps,
  ): Observable<ProcessedHierarchyNode> {
    // pre-process
    const preProcessedNodes = queryNodesObservable.pipe(
      // set parent node keys on the parsed node
      map((node) => ({ ...node, parentKeys: createParentNodeKeysList(props.parentNode) })),
      // format `ConcatenatedValue` labels into string labels
      concatMap(async (node) => applyLabelsFormatting(node, this._metadataProvider, this._valuesFormatter)),
      // we have `ProcessedHierarchyNode` from here
      preProcessNodes(this.hierarchyDefinition),
    );
    // handle nodes' hiding
    const nodesAfterHiding = preProcessedNodes.pipe(
      createHideIfNoChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n }).pipe(mergeMap((x) => x.hasNodes)), false),
      createHideNodesInHierarchyOperator(
        // note: for child nodes created because of hidden parent, we want to use parent's request props (instance filter, limit)
        (n) => this.getChildNodesObservables({ ...props, parentNode: n }).pipe(mergeMap((x) => x.processedNodes)),
        false,
      ),
    );
    return nodesAfterHiding;
  }

  private createProcessedNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    props: GetHierarchyNodesProps,
  ): Observable<ProcessedHierarchyNode> {
    return preprocessedNodesObservable.pipe(
      sortNodesByLabelOperator,
      createGroupingOperator(this._metadataProvider, this._valuesFormatter, this._localizedStrings, (gn) => this.onGroupingNodeCreated(gn, props)),
    );
  }

  private createFinalizedNodesObservable(processedNodesObservable: Observable<ProcessedHierarchyNode>): Observable<HierarchyNode> {
    return processedNodesObservable.pipe(
      createDetermineChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n }).pipe(mergeMap((x) => x.hasNodes))),
      postProcessNodes(this.hierarchyDefinition),
      map((n): HierarchyNode => {
        const node = { ...n };
        if (HierarchyNode.isCustom(node) || HierarchyNode.isInstancesNode(node)) {
          delete node.processingParams;
        }
        return { ...node, children: hasChildren(n) };
      }),
    );
  }

  private createHasNodesObservable(preprocessedNodesObservable: Observable<ProcessedHierarchyNode>): Observable<boolean> {
    return preprocessedNodesObservable.pipe(
      log("HasNodes", (n) => `Node before mapping to 'true': ${createNodeIdentifierForLogging(n)}`),
      map(() => true),
      take(1),
      defaultIfEmpty(false),
      catchError((e: Error) => {
        doLog({ category: "HasNodes", message: `Error while determining children: ${e.message}` });
        if (e instanceof RowsLimitExceededError) {
          return of(true);
        }
        throw e;
      }),
      log("HasNodes", (r) => `Result: ${r}`),
    );
  }

  private getCachedObservableEntry(props: GetHierarchyNodesProps): Observable<CachedNodesObservableEntry> {
    const { parentNode, ...restProps } = props;
    const cached = this._nodesCache.get(props);
    if (cached) {
      // istanbul ignore next
      doLog({ category: "GetCachedObservableEntry", message: `Found query nodes observable for ${createNodeIdentifierForLogging(parentNode)}` });
      return of(cached);
    }

    if (parentNode && HierarchyNode.isGroupingNode(parentNode)) {
      // Generally, we expect that grouping nodes will always have their child observables cached, in which case we
      // return above. However, it's possible that the parent level was pushed-out of cache, in which case we need to
      // re-create it.
      return this.getChildNodesObservables({ ...props, parentNode: parentNode.nonGroupingAncestor }).pipe(
        mergeMap((x) => x.processedNodes),
        take(1),
        defaultIfEmpty(false),
        mergeMap(() => this.getCachedObservableEntry(props)),
      );
    }

    assert(
      !parentNode || HierarchyNode.isCustom(parentNode) || HierarchyNode.isInstancesNode(parentNode),
      `Grouping nodes are expected to always have their children cached. Offending node: ${createNodeIdentifierForLogging(parentNode)}.`,
    );

    const validProps = { ...restProps, parentNode };
    const value = this.createParsedQueryNodesObservable(validProps);
    this._nodesCache.addParseResult(validProps, value);
    doLog({ category: "GetCachedObservableEntry", message: `Saved query nodes observable for ${createNodeIdentifierForLogging(parentNode)}` });
    return of({ observable: value, needsProcessing: true });
  }

  private getChildNodesObservables(props: GetHierarchyNodesProps & { hierarchyLevelSizeLimit?: number | "unbounded" }) {
    return this.getCachedObservableEntry(props).pipe(
      map((entry) => {
        const processed = entry.needsProcessing
          ? (() => {
              const pre = this.createPreProcessedNodesObservable(entry.observable, props);
              const post = this.createProcessedNodesObservable(pre, props);
              return { pre, post };
            })()
          : {
              pre: entry.observable,
              post: entry.observable,
            };
        return {
          processedNodes: processed.post,
          hasNodes: this.createHasNodesObservable(processed.pre),
          finalizedNodes: this.createFinalizedNodesObservable(processed.post),
        };
      }),
    );
  }

  /**
   * Creates and runs a query based on provided props, then processes retrieved nodes and returns them.
   */
  public async getNodes(props: GetHierarchyNodesProps): Promise<HierarchyNode[]> {
    return new Promise((resolve, reject) => {
      const timer = new StopWatch(undefined, true);
      doLog({ category: "GetNodes", message: `Requesting child nodes for ${createNodeIdentifierForLogging(props.parentNode)}` });
      const nodes = new Array<HierarchyNode>();
      this.getChildNodesObservables(props)
        .pipe(mergeMap(({ finalizedNodes }) => finalizedNodes))
        .subscribe({
          next(node) {
            nodes.push(node);
          },
          error(err) {
            reject(err);
          },
          complete() {
            doLog({
              category: "GetNodes",
              message: `Returning ${nodes.length} child nodes for ${createNodeIdentifierForLogging(props.parentNode)} in ${timer.currentSeconds.toFixed(2)} s.`,
            });
            resolve(nodes);
          },
        });
    });
  }

  /**
   * A function that should be called when the underlying data source, used by `HierarchyProviderProps.metadataProvider`,
   * `HierarchyProviderProps.queryExecutor` or `HierarchyProviderProps.hierarchyDefinition`, changes.
   *
   * Calling the function invalidates internal caches to make sure fresh data is retrieved on new requests.
   */
  public notifyDataSourceChanged() {
    this._nodesCache.clear();
  }
}

function preProcessNodes(hierarchyFactory: IHierarchyLevelDefinitionsFactory) {
  return hierarchyFactory.preProcessNode
    ? processNodes(hierarchyFactory.preProcessNode)
    : (o: Observable<ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode>) => o;
}

function postProcessNodes(hierarchyFactory: IHierarchyLevelDefinitionsFactory) {
  return hierarchyFactory.postProcessNode ? processNodes(hierarchyFactory.postProcessNode) : (o: Observable<ProcessedHierarchyNode>) => o;
}

function processNodes<TNode>(processor: (node: TNode) => Promise<TNode | undefined>) {
  return (nodes: Observable<TNode>) =>
    nodes.pipe(
      concatMap(processor),
      filter((n): n is TNode => !!n),
    );
}

async function applyLabelsFormatting<TNode extends { label: string | ConcatenatedValue }>(
  node: TNode,
  metadata: IMetadataProvider,
  valueFormatter: (value: TypedPrimitiveValue) => Promise<string>,
): Promise<TNode & { label: string }> {
  if (typeof node.label === "string") {
    const formattedLabel = await valueFormatter({ value: node.label, type: "String" });
    return { ...node, label: formattedLabel };
  }
  return {
    ...node,
    label: await ConcatenatedValue.serialize(node.label, async (part: ConcatenatedValuePart) => {
      // strings are converted to typed strings
      if (typeof part === "string") {
        part = {
          value: part,
          type: "String",
        };
      }
      // for property parts - find property metadata and create `TypedPrimitiveValue` for them.
      if (ConcatenatedValuePart.isProperty(part)) {
        const property = await getProperty(part, metadata);
        if (!property?.isPrimitive()) {
          throw new Error(`Labels formatter expects a primitive property, but it's not.`);
        }
        if (property.primitiveType === "IGeometry") {
          throw new Error(`Labels formatter does not support "IGeometry" values, but the provided ${part.className}.${part.propertyName} property is.`);
        }
        if (property.primitiveType === "Binary") {
          throw new Error(`Labels formatter does not support "Binary" values, but the provided ${part.className}.${part.propertyName} property is.`);
        }
        part = {
          type: property.primitiveType,
          extendedType: property.extendedTypeName,
          koqName: (await property.kindOfQuantity)?.fullName,
          value: part.value,
        } as TypedPrimitiveValue;
      }
      // finally, use provided value formatter to create a string from `TypedPrimitiveValue`
      return valueFormatter(part);
    }),
  };
}

async function getProperty({ className, propertyName }: { className: string; propertyName: string }, metadata: IMetadataProvider) {
  const propertyClass = await getClass(metadata, className);
  return propertyClass.getProperty(propertyName);
}

function createParentNodeKeysList(parentNode: ParentHierarchyNode | undefined) {
  if (!parentNode) {
    return [];
  }
  return [...parentNode.parentKeys, parentNode.key];
}

interface LogMessageProps {
  message: string;
  category: string;
  severity?: keyof ILogger;
}
function doLog(props: LogMessageProps) {
  getLogger()[props.severity ?? "logTrace"](`${LOGGING_NAMESPACE}.${props.category}`, props.message);
}

function log<T>(loggingCategory: string, msg: (arg: T) => string) {
  return tap<T>((n) => doLog({ category: loggingCategory, message: msg(n) }));
}

function createNodeIdentifierForLogging(node: ParentHierarchyNode | HierarchyNode | undefined) {
  if (!node) {
    return "<root>";
  }
  const { label, key, parentKeys } = node;
  return JSON.stringify({ label, key, parentKeys });
}

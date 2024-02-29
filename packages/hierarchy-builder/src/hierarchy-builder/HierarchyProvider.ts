/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  catchError, concatMap, defaultIfEmpty, defer, filter, from, map, mergeMap, MonoTypeOperatorFunction, Observable, ObservableInput, of, take, tap,
} from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import { assert, Dictionary, LRUCache, LRUMap, omit } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { IMetadataProvider } from "./ECMetadata";
import { DefineHierarchyLevelProps, HierarchyNodesDefinition, IHierarchyLevelDefinitionsFactory } from "./HierarchyDefinition";
import { RowsLimitExceededError } from "./HierarchyErrors";
import {
  HierarchyNode, HierarchyNodeIdentifiersPath, ParentNodeKey, ParsedHierarchyNode, ProcessedCustomHierarchyNode, ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode, ProcessedInstanceHierarchyNode,
} from "./HierarchyNode";
import { hasChildren, LOGGING_NAMESPACE as CommonLoggingNamespace } from "./internal/Common";
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
import { getLogger } from "./Logging";
import { ILimitingECSqlQueryExecutor } from "./queries/LimitingECSqlQueryExecutor";
import { ConcatenatedValue, ConcatenatedValuePart } from "./values/ConcatenatedValue";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "./values/Formatting";
import { TypedPrimitiveValue } from "./values/Values";

const LOGGING_NAMESPACE = `${CommonLoggingNamespace}.HierarchyProvider`;
const DEFAULT_QUERY_CONCURRENCY = 10;

/**
 * A type of [[HierarchyNode]] that doesn't know about its children and is an input when requesting
 * them using [[HierarchyProvider.getNodes]].
 *
 * @beta
 */
export type ParentHierarchyNode = Omit<HierarchyNode, "children">;

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
  private _nodesCache: ChildNodesCache;

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
    this._nodesCache = new ChildNodesCache();
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
    doLog("OnGroupingNodeCreated", `Cached grouped nodes observable for ${groupingNode.label}`);
    this._nodesCache.add({ ...props, parentNode: groupingNode }, { observable: from(groupingNode.children), needsProcessing: false });
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
            log((query) => `Query direct nodes for parent ${props.parentNode ? JSON.stringify(props.parentNode) : "<root>"}: ${query.ecsql}`),
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
      createHideIfNoChildrenOperator((n) => this.getChildNodesObservables({ ...props, parentNode: n }).hasNodes, false),
      createHideNodesInHierarchyOperator((n) => this.getChildNodesObservables({ ...props, parentNode: n }).processedNodes, false),
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
      createDetermineChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n }).hasNodes),
      postProcessNodes(this.hierarchyDefinition),
      map((n): HierarchyNode => {
        const node = { ...n, children: hasChildren(n) };
        return HierarchyNode.isGroupingNode(node) ? node : omit(node, ["processingParams"]);
      }),
    );
  }

  private createHasNodesObservable(preprocessedNodesObservable: Observable<ProcessedHierarchyNode>): Observable<boolean> {
    return preprocessedNodesObservable.pipe(
      log("HasNodes", (n) => `Node before mapping to 'true': ${JSON.stringify(n)}`),
      map(() => true),
      take(1),
      defaultIfEmpty(false),
      catchError((e: Error) => {
        doLog("HasNodes", `Error while determining children: ${e.message}`);
        if (e instanceof RowsLimitExceededError) {
          return of(true);
        }
        throw e;
      }),
      log("HasNodes", (r) => `Result: ${r}`),
    );
  }

  private getCachedObservableEntry(props: GetHierarchyNodesProps): CachedNodesObservableEntry {
    const { parentNode, ...restProps } = props;
    const parentNodeLabel = parentNode ? parentNode.label : "<root>";
    const cached = this._nodesCache.get(props);
    if (cached) {
      // istanbul ignore next
      doLog("GetCachedObservableEntry", `Found query nodes observable for ${parentNodeLabel}`);
      return cached;
    }

    assert(
      !parentNode || HierarchyNode.isCustom(parentNode) || HierarchyNode.isInstancesNode(parentNode),
      `Grouping nodes are expected to always have their children cached as soon as they're created. Offending node: ${JSON.stringify(parentNode)}.`,
    );

    const value = { observable: this.createParsedQueryNodesObservable({ ...restProps, parentNode }), needsProcessing: true as const };
    this._nodesCache.add(props, value);
    doLog("GetCachedObservableEntry", `Saved query nodes observable for ${parentNodeLabel}`);
    return value;
  }

  private getChildNodesObservables(props: GetHierarchyNodesProps & { hierarchyLevelSizeLimit?: number | "unbounded" }) {
    const entry = this.getCachedObservableEntry(props);
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
  }

  /**
   * Creates and runs a query based on provided props, then processes retrieved nodes and returns them.
   */
  public async getNodes(props: GetHierarchyNodesProps): Promise<HierarchyNode[]> {
    return new Promise((resolve, reject) => {
      const nodes = new Array<HierarchyNode>();
      this.getChildNodesObservables(props).finalizedNodes.subscribe({
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

type ParsedQueryNodesObservable = Observable<ParsedHierarchyNode>;
type ProcessedNodesObservable = Observable<ProcessedHierarchyNode>;
type CachedNodesObservableEntry =
  | { observable: ParsedQueryNodesObservable; needsProcessing: true }
  | { observable: ProcessedNodesObservable; needsProcessing: false };
interface ChildNodesCacheEntry {
  /** Stores observables for the default case - no instance filter or custom limit for the hierarchy level. */
  primary: CachedNodesObservableEntry | undefined;
  /** Stores a limited number of variations with custom instance filter and/or custom limit for the hierarchy level. */
  variations: LRUCache<string, CachedNodesObservableEntry>;
}
class ChildNodesCache {
  private _map = new Dictionary<ParentNodeKey[], ChildNodesCacheEntry>((lhs, rhs) => this.compareHierarchyNodeKeys(lhs, rhs));

  private createVariationKey(props: GetHierarchyNodesProps) {
    const { instanceFilter, parentNode } = props;
    let { hierarchyLevelSizeLimit } = props;
    if (parentNode && HierarchyNode.isGroupingNode(parentNode)) {
      hierarchyLevelSizeLimit = undefined;
    }
    if (instanceFilter === undefined && hierarchyLevelSizeLimit === undefined) {
      return undefined;
    }
    return JSON.stringify({ instanceFilter, hierarchyLevelSizeLimit });
  }

  private compareHierarchyNodeKeys(lhs: ParentNodeKey[], rhs: ParentNodeKey[]) {
    if (lhs.length !== rhs.length) {
      return lhs.length - rhs.length;
    }
    for (let i = 0; i < lhs.length; ++i) {
      const keysCompareResult = ParentNodeKey.compare(lhs[i], rhs[i]);
      // istanbul ignore if
      if (keysCompareResult !== 0) {
        return keysCompareResult;
      }
    }
    return 0;
  }

  private parseRequestProps(requestProps: GetHierarchyNodesProps) {
    const { parentNode: node } = requestProps;
    const primaryKey = node ? [...node.parentKeys, node.key] : [];
    const variationKey = this.createVariationKey(requestProps);
    return { primaryKey, variationKey };
  }

  public add(requestProps: GetHierarchyNodesProps, value: CachedNodesObservableEntry) {
    const { primaryKey, variationKey } = this.parseRequestProps(requestProps);
    let entry = this._map.get(primaryKey);
    if (!entry) {
      entry = { primary: undefined, variations: new LRUMap(5) };
      this._map.set(primaryKey, entry);
    }
    if (variationKey) {
      entry.variations.set(variationKey, value);
    } else {
      entry.primary = value;
    }
  }

  public get(requestProps: GetHierarchyNodesProps): CachedNodesObservableEntry | undefined {
    const { primaryKey, variationKey } = this.parseRequestProps(requestProps);
    const entry = this._map.get(primaryKey);
    if (!entry) {
      return undefined;
    }
    return variationKey ? entry.variations.get(variationKey) : entry.primary;
  }

  public clear() {
    this._map.clear();
  }
}

function doLog(msg: string): void;
// eslint-disable-next-line @typescript-eslint/unified-signatures
function doLog(loggingCategory: string, msg: string): void;
function doLog(loggingCategoryOrMsg: string, msg?: string) {
  if (msg) {
    getLogger().logTrace(`${LOGGING_NAMESPACE}.${loggingCategoryOrMsg}`, msg);
  } else {
    getLogger().logTrace(LOGGING_NAMESPACE, loggingCategoryOrMsg);
  }
}

function log<T>(msg: (arg: T) => string): MonoTypeOperatorFunction<T>;
function log<T>(loggingCategory: string, msg: (arg: T) => string): MonoTypeOperatorFunction<T>;
function log<T>(loggingCategoryOrMsg: string | ((arg: T) => string), msg?: (arg: T) => string) {
  if (msg) {
    return tap<T>((n) => doLog(loggingCategoryOrMsg as string, msg(n)));
  }
  return tap<T>((n) => doLog((loggingCategoryOrMsg as (arg: T) => string)(n)));
}

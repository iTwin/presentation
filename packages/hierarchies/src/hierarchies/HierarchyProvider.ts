/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, concatMap, defaultIfEmpty, defer, filter, from, map, mergeMap, Observable, ObservableInput, of, take } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import { assert, StopWatch } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { IMetadataProvider } from "./ECMetadata";
import { DefineHierarchyLevelProps, HierarchyNodesDefinition, IHierarchyLevelDefinitionsFactory } from "./HierarchyDefinition";
import { RowsLimitExceededError } from "./HierarchyErrors";
import {
  HierarchyNode,
  HierarchyNodeIdentifiersPath,
  NonGroupingHierarchyNode,
  ParentHierarchyNode,
  ParsedHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "./HierarchyNode";
import { CachedNodesObservableEntry, ChildNodeObservablesCache, ParsedQueryNodesObservable } from "./internal/ChildNodeObservablesCache";
import { BaseClassChecker, LOGGING_NAMESPACE as CommonLoggingNamespace, createNodeIdentifierForLogging, hasChildren } from "./internal/Common";
import { FilteringHierarchyLevelDefinitionsFactory } from "./internal/FilteringHierarchyLevelDefinitionsFactory";
import { getClass } from "./internal/GetClass";
import { createQueryLogMessage, doLog, log } from "./internal/LoggingUtils";
import { createDetermineChildrenOperator } from "./internal/operators/DetermineChildren";
import { createGroupingOperator } from "./internal/operators/Grouping";
import { createHideIfNoChildrenOperator } from "./internal/operators/HideIfNoChildren";
import { createHideNodesInHierarchyOperator } from "./internal/operators/HideNodesInHierarchy";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting";
import { shareReplayWithErrors } from "./internal/Rxjs";
import { SubscriptionScheduler } from "./internal/SubscriptionScheduler";
import { TreeQueryResultsReader } from "./internal/TreeNodesReader";
import { ECSqlBinding, ECSqlQueryDef } from "./queries/ECSqlCore";
import { ILimitingECSqlQueryExecutor } from "./queries/LimitingECSqlQueryExecutor";
import { ConcatenatedValue, ConcatenatedValuePart } from "./values/ConcatenatedValue";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "./values/Formatting";
import { InstanceKey, TypedPrimitiveValue } from "./values/Values";

const LOGGING_NAMESPACE = `${CommonLoggingNamespace}.HierarchyProvider`;
const DEFAULT_QUERY_CONCURRENCY = 10;
const DEFAULT_QUERY_CACHE_SIZE = 50;
const DEFAULT_BASE_CHECKER_CACHE_SIZE = 1000;

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
  /** When set to true ignores the cache and fetches the nodes again. */
  ignoreCache?: boolean;
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
  private _baseClassChecker: BaseClassChecker;

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
      size: Math.round((props.queryCacheSize ?? DEFAULT_QUERY_CACHE_SIZE) / 2),
      variationsCount: 1,
    });
    this.queryExecutor = props.queryExecutor;
    this._baseClassChecker = new BaseClassChecker(this._metadataProvider, DEFAULT_BASE_CHECKER_CACHE_SIZE);
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
    this._nodesCache.set({ ...props, parentNode: groupingNode }, { observable: from(groupingNode.children), processingStatus: "pre-processed" });
  }

  private createParsedQueryNodesObservable(
    props: DefineHierarchyLevelProps & { hierarchyLevelSizeLimit?: number | "unbounded"; filteredInstanceKeys?: InstanceKey[] },
  ): ParsedQueryNodesObservable {
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
            map((query) => filterQueryByInstanceKeys(query, props.filteredInstanceKeys)),
            log({
              category: `${LOGGING_NAMESPACE}.Queries`,
              message: /* istanbul ignore next */ (query) =>
                `Query direct nodes for parent ${createNodeIdentifierForLogging(props.parentNode)}: ${createQueryLogMessage(query)}`,
            }),
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
      createHideIfNoChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n }).hasNodes),
      createHideNodesInHierarchyOperator(
        // note: for child nodes created because of hidden parent, we want to use parent's request props (instance filter, limit)
        (n) => this.getChildNodesObservables({ ...props, parentNode: n }).processedNodes,
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
      createGroupingOperator(this._metadataProvider, props.parentNode, this._valuesFormatter, this._localizedStrings, this._baseClassChecker, (gn) =>
        this.onGroupingNodeCreated(gn, props),
      ),
    );
  }

  private createFinalizedNodesObservable(processedNodesObservable: Observable<ProcessedHierarchyNode>): Observable<HierarchyNode> {
    return processedNodesObservable.pipe(
      createDetermineChildrenOperator((n) => this.getChildNodesObservables({ parentNode: n }).hasNodes),
      postProcessNodes(this.hierarchyDefinition),
      sortNodesByLabelOperator,
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
    const loggingCategory = `${LOGGING_NAMESPACE}.HasNodes`;
    return preprocessedNodesObservable.pipe(
      log({ category: loggingCategory, message: /* istanbul ignore next */ (n) => `Node before mapping to 'true': ${createNodeIdentifierForLogging(n)}` }),
      map(() => true),
      take(1),
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
    const cached = props.ignoreCache ? undefined : this._nodesCache.get(props);
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

    const nonGroupingNodeChildrenRequestProps = { ...restProps, parentNode: parentNonGroupingNode, filteredInstanceKeys };
    const value = { observable: this.createParsedQueryNodesObservable(nonGroupingNodeChildrenRequestProps), processingStatus: "none" as const };
    this._nodesCache.set(nonGroupingNodeChildrenRequestProps, value);
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
          hasNodes: this.createHasNodesObservable(pre),
          finalizedNodes: this.createFinalizedNodesObservable(post),
        };
      }
      case "pre-processed": {
        const post = this.createProcessedNodesObservable(entry.observable, props);
        return {
          processedNodes: post,
          hasNodes: this.createHasNodesObservable(entry.observable),
          finalizedNodes: this.createFinalizedNodesObservable(post),
        };
      }
    }
  }

  /**
   * Creates and runs a query based on provided props, then processes retrieved nodes and returns them.
   */
  public async getNodes(props: GetHierarchyNodesProps): Promise<HierarchyNode[]> {
    const loggingCategory = `${LOGGING_NAMESPACE}.GetNodes`;
    return new Promise((resolve, reject) => {
      const timer = new StopWatch(undefined, true);
      doLog({
        category: loggingCategory,
        message: /* istanbul ignore next */ () => `Requesting child nodes for ${createNodeIdentifierForLogging(props.parentNode)}`,
      });
      const nodes = new Array<HierarchyNode>();
      this.getChildNodesObservables(props).finalizedNodes.subscribe({
        next(node) {
          nodes.push(node);
        },
        error(err) {
          doLog({
            category: loggingCategory,
            message: /* istanbul ignore next */ () =>
              `Error creating child nodes for ${createNodeIdentifierForLogging(props.parentNode)}: ${err instanceof Error ? err.message : err.toString()}`,
          });
          reject(err);
        },
        complete() {
          doLog({
            category: loggingCategory,
            message: /* istanbul ignore next */ () =>
              `Returning ${nodes.length} child nodes for ${createNodeIdentifierForLogging(props.parentNode)} in ${timer.currentSeconds.toFixed(2)} s.`,
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

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  catchError,
  concatAll,
  concatMap,
  defaultIfEmpty,
  filter,
  from,
  map,
  mergeMap,
  MonoTypeOperatorFunction,
  Observable,
  ObservableInput,
  of,
  shareReplay,
  take,
  tap,
} from "rxjs";
import { assert, LRUCache, LRUMap, omit } from "@itwin/core-bentley";
import { IMetadataProvider } from "./ECMetadata";
import { GenericInstanceFilter } from "./GenericInstanceFilter";
import { DefineHierarchyLevelProps, HierarchyNodesDefinition, IHierarchyLevelDefinitionsFactory } from "./HierarchyDefinition";
import {
  HierarchyNode,
  HierarchyNodeIdentifiersPath,
  ParsedHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "./HierarchyNode";
import { LOGGING_NAMESPACE as CommonLoggingNamespace, getClass, hasChildren } from "./internal/Common";
import { FilteringHierarchyLevelDefinitionsFactory } from "./internal/FilteringHierarchyLevelDefinitionsFactory";
import { createDetermineChildrenOperator } from "./internal/operators/DetermineChildren";
import { createGroupingOperator } from "./internal/operators/Grouping";
import { createHideIfNoChildrenOperator } from "./internal/operators/HideIfNoChildren";
import { createHideNodesInHierarchyOperator } from "./internal/operators/HideNodesInHierarchy";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting";
import { QueryScheduler } from "./internal/QueryScheduler";
import { applyLimit, RowsLimitExceededError, TreeQueryResultsReader } from "./internal/TreeNodesReader";
import { getLogger } from "./Logging";
import { IECSqlQueryExecutor } from "./queries/ECSqlCore";
import { ConcatenatedValue, ConcatenatedValuePart } from "./values/ConcatenatedValue";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "./values/Formatting";
import { TypedPrimitiveValue } from "./values/Values";

const LOGGING_NAMESPACE = `${CommonLoggingNamespace}.HierarchyProvider`;

/**
 * A type of [[HierarchyNode]] that doesn't know about its children and is an input when requesting
 * them using [[HierarchyProvider.getNodes]].
 *
 * @beta
 */
export type ParentHierarchyNode = Omit<HierarchyNode, "children">;

/**
 * Props for [[HierarchyProvider]].
 * @beta
 */
export interface HierarchyProviderProps {
  /** IModel metadata provider for ECSchemas, ECClasses, ECProperties, etc. */
  metadataProvider: IMetadataProvider;
  /** IModel ECSQL query executor used to run queries. */
  queryExecutor: IECSqlQueryExecutor;
  /** A definition that describes how the hierarchy should be created. */
  hierarchyDefinition: IHierarchyLevelDefinitionsFactory;

  /**
   * A values formatter for formatting node labels. Defaults to the
   * result of [[createDefaultValueFormatter]] called with default parameters.
   */
  formatter?: IPrimitiveValueFormatter;

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
  /** Optional hierarchy level filter. */
  instanceFilter?: GenericInstanceFilter;
  /** Optional hierarchy level size limit. Default limit is 1000. */
  hierarchyLevelSizeLimit?: number;
}

/**
 * A hierarchy provider that builds a hierarchy according to given hierarchy definition.
 * @beta
 */
export class HierarchyProvider {
  private _metadataProvider: IMetadataProvider;
  private _hierarchyFactory: IHierarchyLevelDefinitionsFactory;
  private _queryExecutor: IECSqlQueryExecutor;
  private _queryReader: TreeQueryResultsReader;
  private _valuesFormatter: IPrimitiveValueFormatter;
  private _scheduler: QueryScheduler<ParsedHierarchyNode[]>;
  private _nodesCache: ChildNodesCache;

  public constructor(props: HierarchyProviderProps) {
    this._metadataProvider = props.metadataProvider;
    if (props.filtering) {
      const filteringDefinition = new FilteringHierarchyLevelDefinitionsFactory({
        metadataProvider: this._metadataProvider,
        source: props.hierarchyDefinition,
        nodeIdentifierPaths: props.filtering.paths,
      });
      this._hierarchyFactory = filteringDefinition;
      this._queryReader = new TreeQueryResultsReader({ parser: filteringDefinition.parseNode });
    } else {
      this._hierarchyFactory = props.hierarchyDefinition;
      this._queryReader = new TreeQueryResultsReader({ parser: this._hierarchyFactory.parseNode });
    }
    this._queryExecutor = props.queryExecutor;
    this._valuesFormatter = props?.formatter ?? createDefaultValueFormatter();
    this._scheduler = new QueryScheduler(QUERY_CONCURRENCY);
    this._nodesCache = new ChildNodesCache();
  }

  private onGroupingNodeCreated(groupingNode: ProcessedGroupingHierarchyNode, props: GetHierarchyNodesProps) {
    const childNodesObs = from(groupingNode.children);
    this._nodesCache.add(
      { ...props, parentNode: groupingNode },
      {
        // grouping operators are run on processed, but not finalized nodes, so the child nodes here
        // are processed, but not finalized
        processedNodes: childNodesObs,
        finalizedNodes: this.createFinalizedNodesObservable(childNodesObs),
        hasNodes: of(groupingNode.children.length > 0),
      },
    );
  }

  private createPreProcessedNodesObservable(props: DefineHierarchyLevelProps): Observable<ProcessedHierarchyNode> {
    // stream hierarchy level definitions in order
    const definitions = from(this._hierarchyFactory.defineHierarchyLevel(props)).pipe(concatMap((hierarchyLevelDefinition) => from(hierarchyLevelDefinition)));
    // pipe definitions to nodes
    const directNodes = definitions.pipe(
      concatMap((def): ObservableInput<ParsedHierarchyNode[]> => {
        if (HierarchyNodesDefinition.isCustomNode(def)) {
          return of([def.node]);
        }
        return this._scheduler.scheduleSubscription(
          of(def.query).pipe(
            log((query) => `Query direct nodes for parent ${props.parentNode ? JSON.stringify(props.parentNode) : "<root>"}: ${query.ecsql}`),
            mergeMap((query) =>
              from(
                this._queryReader.read(
                  this._queryExecutor,
                  { ...query, ecsql: applyLimit({ ...query, limit: props.hierarchyLevelSizeLimit }) },
                  props.hierarchyLevelSizeLimit,
                ),
              ),
            ),
          ),
        );
      }),
      concatAll(),
    );
    // pre-process
    const preProcessedNodes = directNodes.pipe(
      // set parent node keys on the parsed node
      map((node) => ({ ...node, parentKeys: createParentNodeKeysList(props.parentNode) })),
      // format `ConcatenatedValue` labels into string labels
      concatMap(async (node) => applyLabelsFormatting(node, this._metadataProvider, this._valuesFormatter)),
      // we have `ProcessedHierarchyNode` from here
      preProcessNodes(this._hierarchyFactory),
    );
    // handle nodes' hiding
    const nodesAfterHiding = preProcessedNodes.pipe(
      createHideIfNoChildrenOperator((n) => this.ensureChildNodesObservables({ ...props, parentNode: n }).hasNodes, false),
      createHideNodesInHierarchyOperator((n) => this.ensureChildNodesObservables({ ...props, parentNode: n }).processedNodes, false),
    );
    // cache observable result & return
    return nodesAfterHiding.pipe(
      // cache to avoid querying and pre-processing more than once
      shareReplay(),
    );
  }

  private createProcessedNodesObservable(
    preprocessedNodesObservable: Observable<ProcessedHierarchyNode>,
    props: DefineHierarchyLevelProps,
  ): Observable<ProcessedHierarchyNode> {
    return preprocessedNodesObservable.pipe(
      sortNodesByLabelOperator,
      createGroupingOperator(this._metadataProvider, this._valuesFormatter, (gn) => this.onGroupingNodeCreated(gn, props)),
      // cache to avoid expensive processing more than once
      shareReplay(),
    );
  }

  private createFinalizedNodesObservable(processedNodesObservable: Observable<ProcessedHierarchyNode>): Observable<HierarchyNode> {
    return processedNodesObservable.pipe(
      createDetermineChildrenOperator((n) => this.ensureChildNodesObservables({ parentNode: n }).hasNodes),
      postProcessNodes(this._hierarchyFactory),
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

  private setupObservables(props: DefineHierarchyLevelProps): ChildNodesObservables {
    const initialNodes = this.createPreProcessedNodesObservable(props);
    const processedNodes = this.createProcessedNodesObservable(initialNodes, props);
    const finalizedNodes = this.createFinalizedNodesObservable(processedNodes);
    const hasNodes = this.createHasNodesObservable(initialNodes);
    return { processedNodes, finalizedNodes, hasNodes };
  }

  private ensureChildNodesObservables(props: GetHierarchyNodesProps): ChildNodesObservables {
    const { parentNode, ...restProps } = props;
    const parentNodeLabel = parentNode ? parentNode.label : "<root>";
    const cached = this._nodesCache.get(props);
    if (cached) {
      // istanbul ignore next
      doLog("EnsureChildNodesObservables", `Found nodes observables for ${parentNodeLabel}`);
      return cached;
    }

    assert(
      !parentNode || HierarchyNode.isCustom(parentNode) || HierarchyNode.isInstancesNode(parentNode),
      `Grouping nodes are expected to always have their children cached as soon as they're created. Offending node: "${parentNodeLabel}".`,
    );

    const value = this.setupObservables({ ...restProps, parentNode });
    this._nodesCache.add(props, value);
    doLog("EnsureChildNodesObservables", `Saved nodes observables for ${parentNodeLabel}`);
    return value;
  }

  public async getNodes(props: GetHierarchyNodesProps): Promise<HierarchyNode[]> {
    return new Promise((resolve, reject) => {
      const nodes = new Array<HierarchyNode>();
      this.ensureChildNodesObservables(props).finalizedNodes.subscribe({
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
}

const QUERY_CONCURRENCY = 10;

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

interface ChildNodesObservables {
  processedNodes: Observable<ProcessedHierarchyNode>;
  finalizedNodes: Observable<HierarchyNode>;
  hasNodes: Observable<boolean>;
}
class ChildNodesCache {
  private _map = new Map<string, { primary: ChildNodesObservables | undefined; variations: LRUCache<string, ChildNodesObservables> }>();

  private parseRequestProps(requestProps: GetHierarchyNodesProps) {
    const { parentNode: node } = requestProps;
    const primaryKey = node ? `${JSON.stringify(node.parentKeys)}+${JSON.stringify(node.key)}+${JSON.stringify(requestProps.hierarchyLevelSizeLimit)}` : "";
    const variationKey = requestProps.instanceFilter ? JSON.stringify(requestProps.instanceFilter) : undefined;
    return { primaryKey, variationKey };
  }

  public add(requestProps: GetHierarchyNodesProps, value: ChildNodesObservables) {
    const { primaryKey, variationKey } = this.parseRequestProps(requestProps);
    let entry = this._map.get(primaryKey);
    if (!entry) {
      entry = { primary: undefined, variations: new LRUMap(5) };
      this._map.set(primaryKey, entry);
    }
    if (variationKey) {
      entry.variations.set(variationKey, value);
    } else {
      assert(!entry.primary);
      entry.primary = value;
    }
  }

  public get(requestProps: GetHierarchyNodesProps): ChildNodesObservables | undefined {
    const { primaryKey, variationKey } = this.parseRequestProps(requestProps);
    const entry = this._map.get(primaryKey);
    if (variationKey) {
      return entry?.variations.get(variationKey);
    }
    return entry?.primary;
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

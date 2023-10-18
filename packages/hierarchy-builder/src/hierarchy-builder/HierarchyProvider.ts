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
import { HierarchyNodesDefinition, IHierarchyLevelDefinitionsFactory } from "./HierarchyDefinition";
import { HierarchyNode, HierarchyNodeIdentifiersPath, ParsedHierarchyNode, ProcessedHierarchyNode } from "./HierarchyNode";
import { LOGGING_NAMESPACE as CommonLoggingNamespace, DirectNodesCache, getClass } from "./internal/Common";
import { FilteringHierarchyLevelDefinitionsFactory } from "./internal/FilteringHierarchyLevelDefinitionsFactory";
import { createClassGroupingOperator } from "./internal/operators/ClassGrouping";
import { createDetermineChildrenOperator } from "./internal/operators/DetermineChildren";
import { createHideIfNoChildrenOperator } from "./internal/operators/HideIfNoChildren";
import { createHideNodesInHierarchyOperator } from "./internal/operators/HideNodesInHierarchy";
import { createLabelGroupingOperator } from "./internal/operators/LabelGrouping";
import { createMergeInstanceNodesByLabelOperator } from "./internal/operators/MergeInstanceNodesByLabel";
import { createPersistChildrenOperator } from "./internal/operators/PersistChildren";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting";
import { QueryScheduler } from "./internal/QueryScheduler";
import { applyLimit, RowsLimitExceededError, TreeQueryResultsReader } from "./internal/TreeNodesReader";
import { getLogger } from "./Logging";
import { IMetadataProvider } from "./Metadata";
import { IECSqlQueryExecutor } from "./queries/ECSql";
import { ConcatenatedValue, ConcatenatedValuePart } from "./values/ConcatenatedValue";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "./values/Formatting";
import { TypedPrimitiveValue } from "./values/Values";

/** @internal */
export const LOGGING_NAMESPACE = `${CommonLoggingNamespace}.HierarchyProvider`;

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
  private _directNodesCache: DirectNodesCache;

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
    this._directNodesCache = new DirectNodesCache();
  }

  private loadDirectNodes(parentNode: HierarchyNode | undefined): Observable<ProcessedHierarchyNode> {
    // stream hierarchy level definitions in order
    const definitions = from(this._hierarchyFactory.defineHierarchyLevel(parentNode)).pipe(
      concatMap((hierarchyLevelDefinition) => from(hierarchyLevelDefinition)),
    );
    // pipe definitions to nodes
    return definitions.pipe(
      concatMap((def): ObservableInput<ParsedHierarchyNode[]> => {
        if (HierarchyNodesDefinition.isCustomNode(def)) {
          return of([def.node]);
        }
        return this._scheduler.scheduleSubscription(
          of(def.query).pipe(
            log((query) => `Query direct nodes for parent ${parentNode ? JSON.stringify(parentNode) : "<root>"}: ${query.ecsql}`),
            mergeMap((query) => from(this._queryReader.read(this._queryExecutor, { ...query, ecsql: applyLimit({ ...query }) }))),
          ),
        );
      }),
      concatAll(),
      concatMap(async (node) => applyLabelsFormatting(node, this._metadataProvider, this._valuesFormatter)),
      shareReplay(),
    );
  }

  private ensureDirectChildren(parentNode: HierarchyNode | undefined): Observable<ProcessedHierarchyNode> {
    const cached = this._directNodesCache.get(parentNode);
    if (cached) {
      doLog("EnsureDirectChildren", `Found direct nodes observable for ${parentNode ? parentNode.label : "<root>"}`);
      return cached;
    }

    const obs = this.loadDirectNodes(parentNode);
    this._directNodesCache.set(parentNode, obs);
    doLog("EnsureDirectChildren", `Saved direct nodes observable for ${parentNode ? parentNode.label : "<root>"}`);
    return obs;
  }

  private getNodesObservable(parentNode: HierarchyNode | undefined): Observable<ProcessedHierarchyNode> {
    if (parentNode && Array.isArray(parentNode.children)) {
      return from(parentNode.children as ProcessedHierarchyNode[]);
    }

    const directChildren = this.ensureDirectChildren(parentNode);
    const result = directChildren.pipe(
      preProcessNodes(this._hierarchyFactory),
      createHideIfNoChildrenOperator((n) => this.hasNodesObservable(n), false),
      createHideNodesInHierarchyOperator((n) => this.getNodesObservable(n), this._directNodesCache, false),
      createMergeInstanceNodesByLabelOperator(this._directNodesCache),
      sortNodesByLabelOperator,
      createClassGroupingOperator(this._metadataProvider),
      createLabelGroupingOperator(),
    );
    return parentNode ? result.pipe(createPersistChildrenOperator(parentNode)) : result;
  }

  public async getNodes(parentNode: HierarchyNode | undefined): Promise<HierarchyNode[]> {
    return new Promise((resolve, reject) => {
      const nodes = new Array<HierarchyNode>();
      this.getNodesObservable(parentNode)
        // finalize before returning
        .pipe(
          createDetermineChildrenOperator((n) => this.hasNodesObservable(n)),
          postProcessNodes(this._hierarchyFactory),
        )
        // load all nodes into the array and resolve
        .subscribe({
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

  private hasNodesObservable(node: HierarchyNode): Observable<boolean> {
    const directChildren = this.ensureDirectChildren(node);
    return directChildren
      .pipe(preProcessNodes(this._hierarchyFactory))
      .pipe(
        createHideIfNoChildrenOperator((n) => this.hasNodesObservable(n), true),
        createHideNodesInHierarchyOperator((n) => this.getNodesObservable(n), this._directNodesCache, true),
      )
      .pipe(
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
}

const QUERY_CONCURRENCY = 10;

function preProcessNodes(hierarchyFactory: IHierarchyLevelDefinitionsFactory) {
  return hierarchyFactory.preProcessNode ? processNodes(hierarchyFactory.preProcessNode) : noopNodesProcessor;
}

function postProcessNodes(hierarchyFactory: IHierarchyLevelDefinitionsFactory) {
  return hierarchyFactory.postProcessNode ? processNodes(hierarchyFactory.postProcessNode) : noopNodesProcessor;
}

const noopNodesProcessor = (nodes: Observable<ProcessedHierarchyNode>) => nodes;

function processNodes(processor: (node: ProcessedHierarchyNode) => Promise<ProcessedHierarchyNode | undefined>) {
  return (nodes: Observable<ProcessedHierarchyNode>) =>
    nodes.pipe(
      concatMap(processor),
      filter((n): n is ProcessedHierarchyNode => !!n),
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

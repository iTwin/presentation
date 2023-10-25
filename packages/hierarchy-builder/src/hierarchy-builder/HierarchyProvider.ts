/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { catchError, concatAll, concatMap, defaultIfEmpty, filter, from, map, mergeMap, Observable, ObservableInput, of, shareReplay, take, tap } from "rxjs";
import { HierarchyNodesDefinition, IHierarchyLevelDefinitionsFactory } from "./HierarchyDefinition";
import { HierarchyNode, HierarchyNodeIdentifiersPath, ParsedHierarchyNode } from "./HierarchyNode";
import { getClass } from "./internal/Common";
import { FilteringHierarchyLevelDefinitionsFactory } from "./internal/FilteringHierarchyLevelDefinitionsFactory";
import { createDetermineChildrenOperator } from "./internal/operators/DetermineChildren";
import { createGroupingOperator } from "./internal/operators/Grouping";
import { createHideIfNoChildrenOperator } from "./internal/operators/HideIfNoChildren";
import { createHideNodesInHierarchyOperator } from "./internal/operators/HideNodesInHierarchy";
import { createMergeInstanceNodesByLabelOperator } from "./internal/operators/MergeInstanceNodesByLabel";
import { createPersistChildrenOperator } from "./internal/operators/PersistChildren";
import { sortNodesByLabelOperator } from "./internal/operators/Sorting";
import { QueryScheduler } from "./internal/QueryScheduler";
import { applyLimit, TreeQueryResultsReader } from "./internal/TreeNodesReader";
import { IMetadataProvider } from "./Metadata";
import { IECSqlQueryExecutor } from "./queries/ECSql";
import { ConcatenatedValue, ConcatenatedValuePart } from "./values/ConcatenatedValue";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "./values/Formatting";
import { TypedPrimitiveValue } from "./values/Values";

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
  private _directNodesCache: Map<string, Observable<HierarchyNode>>;

  public constructor(props: HierarchyProviderProps) {
    this._metadataProvider = props.metadataProvider;
    if (props.filtering) {
      const filteringDefinition = new FilteringHierarchyLevelDefinitionsFactory({
        metadataProvider: this._metadataProvider,
        source: props.hierarchyDefinition,
        nodeIdentifierPaths: props.filtering.paths,
      });
      this._hierarchyFactory = filteringDefinition;
      this._queryReader = TreeQueryResultsReader.create(filteringDefinition.parseNode);
    } else {
      this._hierarchyFactory = props.hierarchyDefinition;
      this._queryReader = TreeQueryResultsReader.create();
    }
    this._queryExecutor = props.queryExecutor;
    this._valuesFormatter = props?.formatter ?? createDefaultValueFormatter();
    this._scheduler = new QueryScheduler();
    this._directNodesCache = new Map();
  }

  private loadDirectNodes(parentNode: HierarchyNode | undefined): Observable<HierarchyNode> {
    const enableLogging = false;
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
            tap(() => enableLogging && console.log(`[loadDirectNodes] Do query for ${parentNode ? JSON.stringify(parentNode) : "<root>"}`)),
            mergeMap((query) => from(this._queryReader.read(this._queryExecutor, { ...query, ecsql: applyLimit(query.ecsql, query.ctes) }))),
          ),
        );
      }),
      concatAll(),
      concatMap(async (node) => applyLabelsFormatting(node, this._metadataProvider, this._valuesFormatter)),
      shareReplay(),
    );
  }

  private ensureDirectChildren(parentNode: HierarchyNode | undefined): Observable<HierarchyNode> {
    const enableLogging = false;
    const key = parentNode ? `${JSON.stringify(parentNode.key)}+${JSON.stringify(parentNode.extendedData)}` : "";

    const cached = this._directNodesCache.get(key);
    if (cached) {
      enableLogging && console.log(`[ensureDirectChildren] Found direct nodes observable for ${parentNode ? parentNode.label : "<root>"}`);
      return cached;
    }

    const obs = this.loadDirectNodes(parentNode);
    this._directNodesCache.set(key, obs);
    enableLogging && console.log(`[ensureDirectChildren] Saved direct nodes observable for ${parentNode ? parentNode.label : "<root>"}`);
    return obs;
  }

  private getNodesObservable(parentNode: HierarchyNode | undefined): Observable<HierarchyNode> {
    if (parentNode && Array.isArray(parentNode.children)) {
      return from(parentNode.children);
    }

    const directChildren = this.ensureDirectChildren(parentNode);
    const result = directChildren.pipe(
      preProcessNodes(this._hierarchyFactory),
      createMergeInstanceNodesByLabelOperator(this._directNodesCache),
      createHideIfNoChildrenOperator((n) => this.hasNodesObservable(n), false),
      createHideNodesInHierarchyOperator((n) => this.getNodesObservable(n), this._directNodesCache, false),
      sortNodesByLabelOperator,
      createGroupingOperator(this._metadataProvider),
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
          map((n) => (this._hierarchyFactory.postProcessNode ? this._hierarchyFactory.postProcessNode(n) : n)),
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
    const enableLogging = false;
    if (Array.isArray(node.children)) {
      return of(node.children.length > 0);
    }

    const directChildren = this.ensureDirectChildren(node);
    return directChildren
      .pipe(
        tap((n) => enableLogging && console.log(`HasNodes: partial node before preprocessing: ${JSON.stringify(n)}`)),
        preProcessNodes(this._hierarchyFactory),
      )
      .pipe(
        tap((n) => enableLogging && console.log(`HasNodes: partial node before HideIfNoChildrenOperator: ${JSON.stringify(n)}`)),
        createHideIfNoChildrenOperator((n) => this.hasNodesObservable(n), true),
        tap((n) => enableLogging && console.log(`HasNodes: partial node before HideNodesInHierarchyOperator: ${JSON.stringify(n)}`)),
        createHideNodesInHierarchyOperator((n) => this.getNodesObservable(n), this._directNodesCache, true),
      )
      .pipe(
        tap((n) => enableLogging && console.log(`HasNodes: partial node before mapping to 'true': ${JSON.stringify(n)}`)),
        map(() => true),
        take(1),
        defaultIfEmpty(false),
        catchError((e: Error) => {
          enableLogging && console.log(`HasNodes: error while determining children: ${e.message}`);
          if (e.message === "rows limit exceeded") {
            return of(true);
          }
          throw e;
        }),
        tap((r) => enableLogging && console.log(`HasNodes: result: ${r}`)),
      );
  }
}

function preProcessNodes(hierarchyFactory: IHierarchyLevelDefinitionsFactory) {
  return (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> => {
    return nodes.pipe(
      concatMap(async (n) => (hierarchyFactory.preProcessNode ? hierarchyFactory.preProcessNode(n) : n)),
      filter((n): n is HierarchyNode => !!n),
    );
  };
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

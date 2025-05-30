/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Tree
 */

import "../common/DisposePolyfill.js";
import { DelayLoadedTreeNodeItem, PageOptions, PropertyFilterRuleGroupOperator, TreeNodeItem } from "@itwin/components-react";
import { Logger } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import {
  BaseNodeKey,
  ClassInfo,
  ClientDiagnosticsOptions,
  FilterByTextHierarchyRequestOptions,
  HierarchyRequestOptions,
  InstanceFilterDefinition,
  Node,
  NodeKey,
  NodePathElement,
  Paged,
  PresentationError,
  PresentationStatus,
  RequestOptionsWithRuleset,
  Ruleset,
} from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { createDiagnosticsOptions, DiagnosticsProps } from "../common/Diagnostics.js";
import { getRulesetId, memoize, translate } from "../common/Utils.js";
import { PresentationComponentsLoggerCategory } from "../ComponentsLoggerCategory.js";
import { createInstanceFilterDefinition, PresentationInstanceFilterInfo } from "../instance-filter-builder/PresentationFilterBuilder.js";
import { PresentationInstanceFilter } from "../instance-filter-builder/PresentationInstanceFilter.js";
import { IPresentationTreeDataProvider } from "./IPresentationTreeDataProvider.js";
import { InfoTreeNodeItemType, isPresentationTreeNodeItem, PresentationTreeNodeItem } from "./PresentationTreeNodeItem.js";
import { createInfoNode, createTreeNodeItem, pageOptionsUiToPresentation } from "./Utils.js";

/**
 * Properties for creating a `PresentationTreeDataProvider` instance.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface PresentationTreeDataProviderProps extends DiagnosticsProps {
  /** IModel to pull data from. */
  imodel: IModelConnection;

  /** Id of the ruleset to use when requesting content or a ruleset itself. */
  ruleset: string | Ruleset;

  /**
   * Paging size for obtaining nodes.
   *
   * Presentation data providers, when used with paging, have ability to save one backend request for size / count. That
   * can only be achieved when `pagingSize` property is set on the data provider and it's value matches size which is used when
   * requesting nodes. To help developers notice this problem, data provider emits a warning similar to this:
   * ```
   * PresentationTreeDataProvider.pagingSize doesn't match pageOptions in PresentationTreeDataProvider.getNodes call. Make sure you set PresentationTreeDataProvider.pagingSize to avoid excessive backend requests.
   * ```
   * To fix the issue, developers should make sure the page size used for requesting data is also set for the data provider:
   * ```TS
   * const pagingSize = 10;
   * const provider = new TreeDataProvider({imodel, ruleset, pagingSize});
   * // only one backend request is made for the two following requests:
   * provider.getNodesCount();
   * provider.getNodes({ start: 0, size: pagingSize });
   * ```
   */
  pagingSize?: number;

  /**
   * The limit for how many ECInstances should be loaded for a single hierarchy level. If the limit is exceeded, the data
   * provider returns a single `PresentationInfoTreeNodeItem` asking the user to apply filtering to reduce the size of the
   * hierarchy level.
   *
   * Specifying the limit is useful when creating unlimited size result sets is not meaningful - this allows the library
   * to return early as soon as the limit is reached, instead of creating a very large result that's possibly too large to
   * be useful to be displayed to end users.
   *
   * **Warning:** The data provider has no way of knowing whether hierarchy level filtering is enabled at the component
   * level - API consumers, when using this attribute, should make sure to enable filtering or otherwise large hierarchy levels
   * will become impossible to filter-down.
   *
   * @see [Hierarchies' filtering and limiting]($docs/presentation/hierarchies/FilteringLimiting.md)
   * @note Requires `@itwin/presentation-frontend` peer dependency to be at least `4.0`, otherwise has no effect.
   */
  hierarchyLevelSizeLimit?: number;

  /** Should grouping nodes have a suffix with grouped nodes count. Defaults to `false`. */
  appendChildrenCountForGroupingNodes?: boolean;

  /**
   * Callback which provides a way to customize how data is mapped between [Node]($presentation-common) and [TreeNodeItem]($components-react).
   */
  customizeTreeNodeItem?: (item: Partial<DelayLoadedTreeNodeItem>, node: Partial<Node>) => void;

  /**
   * By default the provider uses [PresentationManager]($presentation-frontend) accessed through `Presentation.presentation` to request
   * node counts, nodes and filter them. The overrides allow swapping some or all of the data source entry points thus
   * making the provider request data from custom sources.
   */
  dataSourceOverrides?: Partial<PresentationTreeDataProviderDataSourceEntryPoints>;

  /**
   * Callback for when the hierarchy limit is exceeded while loading nodes.
   */
  onHierarchyLimitExceeded?: () => void;
}

/**
 * Definitions of methods used by [[PresentationTreeDataProvider]] to get nodes' data.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface PresentationTreeDataProviderDataSourceEntryPoints {
  /** @deprecated in 4.0 The entry point is not used anymore, it's usage has been replaced by [[getNodesIterator]]. */
  getNodesCount?: (requestOptions: HierarchyRequestOptions<IModelConnection, NodeKey>) => Promise<number>;
  /** @deprecated in 5.2 The entry point is not used anymore, it's usage has been replaced by [[getNodesIterator]]. */
  getNodesAndCount?: (requestOptions: Paged<HierarchyRequestOptions<IModelConnection, NodeKey>>) => Promise<{ nodes: Node[]; count: number }>;
  getNodesIterator: (
    requestOptions: Paged<HierarchyRequestOptions<IModelConnection, NodeKey> & { maxParallelRequests?: number; batchSize?: number }>,
  ) => Promise<{ total: number; items: AsyncIterableIterator<Node> }>;
  getFilteredNodePaths: (requestOptions: FilterByTextHierarchyRequestOptions<IModelConnection>) => Promise<NodePathElement[]>;
}

/**
 * Presentation Rules-driven tree data provider.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export class PresentationTreeDataProvider implements IPresentationTreeDataProvider, Disposable {
  private _unregisterVariablesChangeListener?: () => void;
  private _dataSource: PresentationTreeDataProviderDataSourceEntryPoints;
  private _diagnosticsOptions?: ClientDiagnosticsOptions;
  private _onHierarchyLimitExceeded?: () => void;
  private _props: PresentationTreeDataProviderProps;
  public hierarchyLevelSizeLimit?: number;

  /** Constructor. */
  public constructor(props: PresentationTreeDataProviderProps) {
    this._props = { ...props };
    this._dataSource = {
      getNodesIterator: async (requestOptions) => {
        // we can't just drop support for the `getNodesAndCount` override, so if it's set - need to take data from it
        if (props.dataSourceOverrides?.getNodesAndCount) {
          return createNodesIteratorFromDeprecatedResponse(await props.dataSourceOverrides.getNodesAndCount(requestOptions));
        }

        // the `PresentationManager.getNodesIterator` has only been added to @itwin/presentation-frontend in 4.5.1, and our peerDependency is
        // set to 4.0.0, so we need to check if the method is really there
        if (Presentation.presentation.getNodesIterator) {
          return Presentation.presentation.getNodesIterator(requestOptions);
        }
        return createNodesIteratorFromDeprecatedResponse(await Presentation.presentation.getNodesAndCount(requestOptions));
      },
      getFilteredNodePaths: async (requestOptions: FilterByTextHierarchyRequestOptions<IModelConnection>) =>
        Presentation.presentation.getFilteredNodePaths(requestOptions),
      ...props.dataSourceOverrides,
    };
    this._diagnosticsOptions = createDiagnosticsOptions(props);
    this.hierarchyLevelSizeLimit = props.hierarchyLevelSizeLimit;
    this._onHierarchyLimitExceeded = props.onHierarchyLimitExceeded;
  }

  #dispose() {
    this._unregisterVariablesChangeListener?.();
    this._unregisterVariablesChangeListener = undefined;
  }

  /** Destructor. Must be called to clean up. */
  public [Symbol.dispose]() {
    this.#dispose();
  }

  /** @deprecated in 5.7. Use `[Symbol.dispose]` instead. */
  /* c8 ignore next 3 */
  public dispose() {
    this.#dispose();
  }

  public get props(): Readonly<PresentationTreeDataProviderProps> {
    return this._props;
  }

  /** Id of the ruleset used by this data provider */
  public get rulesetId(): string {
    return getRulesetId(this.props.ruleset);
  }

  /** [IModelConnection]($core-frontend) used by this data provider */
  public get imodel(): IModelConnection {
    return this.props.imodel;
  }

  /**
   * Paging options for obtaining nodes.
   * @see `PresentationTreeDataProviderProps.pagingSize`
   */
  public get pagingSize(): number | undefined {
    return this.props.pagingSize;
  }
  public set pagingSize(value: number | undefined) {
    this._props.pagingSize = value;
  }

  /** Called to get base options for requests */
  private createBaseRequestOptions(): RequestOptionsWithRuleset<IModelConnection> {
    return {
      imodel: this.props.imodel,
      rulesetOrId: this.props.ruleset,
      ...(this._diagnosticsOptions ? { diagnostics: this._diagnosticsOptions } : undefined),
    };
  }

  /** Called to get options for node requests */
  private createPagedRequestOptions(parentKey: NodeKey | undefined, pageOptions?: PageOptions, instanceFilter?: InstanceFilterDefinition) {
    const isPaging = pageOptions && (pageOptions.start || pageOptions.size !== undefined);
    return {
      ...this.createRequestOptions(parentKey, instanceFilter),
      ...(isPaging ? { paging: pageOptionsUiToPresentation(pageOptions) } : undefined),
    };
  }

  /** Creates options for nodes requests. */
  public createRequestOptions(parentKey: NodeKey | undefined, instanceFilter?: InstanceFilterDefinition) {
    const isHierarchyLevelLimitingSupported = !!this.hierarchyLevelSizeLimit && parentKey;
    return {
      ...this.createBaseRequestOptions(),
      ...(parentKey ? { parentKey } : undefined),
      ...(isHierarchyLevelLimitingSupported ? { sizeLimit: this.hierarchyLevelSizeLimit } : undefined),
      ...(instanceFilter ? { instanceFilter } : undefined),
    };
  }

  /**
   * Returns a [NodeKey]($presentation-common) from given [TreeNodeItem]($components-react).
   *
   * **Warning**: Returns invalid [NodeKey]($presentation-common) if `node` is not a [[PresentationTreeNodeItem]].
   *
   * @deprecated in 4.0. Use [[isPresentationTreeNodeItem]] and [[PresentationTreeNodeItem.key]] to get [NodeKey]($presentation-common).
   */
  public getNodeKey(node: TreeNodeItem): NodeKey {
    const invalidKey: BaseNodeKey = { type: "", pathFromRoot: [], version: 0 };
    return isPresentationTreeNodeItem(node) ? node.key : invalidKey;
  }

  /**
   * Returns nodes
   * @param parentNode The parent node to return children for.
   * @param pageOptions Information about the requested page of data.
   */
  public async getNodes(parentNode?: TreeNodeItem, pageOptions?: PageOptions): Promise<DelayLoadedTreeNodeItem[]> {
    if (undefined !== pageOptions && pageOptions.size !== this.pagingSize) {
      const msg = `PresentationTreeDataProvider.pagingSize doesn't match pageOptions in PresentationTreeDataProvider.getNodes call.
        Make sure you set PresentationTreeDataProvider.pagingSize to avoid excessive backend requests.`;
      Logger.logWarning(PresentationComponentsLoggerCategory.Hierarchy, msg);
    }
    const instanceFilter = await getFilterDefinition(this.imodel, parentNode);
    return (await this._getNodesAndCount(parentNode, pageOptions, instanceFilter)).nodes;
  }

  /**
   * Returns the total number of nodes
   * @param parentNode The parent node to return children count for.
   */
  public async getNodesCount(parentNode?: TreeNodeItem): Promise<number> {
    const instanceFilter = await getFilterDefinition(this.imodel, parentNode);
    return (await this._getNodesAndCount(parentNode, { start: 0, size: this.pagingSize }, instanceFilter)).count;
  }

  private _getNodesAndCount = memoize(
    async (
      parentNode?: TreeNodeItem,
      pageOptions?: PageOptions,
      instanceFilter?: InstanceFilterDefinition,
    ): Promise<{ nodes: TreeNodeItem[]; count: number }> => {
      this.setupRulesetVariablesListener();
      const parentKey = parentNode && isPresentationTreeNodeItem(parentNode) ? parentNode.key : undefined;
      const requestOptions = this.createPagedRequestOptions(parentKey, pageOptions, instanceFilter);
      return createNodesAndCountResult(
        async () => this._dataSource.getNodesIterator(requestOptions),
        this.createBaseRequestOptions(),
        (node, parentId) => createTreeNodeItem(node, parentId, this.props),
        parentNode,
        this.hierarchyLevelSizeLimit,
        this._onHierarchyLimitExceeded,
      );
    },
    // eslint-disable-next-line @typescript-eslint/unbound-method
    { isMatchingKey: MemoizationHelpers.areNodesRequestsEqual as any },
  );

  /**
   * Returns filtered node paths.
   * @param filter Filter.
   */
  public async getFilteredNodePaths(filter: string): Promise<NodePathElement[]> {
    return this._dataSource.getFilteredNodePaths({
      ...this.createBaseRequestOptions(),
      filterText: filter,
    });
  }

  private setupRulesetVariablesListener() {
    if (this._unregisterVariablesChangeListener) {
      return;
    }
    this._unregisterVariablesChangeListener = Presentation.presentation.vars(getRulesetId(this.props.ruleset)).onVariableChanged.addListener(() => {
      this._getNodesAndCount.cache.values.length = 0;
      this._getNodesAndCount.cache.keys.length = 0;
    });
  }
}

async function getFilterDefinition(imodel: IModelConnection, node?: TreeNodeItem) {
  if (!node || !isPresentationTreeNodeItem(node) || !node.filtering) {
    return undefined;
  }

  // combine ancestors and current filters
  const allFilters: PresentationInstanceFilterInfo[] = [...node.filtering.ancestorFilters, ...(node.filtering.active ? [node.filtering.active] : [])];

  if (allFilters.length === 0) {
    return undefined;
  }

  if (allFilters.length === 1) {
    return createInstanceFilterDefinition(allFilters[0], imodel);
  }

  const appliedFilters = allFilters.map((filterInfo) => filterInfo.filter).filter((filter): filter is PresentationInstanceFilter => filter !== undefined);
  const usedClasses = getConcatenatedDistinctClassInfos(allFilters);

  // if there are more than one filter applied, combine them using `AND` operator
  // otherwise apply filter directly
  const info: PresentationInstanceFilterInfo = {
    filter:
      appliedFilters.length > 0
        ? {
            operator: PropertyFilterRuleGroupOperator.And,
            conditions: appliedFilters,
          }
        : undefined,
    usedClasses,
  };

  return createInstanceFilterDefinition(info, imodel);
}

function getConcatenatedDistinctClassInfos(appliedFilters: PresentationInstanceFilterInfo[]) {
  const concatenatedClassInfos = appliedFilters.reduce((accumulator, value) => [...accumulator, ...value.usedClasses], [] as ClassInfo[]);
  return [...new Map(concatenatedClassInfos.map((item) => [item.id, item])).values()];
}

async function createNodesAndCountResult(
  resultFactory: () => Promise<{ items: AsyncIterableIterator<Node>; total: number }>,
  baseOptions: RequestOptionsWithRuleset<IModelConnection>,
  treeItemFactory: (node: Node, parentId?: string) => PresentationTreeNodeItem,
  parentNode?: TreeNodeItem,
  hierarchyLevelSizeLimit?: number,
  onHierarchyLimitExceeded?: () => void,
) {
  try {
    const result = await resultFactory();
    const { items, total: count } = result;
    const isParentFiltered = parentNode && isPresentationTreeNodeItem(parentNode) && parentNode.filtering?.active;
    if (count === 0 && isParentFiltered) {
      return createStatusNodeResult(parentNode, "tree.no-filtered-children", InfoTreeNodeItemType.NoChildren);
    }
    return { nodes: await createTreeItems(items, baseOptions, treeItemFactory, parentNode), count };
  } catch (e) {
    if (e instanceof Error) {
      if (hasErrorNumber(e)) {
        switch (e.errorNumber) {
          case PresentationStatus.Canceled:
            return { nodes: [], count: 0 };
          case PresentationStatus.BackendTimeout:
            return createStatusNodeResult(parentNode, "tree.timeout", InfoTreeNodeItemType.BackendTimeout);
          case PresentationStatus.ResultSetTooLarge:
            // ResultSetTooLarge error can't occur if hierarchyLevelSizeLimit is undefined.
            onHierarchyLimitExceeded?.();
            return {
              nodes: [
                createInfoNode(parentNode, `${translate("tree.result-limit-exceeded")} ${hierarchyLevelSizeLimit!}.`, InfoTreeNodeItemType.ResultSetTooLarge),
              ],
              count: 1,
            };
        }
      }

      // eslint-disable-next-line no-console
      console.error(`Error creating nodes: ${e.toString()}`);
    }
    return createStatusNodeResult(parentNode, "tree.unknown-error");
  }
}

function createStatusNodeResult(parentNode: TreeNodeItem | undefined, labelKey: string, type?: InfoTreeNodeItemType) {
  return {
    nodes: [createInfoNode(parentNode, translate(labelKey), type)],
    count: 1,
  };
}

async function createTreeItems(
  nodes: AsyncIterableIterator<Node>,
  baseOptions: RequestOptionsWithRuleset<IModelConnection>,
  treeItemFactory: (node: Node, parentId?: string) => PresentationTreeNodeItem,
  parentNode?: TreeNodeItem,
) {
  const items: PresentationTreeNodeItem[] = [];

  // collect filters for child elements. These filter will be applied for grouping nodes
  // if current node has `ancestorFilters` it means it is grouping node and those filter should be forwarded to child grouping nodes alongside current node filter.
  // if current node does not have `ancestorFilters` it means it is an instance node and only it's filter should be applied to child grouping nodes.
  const ancestorFilters =
    parentNode && isPresentationTreeNodeItem(parentNode) && parentNode.filtering
      ? [...parentNode.filtering.ancestorFilters, ...(parentNode.filtering.active ? [parentNode.filtering.active] : [])]
      : [];

  for await (const node of nodes) {
    const item = treeItemFactory(node, parentNode?.id);
    if (node.supportsFiltering) {
      item.filtering = {
        descriptor: async () => {
          const descriptor = await Presentation.presentation.getNodesDescriptor({ ...baseOptions, parentKey: node.key });
          if (!descriptor) {
            throw new PresentationError(PresentationStatus.Error, `Failed to get descriptor for node - ${node.label.displayValue}`);
          }
          return descriptor;
        },
        ancestorFilters: NodeKey.isGroupingNodeKey(item.key) ? ancestorFilters : [],
      };
    }
    items.push(item);
  }
  return items;
}

class MemoizationHelpers {
  public static areNodesRequestsEqual(
    lhsArgs: [TreeNodeItem?, PageOptions?, InstanceFilterDefinition?],
    rhsArgs: [TreeNodeItem?, PageOptions?, InstanceFilterDefinition?],
  ): boolean {
    if (lhsArgs[0]?.id !== rhsArgs[0]?.id) {
      return false;
    }
    if ((lhsArgs[1]?.start ?? 0) !== (rhsArgs[1]?.start ?? 0)) {
      return false;
    }
    if ((lhsArgs[1]?.size ?? 0) !== (rhsArgs[1]?.size ?? 0)) {
      return false;
    }
    if (lhsArgs[2]?.expression !== rhsArgs[2]?.expression) {
      return false;
    }
    return true;
  }
}

function createNodesIteratorFromDeprecatedResponse({ count, nodes }: { count: number; nodes: Node[] }): { total: number; items: AsyncIterableIterator<Node> } {
  return {
    total: count,
    items: (async function* () {
      for (const node of nodes) {
        yield node;
      }
    })(),
  };
}

function hasErrorNumber(e: Error): e is Error & { errorNumber: number } {
  return "errorNumber" in e && e.errorNumber !== undefined;
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */
import memoize from "micro-memoize";
import { DelayLoadedTreeNodeItem, PageOptions, PropertyFilterRuleGroupOperator, TreeNodeItem } from "@itwin/components-react";
import { IDisposable, Logger } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import {
  BaseNodeKey, ClassInfo, ClientDiagnosticsOptions, FilterByTextHierarchyRequestOptions, HierarchyRequestOptions, InstanceFilterDefinition, Node,
  NodeKey, NodePathElement, Paged, PresentationError, PresentationStatus, RequestOptionsWithRuleset, Ruleset,
} from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { createDiagnosticsOptions, DiagnosticsProps } from "../common/Diagnostics";
import { getRulesetId, RulesetOrId, translate } from "../common/Utils";
import { PresentationComponentsLoggerCategory } from "../ComponentsLoggerCategory";
import { PresentationInstanceFilter, PresentationInstanceFilterInfo } from "../instance-filter-builder/PresentationFilterBuilder";
import { IPresentationTreeDataProvider } from "./IPresentationTreeDataProvider";
import { InfoTreeNodeItemType, isPresentationTreeNodeItem, PresentationTreeNodeItem } from "./PresentationTreeNodeItem";
import { createInfoNode, createTreeNodeItem, CreateTreeNodeItemProps, pageOptionsUiToPresentation } from "./Utils";

/**
 * Properties for creating a `PresentationTreeDataProvider` instance.
 * @public
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
   * @beta
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
   * @beta
   */
  dataSourceOverrides?: Partial<PresentationTreeDataProviderDataSourceEntryPoints>;
}

/**
 * Definitions of methods used by [[PresentationTreeDataProvider]] to get nodes' data.
 * @beta
 */
export interface PresentationTreeDataProviderDataSourceEntryPoints {
  /** @deprecated in 4.0 The entry point is not used anymore, it's usage has been replaced by [[getNodesAndCount]]. */
  getNodesCount?: (requestOptions: HierarchyRequestOptions<IModelConnection, NodeKey>) => Promise<number>;
  getNodesAndCount: (requestOptions: Paged<HierarchyRequestOptions<IModelConnection, NodeKey>>) => Promise<{ nodes: Node[]; count: number }>;
  getFilteredNodePaths: (requestOptions: FilterByTextHierarchyRequestOptions<IModelConnection>) => Promise<NodePathElement[]>;
}

/**
 * Presentation Rules-driven tree data provider.
 * @public
 */
export class PresentationTreeDataProvider implements IPresentationTreeDataProvider, IDisposable {
  private _imodel: IModelConnection;
  private _ruleset: RulesetOrId;
  private _pagingSize?: number;
  private _disposeVariablesChangeListener?: () => void;
  private _dataSource: PresentationTreeDataProviderDataSourceEntryPoints;
  private _diagnosticsOptions?: ClientDiagnosticsOptions;
  private _nodesCreateProps: CreateTreeNodeItemProps;
  public hierarchyLevelSizeLimit?: number;

  /** Constructor. */
  public constructor(props: PresentationTreeDataProviderProps) {
    this._ruleset = props.ruleset;
    this._imodel = props.imodel;
    this._pagingSize = props.pagingSize;
    this._nodesCreateProps = {
      appendChildrenCountForGroupingNodes: props.appendChildrenCountForGroupingNodes,
      customizeTreeNodeItem: props.customizeTreeNodeItem,
    };

    this._dataSource = {
      getNodesAndCount: async (requestOptions: Paged<HierarchyRequestOptions<IModelConnection, NodeKey>>) =>
        Presentation.presentation.getNodesAndCount(requestOptions),
      getFilteredNodePaths: async (requestOptions: FilterByTextHierarchyRequestOptions<IModelConnection>) =>
        Presentation.presentation.getFilteredNodePaths(requestOptions),
      ...props.dataSourceOverrides,
    };
    this._diagnosticsOptions = createDiagnosticsOptions(props);
    this.hierarchyLevelSizeLimit = props.hierarchyLevelSizeLimit;
  }

  /** Destructor. Must be called to clean up.  */
  public dispose() {
    if (this._disposeVariablesChangeListener) {
      this._disposeVariablesChangeListener();
      this._disposeVariablesChangeListener = undefined;
    }
  }

  /** Id of the ruleset used by this data provider */
  public get rulesetId(): string {
    return getRulesetId(this._ruleset);
  }

  /** [IModelConnection]($core-frontend) used by this data provider */
  public get imodel(): IModelConnection {
    return this._imodel;
  }

  /**
   * Paging options for obtaining nodes.
   * @see `PresentationTreeDataProviderProps.pagingSize`
   */
  public get pagingSize(): number | undefined {
    return this._pagingSize;
  }
  public set pagingSize(value: number | undefined) {
    this._pagingSize = value;
  }

  /** Called to get base options for requests */
  private createBaseRequestOptions(): RequestOptionsWithRuleset<IModelConnection> {
    return {
      imodel: this._imodel,
      rulesetOrId: this._ruleset,
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
        async () => this._dataSource.getNodesAndCount(requestOptions),
        this.createBaseRequestOptions(),
        (node, parentId) => this.createTreeNodeItem(node, parentId),
        parentNode,
        this.hierarchyLevelSizeLimit,
      );
    },
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

  /**
   * Creates tree node item from supplied [[Node]].
   * @internal
   */
  public createTreeNodeItem(node: Node, parentId?: string) {
    return createTreeNodeItem(node, parentId, this._nodesCreateProps);
  }

  private setupRulesetVariablesListener() {
    if (this._disposeVariablesChangeListener) {
      return;
    }
    this._disposeVariablesChangeListener = Presentation.presentation.vars(getRulesetId(this._ruleset)).onVariableChanged.addListener(() => {
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
  const appliedFilters: PresentationInstanceFilterInfo[] = [...node.filtering.ancestorFilters, ...(node.filtering.active ? [node.filtering.active] : [])];

  if (appliedFilters.length === 0) {
    return undefined;
  }

  // if there are more than one filter applied, combine them using `AND` operator
  // otherwise apply filter directly
  const filter: PresentationInstanceFilterInfo =
    appliedFilters.length > 1
      ? {
          filter: {
            operator: PropertyFilterRuleGroupOperator.And,
            conditions: appliedFilters.map((ancestorFilter) => ancestorFilter.filter),
          },
          usedClasses: getConcatenatedDistinctClassInfos(appliedFilters),
        }
      : appliedFilters[0];

  return PresentationInstanceFilter.toInstanceFilterDefinition(filter.filter, imodel, filter.usedClasses);
}

function getConcatenatedDistinctClassInfos(appliedFilters: PresentationInstanceFilterInfo[]) {
  const concatenatedClassInfos = appliedFilters.reduce((accumulator, value) => [...accumulator, ...value.usedClasses], [] as ClassInfo[]);
  return [...new Map(concatenatedClassInfos.map((item) => [item.id, item])).values()];
}

async function createNodesAndCountResult(
  resultFactory: () => Promise<{ nodes: Node[]; count: number }>,
  baseOptions: RequestOptionsWithRuleset<IModelConnection>,
  treeItemFactory: (node: Node, parentId?: string) => PresentationTreeNodeItem,
  parentNode?: TreeNodeItem,
  hierarchyLevelSizeLimit?: number,
) {
  try {
    const result = await resultFactory();
    const { nodes, count } = result;
    const isParentFiltered = parentNode && isPresentationTreeNodeItem(parentNode) && parentNode.filtering?.active;
    if (nodes.length === 0 && isParentFiltered) {
      return createStatusNodeResult(parentNode, "tree.no-filtered-children", InfoTreeNodeItemType.NoChildren);
    }
    return { nodes: createTreeItems(nodes, baseOptions, treeItemFactory, parentNode), count };
  } catch (e) {
    if (e instanceof PresentationError) {
      switch (e.errorNumber) {
        case PresentationStatus.Canceled:
          return { nodes: [], count: 0 };
        case PresentationStatus.BackendTimeout:
          return createStatusNodeResult(parentNode, "tree.timeout", InfoTreeNodeItemType.BackendTimeout);
        case PresentationStatus.ResultSetTooLarge:
          // ResultSetTooLarge error can't occur if hierarchyLevelSizeLimit is undefined.
          return {
            nodes: [
              createInfoNode(parentNode, `${translate("tree.result-limit-exceeded")} ${hierarchyLevelSizeLimit!}.`, InfoTreeNodeItemType.ResultSetTooLarge),
            ],
            count: 1,
          };
      }
    }
    // istanbul ignore else
    if (e instanceof Error) {
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

function createTreeItems(
  nodes: Node[],
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

  for (const node of nodes) {
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

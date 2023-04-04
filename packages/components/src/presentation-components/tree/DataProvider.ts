/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import memoize from "micro-memoize";
import { PropertyRecord } from "@itwin/appui-abstract";
import { DelayLoadedTreeNodeItem, PageOptions, TreeNodeItem } from "@itwin/components-react";
import { IDisposable, Logger } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import {
  BaseNodeKey, ClientDiagnosticsOptions, FilterByTextHierarchyRequestOptions, HierarchyRequestOptions, InstanceFilterDefinition, Node, NodeKey,
  NodePathElement, Paged, PresentationError, PresentationStatus, RequestOptionsWithRuleset, Ruleset,
} from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { createDiagnosticsOptions, DiagnosticsProps } from "../common/Diagnostics";
import { RulesetRegistrationHelper } from "../common/RulesetRegistrationHelper";
import { translate } from "../common/Utils";
import { PresentationComponentsLoggerCategory } from "../ComponentsLoggerCategory";
import { convertToInstanceFilterDefinition } from "../instance-filter-builder/InstanceFilterConverter";
import { IPresentationTreeDataProvider } from "./IPresentationTreeDataProvider";
import { isPresentationTreeNodeItem, PresentationInfoTreeNodeItem, PresentationTreeNodeItem } from "./PresentationTreeNodeItem";
import { createTreeNodeItem, CreateTreeNodeItemProps, pageOptionsUiToPresentation } from "./Utils";

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
  getNodesAndCount: (requestOptions: Paged<HierarchyRequestOptions<IModelConnection, NodeKey>>) => Promise<{ nodes: Node[], count: number }>;
  getFilteredNodePaths: (requestOptions: FilterByTextHierarchyRequestOptions<IModelConnection>) => Promise<NodePathElement[]>;
}

/**
 * Presentation Rules-driven tree data provider.
 * @public
 */
export class PresentationTreeDataProvider implements IPresentationTreeDataProvider, IDisposable {
  private _imodel: IModelConnection;
  private _rulesetRegistration: RulesetRegistrationHelper;
  private _pagingSize?: number;
  private _disposeVariablesChangeListener: () => void;
  private _dataSource: PresentationTreeDataProviderDataSourceEntryPoints;
  private _diagnosticsOptions?: ClientDiagnosticsOptions;
  private _nodesCreateProps: CreateTreeNodeItemProps;
  public hierarchyLevelSizeLimit?: number;

  /** Constructor. */
  public constructor(props: PresentationTreeDataProviderProps) {
    this._rulesetRegistration = new RulesetRegistrationHelper(props.ruleset);
    this._imodel = props.imodel;
    this._pagingSize = props.pagingSize;
    this._nodesCreateProps = {
      appendChildrenCountForGroupingNodes: props.appendChildrenCountForGroupingNodes,
      customizeTreeNodeItem: props.customizeTreeNodeItem,
    };

    this._dataSource = {
      getNodesAndCount: async (requestOptions: Paged<HierarchyRequestOptions<IModelConnection, NodeKey>>) => Presentation.presentation.getNodesAndCount(requestOptions),
      getFilteredNodePaths: async (requestOptions: FilterByTextHierarchyRequestOptions<IModelConnection>) => Presentation.presentation.getFilteredNodePaths(requestOptions),
      ...props.dataSourceOverrides,
    };
    this._disposeVariablesChangeListener = Presentation.presentation.vars(this._rulesetRegistration.rulesetId).onVariableChanged.addListener(() => {
      this._getNodesAndCount.cache.values.length = 0;
      this._getNodesAndCount.cache.keys.length = 0;
    });
    this._diagnosticsOptions = createDiagnosticsOptions(props);
    this.hierarchyLevelSizeLimit = props.hierarchyLevelSizeLimit;
  }

  /** Destructor. Must be called to clean up.  */
  public dispose() {
    this._rulesetRegistration.dispose();
    this._disposeVariablesChangeListener();
  }

  /** Id of the ruleset used by this data provider */
  public get rulesetId(): string { return this._rulesetRegistration.rulesetId; }

  /** [IModelConnection]($core-frontend) used by this data provider */
  public get imodel(): IModelConnection { return this._imodel; }

  /**
   * Paging options for obtaining nodes.
   * @see `PresentationTreeDataProviderProps.pagingSize`
   */
  public get pagingSize(): number | undefined { return this._pagingSize; }
  public set pagingSize(value: number | undefined) { this._pagingSize = value; }

  /** Called to get base options for requests */
  private createBaseRequestOptions(): RequestOptionsWithRuleset<IModelConnection> {
    return {
      imodel: this._imodel,
      rulesetOrId: this._rulesetRegistration.rulesetId,
      ...(this._diagnosticsOptions ? { diagnostics: this._diagnosticsOptions } : undefined),
    };
  }

  /** Called to get options for node requests */
  private createRequestOptions<TNodeKey = NodeKey>(parentKey: TNodeKey | undefined, pageOptions?: PageOptions, instanceFilter?: InstanceFilterDefinition) {
    const isHierarchyLevelLimitingSupported = !!this.hierarchyLevelSizeLimit && parentKey;
    const isPaging = pageOptions && (pageOptions.start || pageOptions.size !== undefined);
    return {
      ...this.createBaseRequestOptions(),
      ...(parentKey ? { parentKey } : undefined),
      ...(isHierarchyLevelLimitingSupported ? { sizeLimit: this.hierarchyLevelSizeLimit } : undefined),
      ...(isPaging ? { paging: pageOptionsUiToPresentation(pageOptions) } : undefined),
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

  private _getNodesAndCount = memoize(async (parentNode?: TreeNodeItem, pageOptions?: PageOptions, instanceFilter?: InstanceFilterDefinition): Promise<{ nodes: TreeNodeItem[], count: number }> => {
    const parentKey = parentNode && isPresentationTreeNodeItem(parentNode) ? parentNode.key : undefined;
    const requestOptions = this.createRequestOptions(parentKey, pageOptions, instanceFilter);
    return createNodesAndCountResult(async () => this._dataSource.getNodesAndCount(requestOptions), this.createBaseRequestOptions(), parentNode, this._nodesCreateProps);
  }, { isMatchingKey: MemoizationHelpers.areNodesRequestsEqual as any });

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
}

async function getFilterDefinition(imodel: IModelConnection, node?: TreeNodeItem) {
  if (!node || !isPresentationTreeNodeItem(node) || !node.filtering?.active)
    return undefined;
  return convertToInstanceFilterDefinition(node.filtering.active.filter, imodel);
}

async function createNodesAndCountResult(
  resultFactory: () => Promise<{ nodes: Node[], count: number }>,
  baseOptions: RequestOptionsWithRuleset<IModelConnection>,
  parentNode?: TreeNodeItem,
  nodesCreateProps?: CreateTreeNodeItemProps
) {
  try {
    const result = await resultFactory();
    const { nodes, count } = result;
    const isParentFiltered = parentNode && isPresentationTreeNodeItem(parentNode) && parentNode.filtering?.active;
    if (nodes.length === 0 && isParentFiltered)
      return createStatusNodeResult(parentNode, "tree.no-filtered-children");
    return { nodes: createTreeItems(nodes, baseOptions, parentNode, nodesCreateProps), count };
  } catch (e) {
    if (e instanceof PresentationError) {
      switch (e.errorNumber) {
        case PresentationStatus.Canceled:
          return { nodes: [], count: 0 };
        case PresentationStatus.BackendTimeout:
          return createStatusNodeResult(parentNode, "tree.timeout");
        case PresentationStatus.ResultSetTooLarge:
          return createStatusNodeResult(parentNode, "tree.result-set-too-large");
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

function createStatusNodeResult(parentNode: TreeNodeItem | undefined, labelKey: string) {
  return {
    nodes: [createInfoNode(parentNode, translate(labelKey))],
    count: 1,
  };
}

function createTreeItems(
  nodes: Node[],
  baseOptions: RequestOptionsWithRuleset<IModelConnection>,
  parentNode?: TreeNodeItem,
  nodesCreateProps?: CreateTreeNodeItemProps
) {
  const items: PresentationTreeNodeItem[] = [];
  for (const node of nodes) {
    const item = createTreeNodeItem(node, parentNode?.id, nodesCreateProps);
    if (node.supportsFiltering) {
      item.filtering = {
        descriptor: async () => {
          const descriptor = await Presentation.presentation.getNodesDescriptor({ ...baseOptions, parentKey: node.key });
          if (!descriptor)
            throw new PresentationError(PresentationStatus.Error, `Failed to get descriptor for node - ${node.label.displayValue}`);
          return descriptor;
        },
      };
    }
    items.push(item);
  }
  return items;
}

function createInfoNode(parentNode: TreeNodeItem | undefined, message: string): PresentationInfoTreeNodeItem {
  const id = parentNode
    ? `${parentNode.id}/info-node`
    : `/info-node/${message}`;
  return {
    id,
    label: PropertyRecord.fromString(message),
    message,
    isSelectionDisabled: true,
    children: undefined,
  };
}

class MemoizationHelpers {
  public static areNodesRequestsEqual(lhsArgs: [TreeNodeItem?, PageOptions?, InstanceFilterDefinition?], rhsArgs: [TreeNodeItem?, PageOptions?, InstanceFilterDefinition?]): boolean {
    if (lhsArgs[0]?.id !== rhsArgs[0]?.id)
      return false;
    if ((lhsArgs[1]?.start ?? 0) !== (rhsArgs[1]?.start ?? 0))
      return false;
    if ((lhsArgs[1]?.size ?? 0) !== (rhsArgs[1]?.size ?? 0))
      return false;
    if (lhsArgs[2]?.expression !== rhsArgs[2]?.expression)
      return false;
    return true;
  }
}

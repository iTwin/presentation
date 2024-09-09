/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createHierarchyProvider,
  GenericInstanceFilter,
  HierarchyDefinition,
  HierarchyNode,
  HierarchyProvider,
  LimitingECSqlQueryExecutor,
} from "@itwin/presentation-hierarchies";
import { ECClassHierarchyInspector, ECSchemaProvider, InstanceKey, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import { TreeActions } from "./internal/TreeActions";
import { isTreeModelHierarchyNode, isTreeModelInfoNode, TreeModel, TreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./internal/TreeModel";
import { useUnifiedTreeSelection, UseUnifiedTreeSelectionProps } from "./internal/UseUnifiedSelection";
import { PresentationHierarchyNode, PresentationTreeNode } from "./TreeNode";
import { SelectionChangeType } from "./UseSelectionHandler";

/**
 * A data structure that contains information about a single hierarchy level.
 * @beta
 */
export interface HierarchyLevelDetails {
  /** The parent node whose hierarchy level's information is contained in this data structure */
  hierarchyNode: HierarchyNode | undefined;

  /** A function to get instance keys of the hierarchy level. */
  getInstanceKeysIterator: (props?: {
    instanceFilter?: GenericInstanceFilter;
    hierarchyLevelSizeLimit?: number | "unbounded";
  }) => AsyncIterableIterator<InstanceKey>;

  /** Get the limit of how many nodes can be loaded in this hierarchy level. */
  sizeLimit?: number | "unbounded";
  /** Set the limit of how many nodes can be loaded in this hierarchy level. */
  setSizeLimit: (value: undefined | number | "unbounded") => void;

  /** Get the active instance filter applied to this hierarchy level. */
  instanceFilter?: GenericInstanceFilter;
  /** Set the instance filter to apply to this hierarchy level */
  setInstanceFilter: (filter: GenericInstanceFilter | undefined) => void;
}

/**
 * A React hook that creates state for a tree component.
 *
 * The hook uses `@itwin/presentation-hierarchies` package to load the hierarchy data and returns a
 * component-agnostic result which may be used to render the hierarchy using any UI framework.
 *
 * See `README.md` for an example
 *
 * @see `useUnifiedSelectionTree`
 * @beta
 */
export function useTree(props: UseTreeProps): UseTreeResult {
  const { getNode: _, ...rest } = useTreeInternal(props);
  return rest;
}

/**
 * A React hook that creates state for a tree component, that is integrated with unified selection
 * through context provided by `UnifiedSelectionProvider`.
 *
 * The hook uses `@itwin/presentation-hierarchies` package to load the hierarchy data and returns a
 * component-agnostic result which may be used to render the hierarchy using any UI framework.
 *
 * See `README.md` for an example
 *
 * @see `useTree`
 * @see `UnifiedSelectionProvider`
 * @beta
 */
export function useUnifiedSelectionTree({ imodelKey, sourceName, ...props }: UseTreeProps & UseUnifiedTreeSelectionProps): UseTreeResult {
  const { getNode, ...rest } = useTreeInternal(props);
  return { ...rest, ...useUnifiedTreeSelection({ imodelKey, sourceName, getNode }) };
}

/** @beta */
type IModelAccess = ECSchemaProvider & LimitingECSqlQueryExecutor & ECClassHierarchyInspector;

/** @beta */
interface GetFilteredPathsProps {
  /** Object that provides access to the iModel schema and can run queries against the iModel. */
  imodelAccess: IModelAccess;
}

/** @beta */
type HierarchyProviderProps = Parameters<typeof createHierarchyProvider>[0];

/** @beta */
type HierarchyFilteringPaths = NonNullable<NonNullable<HierarchyProviderProps["filtering"]>["paths"]>;

/** @beta */
interface UseTreeProps extends Pick<HierarchyProviderProps, "localizedStrings"> {
  /** Object that provides access to the iModel schema and can run queries against the iModel. */
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor & ECClassHierarchyInspector;
  /** Provides the hierarchy definition for the tree. */
  getHierarchyDefinition: (props: { imodelAccess: IModelAccess }) => HierarchyDefinition;
  /** Provides paths to filtered nodes. */
  getFilteredPaths?: (props: GetFilteredPathsProps) => Promise<HierarchyFilteringPaths | undefined>;
  /**
   * Callback that is called just after a certain action is finished.
   * Can be used for performance tracking.
   */
  onPerformanceMeasured?: (action: "initial-load" | "hierarchy-level-load" | "reload", duration: number) => void;
  /** Action to perform when hierarchy level contains more items that the specified limit. */
  onHierarchyLimitExceeded?: (props: { parentId?: string; filter?: GenericInstanceFilter; limit?: number | "unbounded" }) => void;
  /** Action to perform when an error occurs while loading hierarchy. */
  onHierarchyLoadError?: (props: { parentId?: string; type: "timeout" | "unknown" }) => void;
}

/** @beta */
interface ReloadTreeCommonOptions {
  /**
   * Specifies how current tree state should be handled:
   * - `keep` - try to keep current tree state (expanded/collapsed nodes, instance filters, etc.).
   * - `discard` - do not try to keep current tree state. Tree model will be update after nodes are reloaded.
   * - `reset` - remove subtree from the model before reloading and reload nodes ignoring cache.
   *
   * Defaults to `"keep"`.
   */
  state?: "keep" | "discard" | "reset";
}

/**
 * Options for full tree reload.
 * @beta
 */
type FullTreeReloadOptions = {
  /** Specifies that data source changed and caches should be cleared before reloading tree. */
  dataSourceChanged?: true;
} & ReloadTreeCommonOptions;

/**
 * Options for subtree reload.
 * @beta
 */
type SubtreeReloadOptions = {
  /** Specifies parent node under which sub tree should be reloaded. */
  parentNodeId: string;
} & ReloadTreeCommonOptions;

/**
 * Options for doing either full or a sub tree reload.
 * @beta
 */
type ReloadTreeOptions = FullTreeReloadOptions | SubtreeReloadOptions;

/** @beta */
export interface UseTreeResult {
  /**
   * Array containing root tree nodes. It is `undefined` on initial render until any nodes are loaded.
   */
  rootNodes: PresentationTreeNode[] | undefined;
  /**
   * Specifies whether tree is loading or not. It is set to `true` when initial tree load is in progress
   * or tree is reloading.
   */
  isLoading: boolean;
  /**
   * A function that should be called to reload the tree.
   */
  reloadTree: (options?: ReloadTreeOptions) => void;
  /**
   * A function that should be called to either expand or collapse the given node.
   */
  expandNode: (nodeId: string, isExpanded: boolean) => void;
  /**
   * A function that should be called to select nodes in the tree.
   * @param nodeIds Ids of the nodes that are selected.
   * @param changeType Type of change that occurred for the selection.
   */
  selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
  /** Determines whether a given node is selected. */
  isNodeSelected: (nodeId: string) => boolean;
  /** Returns hierarchy level details for a given node ID. */
  getHierarchyLevelDetails: (nodeId: string | undefined) => HierarchyLevelDetails | undefined;
  /** Sets a formatter for the primitive values that are displayed in the hierarchy. */
  setFormatter: (formatter: IPrimitiveValueFormatter | undefined) => void;
}

interface TreeState {
  model: TreeModel;
  rootNodes: Array<PresentationTreeNode> | undefined;
}

function useTreeInternal({
  imodelAccess,
  getHierarchyDefinition,
  getFilteredPaths,
  localizedStrings,
  onPerformanceMeasured,
  onHierarchyLimitExceeded,
  onHierarchyLoadError,
}: UseTreeProps): UseTreeResult & { getNode: (nodeId: string) => TreeModelRootNode | TreeModelNode | undefined } {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
  });
  const [hierarchySource, setHierarchySource] = useState<{ hierarchyProvider?: HierarchyProvider; isFiltering: boolean }>({ isFiltering: false });
  const onPerformanceMeasuredRef = useLatest(onPerformanceMeasured);
  const onHierarchyLimitExceededRef = useLatest(onHierarchyLimitExceeded);
  const onHierarchyLoadErrorRef = useLatest(onHierarchyLoadError);

  const [actions] = useState<TreeActions>(
    () =>
      new TreeActions(
        (model) => {
          const rootNodes = model.parentChildMap.get(undefined) !== undefined ? generateTreeStructure(undefined, model) : undefined;
          setState({
            model,
            rootNodes,
          });
        },
        (actionType, duration) => onPerformanceMeasuredRef.current?.(actionType, duration),
        (props) => onHierarchyLimitExceededRef.current?.(props),
        (props) => onHierarchyLoadErrorRef.current?.(props),
      ),
  );
  const currentFormatter = useRef<IPrimitiveValueFormatter>();

  useEffect(() => {
    const updateHierarchyProvider = (provider: HierarchyProvider, filtered: boolean) => {
      actions.setHierarchyProvider(provider);
      actions.reloadTree({ state: filtered ? "discard" : "keep" });
      setHierarchySource({ hierarchyProvider: provider, isFiltering: false });
    };

    const createProvider = (paths: HierarchyFilteringPaths | undefined) => {
      return createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: getHierarchyDefinition({ imodelAccess }),
        localizedStrings,
        formatter: currentFormatter.current,
        filtering:
          paths !== undefined
            ? {
                paths,
              }
            : undefined,
      });
    };

    const loadHierarchyProvider = async () => {
      if (!getFilteredPaths) {
        return { provider: createProvider(undefined), filtered: false };
      }

      setHierarchySource((prev) => ({ ...prev, isFiltering: true }));
      try {
        const filteredPaths = await getFilteredPaths({ imodelAccess });
        return { provider: createProvider(filteredPaths), filtered: filteredPaths !== undefined };
      } catch {
        return { provider: createProvider(undefined), filtered: false };
      }
    };

    let disposed = false;
    void (async () => {
      const { provider, filtered } = await loadHierarchyProvider();
      if (disposed) {
        return;
      }
      updateHierarchyProvider(provider, filtered);
    })();

    return () => {
      disposed = true;
      actions.dispose();
    };
  }, [actions, imodelAccess, localizedStrings, getHierarchyDefinition, getFilteredPaths]);

  const getNode = useCallback<(nodeId: string) => TreeModelRootNode | TreeModelNode | undefined>(
    (nodeId: string) => {
      return actions.getNode(nodeId);
    },
    [actions],
  );

  const expandNode = useCallback<UseTreeResult["expandNode"]>(
    (nodeId: string, isExpanded: boolean) => {
      actions.expandNode(nodeId, isExpanded);
    },
    [actions],
  );

  const reloadTree = useCallback<UseTreeResult["reloadTree"]>(
    (options) => {
      if (options && "dataSourceChanged" in options) {
        hierarchySource.hierarchyProvider?.notifyDataSourceChanged();
      }
      actions.reloadTree(options);
    },
    [actions, hierarchySource],
  );

  const selectNodes = useCallback<UseTreeResult["selectNodes"]>(
    (nodeIds: Array<string>, changeType: SelectionChangeType) => {
      actions.selectNodes(nodeIds, changeType);
    },
    [actions],
  );

  const isNodeSelected = useCallback<UseTreeResult["isNodeSelected"]>((nodeId: string) => TreeModel.isNodeSelected(state.model, nodeId), [state]);

  const setFormatter = useCallback<UseTreeResult["setFormatter"]>(
    (formatter: IPrimitiveValueFormatter | undefined) => {
      currentFormatter.current = formatter;
      // istanbul ignore if
      if (!hierarchySource.hierarchyProvider) {
        return;
      }

      hierarchySource.hierarchyProvider.setFormatter(formatter);
      actions.reloadTree();
    },
    [hierarchySource.hierarchyProvider, actions],
  );

  const getHierarchyLevelDetails = useCallback<UseTreeResult["getHierarchyLevelDetails"]>(
    (nodeId) => {
      const node = actions.getNode(nodeId);
      const hierarchyProvider = hierarchySource.hierarchyProvider;
      if (!hierarchyProvider || !node || isTreeModelInfoNode(node)) {
        return undefined;
      }
      const hierarchyNode = node.nodeData;
      if (hierarchyNode && HierarchyNode.isGroupingNode(hierarchyNode)) {
        return undefined;
      }

      return {
        hierarchyNode,
        getInstanceKeysIterator: (props) =>
          hierarchyProvider.getNodeInstanceKeys({
            parentNode: hierarchyNode,
            instanceFilter: props?.instanceFilter,
            hierarchyLevelSizeLimit: props?.hierarchyLevelSizeLimit,
          }),
        instanceFilter: node.instanceFilter,
        setInstanceFilter: (filter) => actions.setInstanceFilter(nodeId, filter),
        sizeLimit: node.hierarchyLimit,
        setSizeLimit: (value) => actions.setHierarchyLimit(nodeId, value),
      };
    },
    [actions, hierarchySource.hierarchyProvider],
  );

  return {
    rootNodes: state.rootNodes,
    isLoading: !!state.model.rootNode.isLoading || hierarchySource.isFiltering,
    expandNode,
    reloadTree,
    selectNodes,
    isNodeSelected,
    getNode,
    getHierarchyLevelDetails,
    setFormatter,
  };
}

function generateTreeStructure(parentNodeId: string | undefined, model: TreeModel): Array<PresentationTreeNode> | undefined {
  const currentChildren = model.parentChildMap.get(parentNodeId);
  if (!currentChildren) {
    return undefined;
  }

  return currentChildren
    .map((childId) => model.idToNode.get(childId))
    .filter((node): node is TreeModelNode => !!node)
    .map<PresentationTreeNode>((node) => {
      if (isTreeModelHierarchyNode(node)) {
        const children = generateTreeStructure(node.id, model);
        return {
          ...toPresentationHierarchyNodeBase(node),
          children: children ? children : node.children === true ? true : [],
        };
      }

      if (node.type === "ResultSetTooLarge") {
        return {
          id: node.id,
          parentNodeId,
          type: node.type,
          resultSetSizeLimit: node.resultSetSizeLimit,
        };
      }

      if (node.type === "NoFilterMatches") {
        return {
          id: node.id,
          parentNodeId,
          type: node.type,
        };
      }

      return {
        id: node.id,
        parentNodeId,
        type: node.type,
        message: node.message,
      };
    });
}

function toPresentationHierarchyNodeBase(node: TreeModelHierarchyNode): Omit<PresentationHierarchyNode, "children"> {
  return {
    id: node.id,
    label: node.label,
    nodeData: node.nodeData,
    isLoading: !!node.isLoading,
    isExpanded: !!node.isExpanded,
    isFilterable: !HierarchyNode.isGroupingNode(node.nodeData) && !!node.nodeData.supportsFiltering && node.children,
    isFiltered: !!node.instanceFilter,
    extendedData: node.nodeData.extendedData,
  };
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

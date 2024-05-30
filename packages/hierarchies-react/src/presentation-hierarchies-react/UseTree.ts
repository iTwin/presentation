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
  HierarchyNodeIdentifiersPath,
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
export function useUnifiedSelectionTree({ imodelKey, sourceName, ...props }: UseTreeProps & Omit<UseUnifiedTreeSelectionProps, "getNode">): UseTreeResult {
  const { getNode, ...rest } = useTreeInternal(props);
  return { ...rest, ...useUnifiedTreeSelection({ imodelKey, sourceName, getNode }) };
}

type IModelAccess = ECSchemaProvider & LimitingECSqlQueryExecutor & ECClassHierarchyInspector;

interface GetFilteredPathsProps {
  imodelAccess: IModelAccess;
}

interface UseTreeProps {
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor & ECClassHierarchyInspector;
  getHierarchyDefinition: (props: { imodelAccess: IModelAccess }) => HierarchyDefinition;
  getFilteredPaths?: (props: GetFilteredPathsProps) => Promise<HierarchyNodeIdentifiersPath[] | undefined>;
  localizedStrings?: Parameters<typeof createHierarchyProvider>[0]["localizedStrings"];
  onPerformanceMeasured?: (action: "initial-load" | "hierarchy-level-load" | "reload", duration: number) => void;
  onHierarchyLimitExceeded?: (props: { parentId?: string; filter?: GenericInstanceFilter; limit?: number | "unbounded" }) => void;
}

interface UseTreeResult {
  /**
   * Array containing root tree nodes. It is `undefined` on initial render until any nodes are loaded.
   */
  rootNodes: PresentationTreeNode[] | undefined;
  /**
   * Specifies whether tree is loading or not. It is set to `true` when initial tree load is in progress
   * or tree is reloading.
   */
  isLoading: boolean;
  reloadTree: (options?: { discardState?: boolean; dataSourceChanged?: boolean }) => void;
  expandNode: (nodeId: string, isExpanded: boolean) => void;
  selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
  isNodeSelected: (nodeId: string) => boolean;
  getHierarchyLevelDetails: (nodeId: string | undefined) => HierarchyLevelDetails | undefined;
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
}: UseTreeProps): UseTreeResult & { getNode: (nodeId: string) => TreeModelRootNode | TreeModelNode | undefined } {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
  });
  const [hierarchySource, setHierarchySource] = useState<{ hierarchyProvider?: HierarchyProvider; isFiltering: boolean }>({ isFiltering: false });
  const onPerformanceMeasuredRef = useLatest(onPerformanceMeasured);
  const onHierarchyLimitExceededRef = useLatest(onHierarchyLimitExceeded);

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
      ),
  );
  const currentFormatter = useRef<IPrimitiveValueFormatter>();

  useEffect(() => {
    const updateHierarchyProvider = (provider: HierarchyProvider) => {
      actions.setHierarchyProvider(provider);
      actions.reloadTree(undefined);
      setHierarchySource({ hierarchyProvider: provider, isFiltering: false });
    };

    const createProvider = (paths: HierarchyNodeIdentifiersPath[] | undefined) => {
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
        return createProvider(undefined);
      }

      setHierarchySource((prev) => ({ ...prev, isFiltering: true }));
      try {
        const filteredPaths = await getFilteredPaths({ imodelAccess });
        return createProvider(filteredPaths);
      } catch {
        return createProvider(undefined);
      }
    };

    let disposed = false;
    void (async () => {
      const provider = await loadHierarchyProvider();
      if (disposed) {
        return;
      }
      updateHierarchyProvider(provider);
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
    (options?: { discardState?: boolean; dataSourceChanged?: boolean }) => {
      if (options?.dataSourceChanged) {
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

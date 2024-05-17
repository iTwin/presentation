/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createHierarchyProvider,
  GenericInstanceFilter,
  HierarchyLevelDefinitionsFactory,
  HierarchyNode,
  HierarchyNodeIdentifiersPath,
  HierarchyProvider,
  LimitingECSqlQueryExecutor,
} from "@itwin/presentation-hierarchies";
import { TreeActions } from "./internal/TreeActions";
import { isTreeModelHierarchyNode, isTreeModelInfoNode, TreeModel, TreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./internal/TreeModel";
import { useUnifiedTreeSelection, UseUnifiedTreeSelectionProps } from "./internal/UseUnifiedSelection";
import { PresentationHierarchyNode, PresentationTreeNode } from "./Types";
import { SelectionChangeType } from "./UseSelectionHandler";
import { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";

/** @beta */
export interface HierarchyLevelConfiguration {
  hierarchyNode: HierarchyNode | undefined;
  hierarchyLevelSizeLimit?: number | "unbounded";
  currentFilter?: GenericInstanceFilter;
}

/** @beta */
export function useTree(props: UseTreeProps): UseTreeResult {
  const { getNode: _, ...rest } = useTreeInternal(props);
  return rest;
}

/** @beta */
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
  getHierarchyDefinitionsProvider: (props: { imodelAccess: IModelAccess }) => HierarchyLevelDefinitionsFactory;
  getFilteredPaths?: (props: GetFilteredPathsProps) => Promise<HierarchyNodeIdentifiersPath[] | undefined>;
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
  /**
   * Provider used to load tree nodes.
   */
  hierarchyProvider?: HierarchyProvider;
  reloadTree: (options?: { discardState?: boolean }) => void;
  expandNode: (nodeId: string, isExpanded: boolean) => void;
  selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
  setHierarchyLevelLimit: (nodeId: string | undefined, limit: undefined | number | "unbounded") => void;
  setHierarchyLevelFilter: (nodeId: string | undefined, filter: GenericInstanceFilter | undefined) => void;
  isNodeSelected: (nodeId: string) => boolean;
  getHierarchyLevelConfiguration: (nodeId: string | undefined) => HierarchyLevelConfiguration | undefined;
}

interface TreeState {
  model: TreeModel;
  rootNodes: Array<PresentationTreeNode> | undefined;
}

function useTreeInternal({
  imodelAccess,
  getHierarchyDefinitionsProvider,
  getFilteredPaths,
}: UseTreeProps): UseTreeResult & { getNode: (nodeId: string) => TreeModelRootNode | TreeModelNode | undefined } {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
  });
  const [hierarchySource, setHierarchySource] = useState<{ HierarchyProvider?: HierarchyProvider; isFiltering: boolean }>({ isFiltering: false });
  const [actions] = useState<TreeActions>(
    () =>
      new TreeActions((model) => {
        const rootNodes = model.parentChildMap.get(undefined) !== undefined ? generateTreeStructure(undefined, model) : undefined;
        setState({
          model,
          rootNodes,
        });
      }),
  );

  useEffect(() => {
    const updateHierarchyProvider = (provider: HierarchyProvider) => {
      actions.setHierarchyProvider(provider);
      actions.reloadTree(undefined);
      setHierarchySource({ HierarchyProvider: provider, isFiltering: false });
    };

    const createProvider = async () => {
      if (!getFilteredPaths) {
        return createHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: getHierarchyDefinitionsProvider({ imodelAccess }),
        });
      }

      setHierarchySource((prev) => ({ ...prev, isFiltering: true }));
      const filteredPaths = await getFilteredPaths({ imodelAccess });
      return createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: getHierarchyDefinitionsProvider({ imodelAccess }),
        filtering:
          filteredPaths !== undefined
            ? {
                paths: filteredPaths,
              }
            : undefined,
      });
    };

    let disposed = false;
    void (async () => {
      const provider = await createProvider();
      if (disposed) {
        return;
      }
      updateHierarchyProvider(provider);
    })();

    return () => {
      disposed = true;
      actions.dispose();
    };
  }, [actions, imodelAccess, getHierarchyDefinitionsProvider, getFilteredPaths]);

  const getNode = useRef((nodeId: string) => {
    return actions.getNode(nodeId);
  }).current;

  const expandNode = useRef((nodeId: string, isExpanded: boolean) => {
    actions.expandNode(nodeId, isExpanded);
  }).current;

  const reloadTree = useRef((options?: { discardState?: boolean }) => {
    actions.reloadTree(options);
  }).current;

  const selectNodes = useRef((nodeIds: Array<string>, changeType: SelectionChangeType) => {
    actions.selectNodes(nodeIds, changeType);
  }).current;

  const setHierarchyLevelLimit = useRef((nodeId: string | undefined, limit: undefined | number | "unbounded") => {
    actions.setHierarchyLimit(nodeId, limit);
  }).current;

  const setHierarchyLevelFilter = useRef((nodeId: string | undefined, filter: GenericInstanceFilter | undefined) => {
    actions.setInstanceFilter(nodeId, filter);
  }).current;

  const isNodeSelected = useCallback((nodeId: string) => TreeModel.isNodeSelected(state.model, nodeId), [state]);

  const getHierarchyLevelConfiguration = useCallback(
    (nodeId: string | undefined): HierarchyLevelConfiguration | undefined => {
      const node = actions.getNode(nodeId);
      if (!node || isTreeModelInfoNode(node)) {
        return undefined;
      }
      const hierarchyNode = node.nodeData;
      if (hierarchyNode && HierarchyNode.isGroupingNode(hierarchyNode)) {
        return undefined;
      }

      const currentFilter = node.instanceFilter;
      return {
        hierarchyNode,
        currentFilter,
        hierarchyLevelSizeLimit: node.hierarchyLimit,
      };
    },
    [actions],
  );

  return {
    rootNodes: state.rootNodes,
    hierarchyProvider: hierarchySource.HierarchyProvider,
    isLoading: !!state.model.rootNode.isLoading || hierarchySource.isFiltering,
    expandNode,
    reloadTree,
    selectNodes,
    isNodeSelected,
    setHierarchyLevelLimit,
    getHierarchyLevelConfiguration,
    getNode,
    setHierarchyLevelFilter,
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

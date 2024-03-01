/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import { PresentationError, PresentationStatus } from "@itwin/presentation-common";
import { PresentationInstanceFilterInfo, PresentationInstanceFilterPropertiesSource } from "@itwin/presentation-components";
import { createHierarchyLevelDescriptor } from "@itwin/presentation-core-interop";
import { Presentation } from "@itwin/presentation-frontend";
import { HierarchyNode, HierarchyNodeKey, HierarchyProvider, InstancesNodeKey } from "@itwin/presentation-hierarchy-builder";
import { TreeActions, TreeState } from "./internal/TreeActions";
import { isHierarchyNodeSelected, TreeModelHierarchyNode } from "./internal/TreeModel";
import { useUnifiedTreeSelection } from "./internal/UseUnifiedSelection";
import { PresentationTreeNode } from "./Types";

/** @beta */
export interface UseTreeProps {
  hierarchyProvider?: HierarchyProvider;
}

/** @beta */
export interface HierarchyLevelFilteringOptions {
  getDescriptor: (imodel: IModelConnection) => Promise<PresentationInstanceFilterPropertiesSource>;
  applyFilter: (filter?: PresentationInstanceFilterInfo) => void;
  currentFilter?: PresentationInstanceFilterInfo;
}

/** @beta */
export interface UseTreeResult {
  rootNodes: PresentationTreeNode[] | undefined;
  isLoading: boolean;
  reloadTree: (options?: { discardState?: boolean }) => void;
  expandNode: (nodeId: string, isExpanded: boolean) => void;
  selectNode: (nodeId: string, isSelected: boolean) => void;
  setHierarchyLevelLimit: (nodeId: string | undefined, limit: undefined | number | "unbounded") => void;
  removeHierarchyLevelFilter: (nodeId: string) => void;
  isNodeSelected: (nodeId: string) => boolean;
  getHierarchyLevelFilteringOptions: (nodeId: string) => HierarchyLevelFilteringOptions | undefined;
}

/** @beta */
export function useTree(props: UseTreeProps): UseTreeResult {
  const { getNode: _, ...rest } = useTreeInternal(props);
  return rest;
}

/** @beta */
export function useUnifiedSelectionTree(props: UseTreeProps): UseTreeResult {
  const { getNode, ...rest } = useTreeInternal(props);
  return { ...rest, ...useUnifiedTreeSelection({ getNode }) };
}

/** @internal */
export function useTreeInternal({ hierarchyProvider }: UseTreeProps): UseTreeResult & { getNode: (nodeId: string) => TreeModelHierarchyNode | undefined } {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
    isLoading: false,
  });
  const [actions] = useState<TreeActions>(() => new TreeActions((actionOrValue) => setState(actionOrValue)));

  useEffect(() => {
    actions.setHierarchyProvider(hierarchyProvider);
    actions.reloadTree(undefined);
    return () => {
      actions.dispose();
    };
  }, [actions, hierarchyProvider]);

  const getNode = useRef((nodeId: string) => {
    return actions.getNode(nodeId);
  }).current;

  const expandNode = useRef((nodeId: string, isExpanded: boolean) => {
    actions.expandNode(nodeId, isExpanded);
  }).current;

  const reloadTree = useRef((options?: { discardState?: boolean }) => {
    actions.reloadTree(undefined, options);
  }).current;

  const selectNode = useRef((nodeId: string, isSelected: boolean) => {
    actions.selectNode(nodeId, isSelected);
  }).current;

  const setHierarchyLevelLimit = useRef((nodeId: string | undefined, limit: undefined | number | "unbounded") => {
    actions.setHierarchyLimit(nodeId, limit);
  }).current;

  const removeHierarchyLevelFilter = useRef((nodeId: string) => {
    actions.setInstanceFilter(nodeId, undefined);
  }).current;

  const isNodeSelected = useCallback(
    (nodeId: string) => {
      return isHierarchyNodeSelected(state.model, nodeId);
    },
    [state],
  );

  const getHierarchyLevelFilteringOptions = useCallback(
    (nodeId: string) => {
      const node = actions.getNode(nodeId);
      if (!hierarchyProvider || !node || !isInstancesHierarchyNode(node.nodeData) || !node.nodeData.supportsFiltering) {
        return undefined;
      }

      const hierarchyNode = node.nodeData;
      const currentFilter = node.instanceFilter;
      const filteringOptions: HierarchyLevelFilteringOptions = {
        getDescriptor: async (imodel: IModelConnection): Promise<PresentationInstanceFilterPropertiesSource> => {
          const result = await createHierarchyLevelDescriptor({
            imodel,
            parentNode: hierarchyNode,
            hierarchyProvider,
            descriptorBuilder: {
              getContentDescriptor: async (options) => Presentation.presentation.getContentDescriptor(options),
            },
          });

          if (!result) {
            throw new PresentationError(PresentationStatus.Error, `Failed to get descriptor for node - ${node.id}`);
          }

          return {
            descriptor: result.descriptor,
            inputKeys: result.inputKeys,
          };
        },
        applyFilter: (filter?: PresentationInstanceFilterInfo) => {
          actions.setInstanceFilter(node.id, filter);
        },
        currentFilter,
      };

      return filteringOptions;
    },
    [hierarchyProvider, actions],
  );

  return {
    rootNodes: state.rootNodes,
    isLoading: state.isLoading,
    expandNode,
    reloadTree,
    selectNode,
    isNodeSelected,
    setHierarchyLevelLimit,
    getHierarchyLevelFilteringOptions,
    getNode,
    removeHierarchyLevelFilter,
  };
}

function isInstancesHierarchyNode(node: HierarchyNode): node is HierarchyNode & { key: InstancesNodeKey } {
  return HierarchyNodeKey.isInstances(node.key);
}

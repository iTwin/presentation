/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { useEffect, useState } from "react";
import { HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { Draft, enableMapSet, produce } from "immer";
import { HierarchyLoader, ModelNode, PresentationNodeKey, TreeModel } from "./TreeModel";

enableMapSet();

export interface UseTreeStateProps {
  hierarchyProvider?: HierarchyProvider;
}

interface TreeState {
  model: TreeModel;
  rootNodes: PresentationNode[] | undefined;
}

export function useTreeState({ hierarchyProvider }: UseTreeStateProps) {
  const [actions, setActions] = useState<TreeActions>();
  const [state, setState] = useState<TreeState>({ model: { idToNode: {}, parentChildMap: new Map() }, rootNodes: undefined });

  useEffect(() => {
    if (!hierarchyProvider) {
      return;
    }

    const treeActions = new TreeActions((updater) => setState(updater), hierarchyProvider);
    setState({ model: { idToNode: {}, parentChildMap: new Map() }, rootNodes: undefined });
    setActions(treeActions);

    treeActions.loadRootNodes();
    return () => {
      treeActions.dispose();
    };
  }, [hierarchyProvider]);

  return {
    rootNodes: state.rootNodes,
    treeActions: actions,
  };
}

export type PresentationNode = Omit<ModelNode, "children"> & { children: true | PresentationNode[] };

export class TreeActions {
  private _loader: HierarchyLoader;

  constructor(
    private _updater: (update: (initialState: TreeState) => TreeState) => void,
    private _hierarchyProvider: HierarchyProvider,
  ) {
    this._loader = new HierarchyLoader(this._hierarchyProvider, this.setChildren.bind(this));
  }

  public dispose() {
    this._loader.dispose();
  }

  private updateTreeState(action: (model: Draft<TreeModel>) => void) {
    this._updater((prevState) => {
      const newModel = produce(prevState.model, action);
      if (newModel === prevState.model) {
        return prevState;
      }

      const rootNodes = generateTreeStructure(undefined, newModel);
      return {
        model: newModel,
        rootNodes,
      };
    });
  }

  public expandNode(nodeKey: PresentationNodeKey, isExpanded: boolean) {
    let loadChildren = false;
    this.updateTreeState((model) => {
      model.idToNode[nodeKey.id].isExpanded = isExpanded;
      if (isExpanded && model.parentChildMap.get(nodeKey.id) === undefined) {
        loadChildren = true;
        model.idToNode[nodeKey.id].isLoading = true;
      }
    });

    if (loadChildren) {
      this._loader.loadNode(nodeKey);
    }
  }

  public selectNode(nodeKey: PresentationNodeKey, isSelected: boolean) {
    this.updateTreeState((model) => {
      const node = model.idToNode[nodeKey.id];
      if (node) {
        node.isSelected = isSelected;
      }
    });
  }

  public setChildren(nodeKey: PresentationNodeKey | undefined, children: ModelNode[]) {
    this.updateTreeState((model: Draft<TreeModel>) => {
      model.parentChildMap.set(
        nodeKey?.id,
        children.map((node) => node.id),
      );
      for (const node of children) {
        model.idToNode[node.id] = node;
      }
      if (nodeKey !== undefined) {
        model.idToNode[nodeKey.id].isLoading = false;
      }
    });
  }

  public loadRootNodes() {
    this._loader.loadNode(undefined);
  }
}

function generateTreeStructure(parentId: string | undefined, model: TreeModel): PresentationNode[] {
  const currentChildren = model.parentChildMap.get(parentId);
  if (!currentChildren) {
    return [];
  }

  return currentChildren.map<PresentationNode>((childId) => {
    const node = model.idToNode[childId];
    const children = generateTreeStructure(childId, model);
    return {
      id: childId,
      children: children.length === 0 && node.children === true ? true : children,
      label: node.label,
      nodeData: node.nodeData,
      isLoading: node.isLoading,
      isExpanded: node.isExpanded,
      isSelected: node.isSelected,
    };
  });
}

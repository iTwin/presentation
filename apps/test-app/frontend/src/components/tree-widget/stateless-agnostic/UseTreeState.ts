/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { Draft, enableMapSet, produce } from "immer";
import { useEffect, useState } from "react";
import { HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { HierarchyLoader, ModelNode, PresentationNodeKey, reloadTree, TreeModel } from "./TreeModel";

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
  private _currentModel: TreeModel = { idToNode: {}, parentChildMap: new Map() };

  constructor(
    private _updater: (update: (initialState: TreeState) => TreeState) => void,
    private _hierarchyProvider: HierarchyProvider,
  ) {
    this._loader = new HierarchyLoader(this._hierarchyProvider, this.addLoadedHierarchy.bind(this));
  }

  public dispose() {
    this._loader.dispose();
  }

  private getModel(model: TreeModel, actionOrModel: ((model: Draft<TreeModel>) => void) | TreeModel) {
    if (typeof actionOrModel === "function") {
      return produce(model, actionOrModel);
    }
    return actionOrModel;
  }

  private updateTreeState(actionOrModel: ((model: Draft<TreeModel>) => void) | TreeModel) {
    this._updater((prevState) => {
      this._currentModel = this.getModel(prevState.model, actionOrModel);
      if (this._currentModel === prevState.model) {
        return prevState;
      }

      const rootNodes = generateTreeStructure(undefined, this._currentModel);
      return {
        model: this._currentModel,
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

  private addLoadedHierarchy(hierarchyParent: PresentationNodeKey | undefined, loadedHierarchy: TreeModel) {
    this.updateTreeState((model: Draft<TreeModel>) => {
      const removedChildren: string[] = [];
      for (const [parentId, childIds] of loadedHierarchy.parentChildMap) {
        const currentChildren = model.parentChildMap.get(parentId);
        removedChildren.push(...(currentChildren ?? []));
        model.parentChildMap.set(parentId, childIds);
      }

      for (const removedNodeId of removedChildren) {
        delete model.idToNode[removedNodeId];
      }

      for (const nodeId in loadedHierarchy.idToNode) {
        if (!(nodeId in loadedHierarchy.idToNode)) {
          continue;
        }
        model.idToNode[nodeId] = loadedHierarchy.idToNode[nodeId];
      }
      if (hierarchyParent !== undefined) {
        model.idToNode[hierarchyParent.id].isLoading = false;
      }
    });
  }

  public loadRootNodes() {
    this._loader.loadNode(undefined);
  }

  public async reloadTree() {
    const expandedNodes = collectExpandedNodes(undefined, this._currentModel);
    reloadTree(this._hierarchyProvider, expandedNodes).subscribe({
      next: (newModel) => {
        this.updateTreeState(newModel);
      },
    });
  }
}

function collectExpandedNodes(parentId: string | undefined, model: TreeModel): PresentationNodeKey[] {
  const currentChildren = model.parentChildMap.get(parentId);
  if (!currentChildren) {
    return [];
  }

  if (parentId === undefined) {
    return currentChildren.flatMap((child) => collectExpandedNodes(child, model));
  }

  const currNode = model.idToNode[parentId];
  if (!currNode.isExpanded) {
    return [];
  }

  return [{ id: currNode.id, nodeData: currNode.nodeData }, ...currentChildren.flatMap((child) => collectExpandedNodes(child, model))];
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
    };
  });
}

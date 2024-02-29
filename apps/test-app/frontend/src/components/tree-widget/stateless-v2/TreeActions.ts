/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { Draft, enableMapSet, produce } from "immer";
import { EMPTY, Observable, reduce, Subject, takeUntil } from "rxjs";
import { PresentationInstanceFilterInfo } from "@itwin/presentation-components";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { HierarchyLoader, IHierarchyLoader, LoadedHierarchyPart } from "./TreeLoader";
import {
  addHierarchyPart, expandNode, isTreeModelHierarchyNode, removeSubTree, TreeModel, TreeModelHierarchyNode, TreeModelRootNode,
} from "./TreeModel";
import { PresentationHierarchyNode, PresentationTreeNode } from "./Types";

enableMapSet();

/** @internal */
export interface TreeState {
  model: TreeModel;
  rootNodes: Array<PresentationTreeNode> | undefined;
  isLoading: boolean;
}

/** @internal */
export class TreeActions {
  private _loader: IHierarchyLoader;
  private _currentModel: TreeModel = { idToNode: {}, parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } };
  private _disposed = new Subject<void>();

  constructor(private _updater: (actionOrValue: TreeState | ((initialState: TreeState) => TreeState)) => void) {
    this._loader = new NoopHierarchyLoader();
  }

  private getModel(model: TreeModel, actionOrModel: ((model: Draft<TreeModel>) => void) | TreeModel) {
    if (typeof actionOrModel === "function") {
      return produce(model, actionOrModel);
    }
    return actionOrModel;
  }

  private updateTreeState(action: (state: TreeState) => TreeState) {
    this._updater(action);
  }

  private updateTreeModel(actionOrModel: ((model: Draft<TreeModel>) => void) | TreeModel) {
    const newModel = this.getModel(this._currentModel, actionOrModel);
    if (this._currentModel === newModel) {
      return;
    }

    this._currentModel = newModel;
    const rootNodes = this._currentModel.parentChildMap.get(undefined) !== undefined ? generateTreeStructure(undefined, this._currentModel) : undefined;
    this._updater({
      model: this._currentModel,
      rootNodes,
      isLoading: false,
    });
  }

  private loadNodes(parentId: string | undefined) {
    const parentNode = parentId ? this._currentModel.idToNode[parentId] : this._currentModel.rootNode;
    if (parentNode.id !== undefined && !isTreeModelHierarchyNode(parentNode)) {
      return;
    }

    this._loader
      .getNodes(parentNode, (node) => !!node.autoExpand)
      .pipe(
        takeUntil(this._disposed),
        reduce<LoadedHierarchyPart, TreeModel>(
          (treeModel, hierarchyPart) => {
            addNodesToModel(treeModel, hierarchyPart);
            return treeModel;
          },
          {
            idToNode: {},
            parentChildMap: new Map(),
            rootNode: { id: undefined, nodeData: undefined },
          },
        ),
      )
      .subscribe({
        next: (loadedHierarchy) => {
          this.updateTreeModel((model) => {
            addHierarchyPart(model, parentNode.id, loadedHierarchy);
            const node = parentNode.id ? model.idToNode[parentNode.id] : undefined;
            if (node && isTreeModelHierarchyNode(node)) {
              node.isLoading = false;
            }
          });
        },
      });
  }

  public dispose() {
    this._disposed.next();
  }

  public getNode(nodeId: string): TreeModelHierarchyNode | undefined {
    const node = this._currentModel.idToNode[nodeId];
    return node && isTreeModelHierarchyNode(node) ? node : undefined;
  }

  public setHierarchyProvider(provider?: HierarchyProvider) {
    this._loader = provider ? new HierarchyLoader(provider) : new NoopHierarchyLoader();
  }

  public selectNode(nodeId: string, isSelected: boolean) {
    this.updateTreeModel((model) => {
      const modelNode = model.idToNode[nodeId];
      if (!modelNode || !isTreeModelHierarchyNode(modelNode)) {
        return;
      }
      modelNode.isSelected = isSelected;
    });
  }

  public expandNode(nodeId: string, isExpanded: boolean) {
    let loadChildren = false;
    this.updateTreeModel((model) => {
      expandNode(model, nodeId, isExpanded);
      const modelNode = model.idToNode[nodeId];
      if (modelNode && isTreeModelHierarchyNode(modelNode) && modelNode.children && model.parentChildMap.get(modelNode.id) === undefined) {
        modelNode.isLoading = true;
        loadChildren = true;
      }
    });

    if (loadChildren) {
      this.loadNodes(nodeId);
    }
  }

  public setHierarchyLimit(nodeId: string | undefined, limit?: number | "unbounded") {
    this.updateTreeModel((model) => {
      removeSubTree(model, nodeId);
      if (nodeId === undefined) {
        model.rootNode.hierarchyLimit = limit;
        return;
      }

      const modelNode = model.idToNode[nodeId];
      if (modelNode && isTreeModelHierarchyNode(modelNode)) {
        modelNode.hierarchyLimit = limit;
        modelNode.isLoading = true;
      }
    });

    this.loadNodes(nodeId);
  }

  public setInstanceFilter(nodeId: string, filter?: PresentationInstanceFilterInfo) {
    this.updateTreeModel((model) => {
      const modelNode = model.idToNode[nodeId];
      if (!modelNode || !isTreeModelHierarchyNode(modelNode)) {
        return;
      }

      modelNode.instanceFilter = filter;
      if (modelNode.isExpanded) {
        modelNode.isLoading = true;
      }
    });

    this.reloadTree(nodeId);
  }

  public reloadTree(parentId: string | undefined, options?: { discardState?: boolean; shouldLoadChildren?: (node: HierarchyNode) => boolean }) {
    const oldModel = this._currentModel;
    const expandedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === true);
    const collapsedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === false);
    const buildNode = !!options?.discardState ? (node: TreeModelHierarchyNode) => node : (node: TreeModelHierarchyNode) => addAttributes(node, oldModel);

    const rootNode = parentId !== undefined ? this.getNode(parentId) : oldModel.rootNode;
    if (!rootNode) {
      return;
    }

    if (parentId === undefined) {
      // cancel all ongoing requests
      this._disposed.next();
      this.updateTreeState((state) => ({ ...state, isLoading: true }));
    }

    this._loader
      .reloadNodes(rootNode, { expandedNodes, collapsedNodes, buildNode })
      .pipe(
        takeUntil(this._disposed),
        reduce<LoadedHierarchyPart, TreeModel>(
          (treeModel, loadedPart) => {
            addNodesToModel(treeModel, loadedPart);
            const node = loadedPart.parent.id ? treeModel.idToNode[loadedPart.parent.id] : undefined;
            // expand parent node
            if (node && isTreeModelHierarchyNode(node)) {
              node.isExpanded = true;
            }
            return treeModel;
          },
          {
            idToNode: {},
            parentChildMap: new Map(),
            rootNode: !!options?.discardState ? { id: undefined, nodeData: undefined } : { ...oldModel.rootNode },
          },
        ),
      )
      .subscribe({
        next: (newModel) => {
          this.updateTreeModel((model) => {
            addHierarchyPart(model, parentId, newModel);
            const parentNode = parentId !== undefined ? model.idToNode[parentId] : undefined;
            if (parentNode && isTreeModelHierarchyNode(parentNode)) {
              parentNode.isLoading = false;
            }
          });
        },
      });
  }
}

function addNodesToModel(model: TreeModel, hierarchyPart: LoadedHierarchyPart) {
  model.parentChildMap.set(
    hierarchyPart.parent?.id,
    hierarchyPart.loadedNodes.map((node) => node.id),
  );
  for (const node of hierarchyPart.loadedNodes) {
    model.idToNode[node.id] = node;
  }
  const parentNode = hierarchyPart.parent.id ? model.idToNode[hierarchyPart.parent.id] : undefined;
  if (parentNode && isTreeModelHierarchyNode(parentNode)) {
    parentNode.isExpanded = true;
  }
}

function addAttributes(node: TreeModelHierarchyNode, oldModel: TreeModel) {
  const oldNode = oldModel.idToNode[node.id];
  if (oldNode && isTreeModelHierarchyNode(oldNode)) {
    node.hierarchyLimit = oldNode.hierarchyLimit;
    node.instanceFilter = oldNode.instanceFilter;
    node.isSelected = oldNode.isSelected;
  }
  return node;
}

function collectNodes(parentId: string | undefined, model: TreeModel, pred: (node: TreeModelHierarchyNode) => boolean): TreeModelHierarchyNode[] {
  const currentChildren = model.parentChildMap.get(parentId);
  if (!currentChildren) {
    return [];
  }

  if (parentId === undefined) {
    return currentChildren.flatMap((child) => collectNodes(child, model, pred));
  }

  const currNode = model.idToNode[parentId];
  if (!isTreeModelHierarchyNode(currNode) || !pred(currNode)) {
    return [];
  }

  return [currNode, ...currentChildren.flatMap((child) => collectNodes(child, model, pred))];
}

function generateTreeStructure(parentNodeId: string | undefined, model: TreeModel): Array<PresentationTreeNode> | undefined {
  const currentChildren = model.parentChildMap.get(parentNodeId);
  if (!currentChildren) {
    return undefined;
  }

  return currentChildren.map<PresentationTreeNode>((childId) => {
    const node = model.idToNode[childId];
    if (node && !isTreeModelHierarchyNode(node)) {
      return {
        id: node.id,
        parentNodeId,
        type: node.type,
        message: node.message,
      };
    }

    const children = generateTreeStructure(childId, model);
    return {
      ...toPresentationHierarchyNodeBase(node),
      children: children ? children : node.children === true ? true : [],
    };
  });
}

function toPresentationHierarchyNodeBase(node: TreeModelHierarchyNode): Omit<PresentationHierarchyNode, "children"> {
  return {
    id: node.id,
    label: node.label,
    isLoading: !!node.isLoading,
    isExpanded: !!node.isExpanded,
    isFilterable: !!node.nodeData.supportsFiltering && node.children,
    isFiltered: !!node.instanceFilter,
    extendedData: node.nodeData.extendedData,
  };
}

class NoopHierarchyLoader implements IHierarchyLoader {
  public getNodes(_parent: TreeModelHierarchyNode | TreeModelRootNode, _shouldLoadChildren: (node: HierarchyNode) => boolean): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }

  public reloadNodes(
    _parent: TreeModelHierarchyNode | TreeModelRootNode,
    _options: { expandedNodes: TreeModelHierarchyNode[]; collapsedNodes: TreeModelHierarchyNode[] },
  ): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }
}

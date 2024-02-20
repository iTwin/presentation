/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { Draft, enableMapSet, produce } from "immer";
import { EMPTY, Observable, reduce, Subject, takeUntil } from "rxjs";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { HierarchyLoader, IHierarchyLoader, LoadedHierarchyPart } from "./TreeLoader";
import { addHierarchyPart, expandNode, InfoNodeTypes, isModelNode, ModelNode, NodeIdentifier, removeSubTree, RootNode, TreeModel } from "./TreeModel";

enableMapSet();

export interface TreeState {
  model: TreeModel;
  rootNodes: Array<PresentationTreeNode> | undefined;
}

export interface PresentationNode extends NodeIdentifier {
  label: string;
  children: true | Array<PresentationTreeNode>;
  isExpanded: boolean;
  isLoading: boolean;
}

export interface PresentationInfoNode {
  id: string;
  parentNode: PresentationNode | undefined;
  type: InfoNodeTypes;
  message: string;
}

export type PresentationTreeNode = PresentationNode | PresentationInfoNode;

export class TreeActions {
  private _loader: IHierarchyLoader;
  private _currentModel: TreeModel = { idToNode: {}, parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } };
  private _disposed = new Subject<void>();

  constructor(private _updater: (update: (initialState: TreeState) => TreeState) => void) {
    this._loader = new NoopHierarchyLoader();
  }

  public dispose() {
    this._disposed.next();
  }

  public setHierarchyProvider(provider?: HierarchyProvider) {
    this._loader = provider ? new HierarchyLoader(provider) : new NoopHierarchyLoader();
  }

  private getModel(model: TreeModel, actionOrModel: ((model: Draft<TreeModel>) => void) | TreeModel) {
    if (typeof actionOrModel === "function") {
      return produce(model, actionOrModel);
    }
    return actionOrModel;
  }

  private updateTreeState(actionOrModel: ((model: Draft<TreeModel>) => void) | TreeModel) {
    const newModel = this.getModel(this._currentModel, actionOrModel);
    if (this._currentModel === newModel) {
      return;
    }

    this._currentModel = newModel;
    const rootNodes = this._currentModel.parentChildMap.get(undefined) !== undefined ? generateTreeStructure(undefined, this._currentModel) : undefined;
    this._updater(() => {
      return {
        model: this._currentModel,
        rootNodes,
      };
    });
  }

  private loadNodes(parent: PresentationNode | undefined) {
    const parentNode = parent ? this._currentModel.idToNode[parent.id] : this._currentModel.rootNode;
    if (parentNode.id !== undefined && !isModelNode(parentNode)) {
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
          this.updateTreeState((model) => {
            addHierarchyPart(model, parentNode, loadedHierarchy);
            const node = parentNode.id ? model.idToNode[parentNode.id] : undefined;
            if (node && isModelNode(node)) {
              node.isLoading = false;
            }
          });
        },
      });
  }

  public selectNode(node: PresentationNode, isSelected: boolean) {
    this.updateTreeState((model) => {
      const modelNode = model.idToNode[node.id];
      if (!modelNode || !isModelNode(modelNode)) {
        return;
      }
      modelNode.isSelected = isSelected;
    });
  }

  public expandNode(node: PresentationNode, isExpanded: boolean) {
    let loadChildren = false;
    this.updateTreeState((model) => {
      expandNode(model, node, isExpanded);
      const modelNode = model.idToNode[node.id];
      if (modelNode && isModelNode(modelNode) && modelNode.children && model.parentChildMap.get(modelNode.id) === undefined) {
        modelNode.isLoading = true;
        loadChildren = true;
      }
    });

    if (loadChildren) {
      this.loadNodes(node);
    }
  }

  public setHierarchyLimit(node: PresentationNode | undefined, limit?: number | "unbounded") {
    this.updateTreeState((model) => {
      removeSubTree(model, node ?? model.rootNode);
      if (node === undefined) {
        model.rootNode.hierarchyLimit = limit;
        return;
      }

      const modelNode = model.idToNode[node.id];
      if (modelNode && isModelNode(modelNode)) {
        modelNode.hierarchyLimit = limit;
        modelNode.isLoading = true;
      }
    });

    this.loadNodes(node);
  }

  public reloadTree(options?: { discardState?: boolean }) {
    // cancel all ongoing requests
    this._disposed.next();

    const oldModel = this._currentModel;
    const expandedNodes = !!options?.discardState ? [] : collectNodes(undefined, this._currentModel, (node) => node.isExpanded === true);
    const collapsedNodes = !!options?.discardState ? [] : collectNodes(undefined, this._currentModel, (node) => node.isExpanded === false);
    const buildNode = !!options?.discardState ? (node: ModelNode) => node : (node: ModelNode) => addAttributes(node, oldModel);

    this._loader
      .reloadNodes({ expandedNodes, collapsedNodes, buildNode })
      .pipe(
        takeUntil(this._disposed),
        reduce<LoadedHierarchyPart, TreeModel>(
          (treeModel, loadedPart) => {
            addNodesToModel(treeModel, loadedPart);
            const node = loadedPart.parent.id ? treeModel.idToNode[loadedPart.parent.id] : undefined;
            // expand parent node
            if (node && isModelNode(node)) {
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
          this.updateTreeState(newModel);
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
  if (parentNode && isModelNode(parentNode)) {
    parentNode.isExpanded = true;
  }
}

function addAttributes(node: ModelNode, oldModel: TreeModel) {
  const oldNode = oldModel.idToNode[node.id];
  if (oldNode && isModelNode(oldNode)) {
    node.hierarchyLimit = oldNode.hierarchyLimit;
    node.instanceFilter = oldNode.instanceFilter;
    node.isSelected = oldNode.isSelected;
  }
  return node;
}

function collectNodes(parentId: string | undefined, model: TreeModel, pred: (node: ModelNode) => boolean): NodeIdentifier[] {
  const currentChildren = model.parentChildMap.get(parentId);
  if (!currentChildren) {
    return [];
  }

  if (parentId === undefined) {
    return currentChildren.flatMap((child) => collectNodes(child, model, pred));
  }

  const currNode = model.idToNode[parentId];
  if (!isModelNode(currNode) || !pred(currNode)) {
    return [];
  }

  return [
    { id: currNode.id, nodeData: currNode.nodeData, instanceFilter: currNode.instanceFilter, hierarchyLimit: currNode.hierarchyLimit },
    ...currentChildren.flatMap((child) => collectNodes(child, model, pred)),
  ];
}

function generateTreeStructure(parentId: string | undefined, model: TreeModel): Array<PresentationTreeNode> {
  const currentChildren = model.parentChildMap.get(parentId);
  const parentNode = parentId !== undefined ? model.idToNode[parentId] : undefined;
  if (!currentChildren) {
    return [];
  }

  return currentChildren.map<PresentationTreeNode>((childId) => {
    const node = model.idToNode[childId];
    if (node && !isModelNode(node)) {
      return {
        id: node.id,
        parentNode: parentNode as PresentationNode,
        type: node.type,
        message: node.message,
      };
    }
    const children = generateTreeStructure(childId, model);
    const presentationNode: PresentationNode = {
      id: childId,
      children: children.length === 0 && node.children === true ? true : children,
      label: node.label,
      nodeData: node.nodeData,
      isLoading: !!node.isLoading,
      isExpanded: !!node.isExpanded,
    };
    return presentationNode;
  });
}

class NoopHierarchyLoader implements IHierarchyLoader {
  public getNodes(_parent: NodeIdentifier | RootNode, _shouldLoadChildren: (node: HierarchyNode) => boolean): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }

  public reloadNodes(_options: { expandedNodes: NodeIdentifier[]; collapsedNodes: NodeIdentifier[] }): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }
}

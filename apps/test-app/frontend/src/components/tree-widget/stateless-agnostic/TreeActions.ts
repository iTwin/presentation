/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { Draft, enableMapSet, produce } from "immer";
import { EMPTY, Observable, reduce, Subject, takeUntil } from "rxjs";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { HierarchyLoader, IHierarchyLoader, LoadedHierarchyPart } from "./TreeLoader";
import { addHierarchyPart, expandNode, InfoNodeTypes, isModelNode, ModelNode, NodeIdentifier, TreeModel } from "./TreeModel";

enableMapSet();

export interface TreeState {
  model: TreeModel;
  rootNodes: Array<PresentationTreeNode> | undefined;
}

export type PresentationNode = Omit<ModelNode, "children"> & { children: true | Array<PresentationTreeNode> };

export interface PresentationInfoNode {
  id: string;
  parentNode: PresentationNode;
  type: InfoNodeTypes;
  message: string;
}

export type PresentationTreeNode = PresentationNode | PresentationInfoNode;

export class TreeActions {
  private _loader: IHierarchyLoader;
  private _currentModel: TreeModel = { idToNode: {}, parentChildMap: new Map() };
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

  private loadNodes(parent: PresentationNode | undefined) {
    this._loader
      .getNodes(parent, (node) => !!node.autoExpand)
      .pipe(
        takeUntil(this._disposed),
        reduce(
          (treeModel, hierarchyPart) => {
            addNodesToModel(treeModel, hierarchyPart);
            return treeModel;
          },
          {
            idToNode: {},
            parentChildMap: new Map(),
          } as TreeModel,
        ),
      )
      .subscribe({
        next: (loadedHierarchy) => {
          this.updateTreeState((model) => {
            addHierarchyPart(model, parent, loadedHierarchy);
            const node = parent ? model.idToNode[parent.id] : undefined;
            if (node && isModelNode(node)) {
              node.isLoading = false;
            }
          });
        },
      });
  }

  public expandNode(nodeKey: PresentationNode, isExpanded: boolean) {
    let loadChildren = false;
    this.updateTreeState((model) => {
      expandNode(model, nodeKey, isExpanded);
      const node = model.idToNode[nodeKey.id];
      if (node && isModelNode(node) && node.children && model.parentChildMap.get(node.id) === undefined) {
        node.isLoading = true;
        loadChildren = true;
      }
    });

    if (loadChildren) {
      this.loadNodes(nodeKey);
    }
  }

  public loadRootNodes() {
    this.loadNodes(undefined);
  }

  public reloadTree() {
    const expandedNodes = collectNodes(undefined, this._currentModel, (node) => node.isExpanded === true);
    const collapsedNodes = collectNodes(undefined, this._currentModel, (node) => node.isExpanded === false);
    this._loader
      .reloadNodes({ expandedNodes, collapsedNodes })
      .pipe(
        takeUntil(this._disposed),
        reduce(
          (treeModel, loadedPart) => {
            addNodesToModel(treeModel, loadedPart);
            const node = loadedPart.parent ? treeModel.idToNode[loadedPart.parent.id] : undefined;
            // expand parent node
            if (node && isModelNode(node)) {
              node.isExpanded = true;
            }
            return treeModel;
          },
          {
            idToNode: {},
            parentChildMap: new Map(),
          } as TreeModel,
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
  const parentNode = hierarchyPart.parent ? model.idToNode[hierarchyPart.parent.id] : undefined;
  if (parentNode && isModelNode(parentNode)) {
    parentNode.isExpanded = true;
  }
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

  return [{ id: currNode.id, nodeData: currNode.nodeData }, ...currentChildren.flatMap((child) => collectNodes(child, model, pred))];
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

class NoopHierarchyLoader implements IHierarchyLoader {
  public getNodes(_parent: NodeIdentifier | undefined, _shouldLoadChildren: (node: HierarchyNode) => boolean): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }

  public reloadNodes(_options: { expandedNodes: NodeIdentifier[]; collapsedNodes: NodeIdentifier[] }): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }
}

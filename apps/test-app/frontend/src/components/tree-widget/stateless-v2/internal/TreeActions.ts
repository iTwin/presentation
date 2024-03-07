/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { Draft, enableMapSet, produce } from "immer";
import { EMPTY, Observable, reduce, Subject, takeUntil } from "rxjs";
import { assert } from "@itwin/core-bentley";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider, ParentHierarchyNode } from "@itwin/presentation-hierarchy-builder";
import { PresentationHierarchyNode, PresentationTreeNode } from "../Types";
import { createNodeId, HierarchyLoader, IHierarchyLoader, LoadedHierarchyPart } from "./TreeLoader";
import {
  addHierarchyPart,
  expandNode,
  isTreeModelHierarchyNode,
  isTreeModelInfoNode,
  removeSubTree,
  TreeModel,
  TreeModelHierarchyNode,
  TreeModelNode,
  TreeModelRootNode,
} from "./TreeModel";

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
  private _currentModel: TreeModel = { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } };
  private _disposed = new Subject<void>();

  constructor(private _updater: (actionOrValue: TreeState | ((initialState: TreeState) => TreeState)) => void) {
    this._loader = new NoopHierarchyLoader();
  }

  private produceModel(seed: TreeModel, actionOrModel: ((model: Draft<TreeModel>) => void) | TreeModel) {
    if (typeof actionOrModel === "function") {
      return produce(seed, actionOrModel);
    }
    return actionOrModel;
  }

  private updateTreeModel(actionOrModel: ((model: Draft<TreeModel>) => void) | TreeModel) {
    const newModel = this.produceModel(this._currentModel, actionOrModel);
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

  private handleLoadedHierarchy(parentId: string | undefined, loadedHierarchy: TreeModel) {
    this.updateTreeModel((model) => {
      addHierarchyPart(model, parentId, loadedHierarchy);
      const node = parentId !== undefined ? model.idToNode.get(parentId) : undefined;
      if (node && isTreeModelHierarchyNode(node)) {
        node.isLoading = false;
      }
    });
  }

  private getNodeInstanceFilter(node: TreeModelHierarchyNode<ParentHierarchyNode> | TreeModelRootNode) {
    if (node.nodeData && HierarchyNode.isGroupingNode(node.nodeData)) {
      if (node.nodeData.nonGroupingAncestor) {
        const ancestorId = createNodeId(node.nodeData.nonGroupingAncestor);
        const ancestorModelNode = this._currentModel.idToNode.get(ancestorId);
        assert(!!ancestorModelNode && !isTreeModelInfoNode(ancestorModelNode));
        return ancestorModelNode?.instanceFilter;
      }
      return this._currentModel.rootNode.instanceFilter;
    }
    return node.instanceFilter;
  }

  private loadNodes(parentId: string | undefined) {
    const parentNode = parentId ? this._currentModel.idToNode.get(parentId) : this._currentModel.rootNode;
    if (!parentNode || (parentNode.id !== undefined && !isTreeModelHierarchyNode(parentNode))) {
      return;
    }

    this._loader
      .getNodes(
        parentNode,
        (node) => this.getNodeInstanceFilter(node),
        (node) => !!node.nodeData.autoExpand,
      )
      .pipe(collectHierarchyPartsUntil(this._disposed))
      .subscribe({
        next: (loadedHierarchy) => {
          this.handleLoadedHierarchy(parentId, loadedHierarchy);
        },
      });
  }

  public dispose() {
    this._disposed.next();
  }

  public setHierarchyProvider(provider?: HierarchyProvider) {
    this._loader = provider ? new HierarchyLoader(provider) : new NoopHierarchyLoader();
  }

  public getNode(nodeId: string | undefined): TreeModelHierarchyNode | TreeModelRootNode | undefined {
    if (!nodeId) {
      return this._currentModel.rootNode;
    }
    const node = this._currentModel.idToNode.get(nodeId);
    return node && isTreeModelHierarchyNode(node) ? node : undefined;
  }

  public selectNode(nodeId: string, isSelected: boolean) {
    this.updateTreeModel((model) => {
      const modelNode = model.idToNode.get(nodeId);
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
      const modelNode = model.idToNode.get(nodeId);
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

      const modelNode = model.idToNode.get(nodeId);
      if (modelNode && isTreeModelHierarchyNode(modelNode)) {
        modelNode.hierarchyLimit = limit;
        modelNode.isLoading = true;
      }
    });

    this.loadNodes(nodeId);
  }

  public setInstanceFilter(nodeId: string | undefined, filter?: GenericInstanceFilter) {
    this.updateTreeModel((model) => {
      if (nodeId === undefined) {
        model.rootNode.instanceFilter = filter;
        return;
      }

      const modelNode = model.idToNode.get(nodeId);
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

  public reloadTree(parentId: string | undefined, options?: { discardState?: boolean }) {
    const oldModel = this._currentModel;
    const expandedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === true);
    const collapsedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === false);
    const getInstanceFilter = !!options?.discardState
      ? () => undefined
      : (node: TreeModelRootNode | TreeModelHierarchyNode<ParentHierarchyNode>) => this.getNodeInstanceFilter(node);
    const buildNode = !!options?.discardState ? (node: TreeModelHierarchyNode) => node : (node: TreeModelHierarchyNode) => addAttributes(node, oldModel);

    const rootNode = parentId !== undefined ? this.getNode(parentId) : oldModel.rootNode;
    if (!rootNode) {
      return;
    }

    if (parentId === undefined) {
      // cancel all ongoing requests
      this._disposed.next();
      this._updater((state) => ({ ...state, isLoading: true }));
    }

    this._loader
      .reloadNodes(rootNode, { expandedNodes, collapsedNodes, getInstanceFilter, buildNode })
      .pipe(collectHierarchyPartsUntil(this._disposed, !!options?.discardState ? undefined : { ...oldModel.rootNode }))
      .subscribe({
        next: (newModel) => {
          this.handleLoadedHierarchy(parentId, newModel);
        },
      });
  }
}

function collectHierarchyPartsUntil(untilNotifier: Observable<void>, rootNode?: TreeModelRootNode) {
  return (source: Observable<LoadedHierarchyPart>) =>
    source.pipe(
      takeUntil(untilNotifier),
      reduce<LoadedHierarchyPart, TreeModel>(
        (treeModel, loadedPart) => {
          addNodesToModel(treeModel, loadedPart);
          return treeModel;
        },
        {
          idToNode: new Map(),
          parentChildMap: new Map(),
          rootNode: rootNode ?? { id: undefined, nodeData: undefined },
        },
      ),
    );
}

function addNodesToModel(model: TreeModel, hierarchyPart: LoadedHierarchyPart) {
  model.parentChildMap.set(
    hierarchyPart.parentId,
    hierarchyPart.loadedNodes.map((node) => node.id),
  );
  for (const node of hierarchyPart.loadedNodes) {
    model.idToNode.set(node.id, node);
  }
  const parentNode = hierarchyPart.parentId ? model.idToNode.get(hierarchyPart.parentId) : undefined;
  if (parentNode && isTreeModelHierarchyNode(parentNode)) {
    parentNode.isExpanded = true;
  }
}

function addAttributes(node: TreeModelHierarchyNode, oldModel: TreeModel) {
  const oldNode = oldModel.idToNode.get(node.id);
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

  const currNode = model.idToNode.get(parentId);
  if (!currNode || !isTreeModelHierarchyNode(currNode) || !pred(currNode)) {
    return [];
  }

  return [currNode, ...currentChildren.flatMap((child) => collectNodes(child, model, pred))];
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
      if (!isTreeModelHierarchyNode(node)) {
        return {
          id: node.id,
          parentNodeId,
          type: node.type,
          message: node.message,
        };
      }

      const children = generateTreeStructure(node.id, model);
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
    isFilterable: !HierarchyNode.isGroupingNode(node.nodeData) && !!node.nodeData.supportsFiltering && node.children,
    isFiltered: !!node.instanceFilter,
    extendedData: node.nodeData.extendedData,
  };
}

class NoopHierarchyLoader implements IHierarchyLoader {
  public getNodes(): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }

  public reloadNodes(): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }
}

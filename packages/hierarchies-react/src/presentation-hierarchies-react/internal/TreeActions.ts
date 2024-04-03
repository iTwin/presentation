/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Draft, enableMapSet, produce } from "immer";
import { EMPTY, Observable, reduce, Subject, takeUntil } from "rxjs";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { HierarchyLoader, IHierarchyLoader, LoadedHierarchyPart } from "./TreeLoader";
import { isTreeModelHierarchyNode, isTreeModelInfoNode, TreeModel, TreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./TreeModel";
import { createNodeId } from "./Utils";

enableMapSet();

/** @internal */
export class TreeActions {
  private _loader: IHierarchyLoader;
  private _currentModel: TreeModel = { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } };
  private _disposed = new Subject<void>();

  constructor(
    private _onModelChanged: (model: TreeModel) => void,
    private _onBeforeReload: () => void,
    seed?: TreeModel,
  ) {
    this._loader = new NoopHierarchyLoader();
    this._currentModel = seed ?? /* istanbul ignore next */ {
      idToNode: new Map(),
      parentChildMap: new Map(),
      rootNode: { id: undefined, nodeData: undefined },
    };
  }

  private updateTreeModel(updater: (model: Draft<TreeModel>) => void) {
    const newModel = produce(this._currentModel, updater);
    if (this._currentModel === newModel) {
      return;
    }

    this._currentModel = newModel;
    this._onModelChanged(this._currentModel);
  }

  private handleLoadedHierarchy(parentId: string | undefined, loadedHierarchy: TreeModel) {
    this.updateTreeModel((model) => {
      TreeModel.addHierarchyPart(model, parentId, loadedHierarchy);
    });
  }

  private loadNodes(parentId: string | undefined, ignoreCache?: boolean) {
    const parentNode = parentId ? this._currentModel.idToNode.get(parentId) : this._currentModel.rootNode;
    // istanbul ignore if
    if (!parentNode || (parentNode.id !== undefined && !isTreeModelHierarchyNode(parentNode))) {
      return;
    }

    this._loader
      .getNodes(
        parentNode,
        (node) => getNodeInstanceFilter(this._currentModel, getFilteredNodeId(node)),
        (node) => !!node.nodeData.autoExpand,
        ignoreCache,
      )
      .pipe(collectHierarchyPartsUntil(this._disposed))
      .subscribe({
        next: (loadedHierarchy) => {
          this.handleLoadedHierarchy(parentId, loadedHierarchy);
        },
      });
  }

  // istanbul ignore next
  public dispose() {
    this._disposed.next();
  }

  public setHierarchyProvider(provider?: HierarchyProvider) {
    this._loader = provider ? new HierarchyLoader(provider) : /* istanbul ignore next */ new NoopHierarchyLoader();
  }

  public getNode(nodeId: string | undefined): TreeModelNode | TreeModelRootNode | undefined {
    return TreeModel.getNode(this._currentModel, nodeId);
  }

  public selectNode(nodeId: string, isSelected: boolean) {
    this.updateTreeModel((model) => {
      TreeModel.selectNode(model, nodeId, isSelected);
    });
  }

  public expandNode(nodeId: string, isExpanded: boolean) {
    let childrenAction: ReturnType<typeof TreeModel.expandNode> = "none";
    this.updateTreeModel((model) => {
      childrenAction = TreeModel.expandNode(model, nodeId, isExpanded);
    });

    if (childrenAction === "none") {
      return;
    }

    this.loadNodes(nodeId, childrenAction === "reloadChildren");
  }

  public setHierarchyLimit(nodeId: string | undefined, limit?: number | "unbounded") {
    let loadChildren = false;
    this.updateTreeModel((model) => {
      loadChildren = TreeModel.setHierarchyLimit(model, nodeId, limit);
    });

    if (!loadChildren) {
      return;
    }

    this.loadNodes(nodeId);
  }

  public setInstanceFilter(nodeId: string | undefined, filter?: GenericInstanceFilter) {
    const oldModel = this._currentModel;
    let loadChildren = false;
    this.updateTreeModel((model) => {
      loadChildren = TreeModel.setInstanceFilter(model, nodeId, filter);
    });

    if (!loadChildren) {
      return;
    }

    this.reloadTree(nodeId, { oldModel });
  }

  public reloadTree(parentId: string | undefined, options?: { discardState?: boolean; oldModel?: TreeModel }) {
    const oldModel = options?.oldModel ?? this._currentModel;
    const currModel = this._currentModel;
    const expandedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === true);
    const collapsedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === false);
    const getInstanceFilter = !!options?.discardState
      ? () => undefined
      : (node: TreeModelRootNode | TreeModelHierarchyNode) => {
          const filteredNodeId = getFilteredNodeId(node);
          return getNodeInstanceFilter(filteredNodeId === parentId ? currModel : oldModel, filteredNodeId);
        };
    const buildNode = (node: TreeModelHierarchyNode) => (!!options?.discardState || node.id === parentId ? node : addAttributes(node, oldModel));

    const rootNode = parentId !== undefined ? this.getNode(parentId) : currModel.rootNode;
    if (!rootNode || isTreeModelInfoNode(rootNode)) {
      return;
    }

    if (parentId === undefined) {
      // cancel all ongoing requests
      this._disposed.next();
      this._onBeforeReload();
    }

    this._loader
      .reloadNodes(rootNode, { expandedNodes, collapsedNodes, getInstanceFilter, buildNode })
      .pipe(collectHierarchyPartsUntil(this._disposed, !!options?.discardState ? undefined : { ...currModel.rootNode }))
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

function getFilteredNodeId(node: TreeModelHierarchyNode | TreeModelRootNode) {
  if (!node.nodeData || !HierarchyNode.isGroupingNode(node.nodeData)) {
    return node.id;
  }

  if (!node.nodeData.nonGroupingAncestor) {
    return undefined;
  }

  return createNodeId(node.nodeData.nonGroupingAncestor);
}

function getNodeInstanceFilter(model: TreeModel, nodeId: string | undefined) {
  if (nodeId === undefined) {
    return model.rootNode.instanceFilter;
  }

  const modelNode = model.idToNode.get(nodeId);
  if (!modelNode || isTreeModelInfoNode(modelNode)) {
    return undefined;
  }
  return modelNode.instanceFilter;
}

// istanbul ignore next
class NoopHierarchyLoader implements IHierarchyLoader {
  public getNodes(): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }

  public reloadNodes(): Observable<LoadedHierarchyPart> {
    return EMPTY;
  }
}

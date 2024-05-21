/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Draft, enableMapSet, produce } from "immer";
import { EMPTY, Observable, reduce, Subject, takeUntil } from "rxjs";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { SelectionChangeType } from "../UseSelectionHandler";
import { HierarchyLevelOptions, ITreeLoader, LoadedTreePart, TreeLoader } from "./TreeLoader";
import { isTreeModelHierarchyNode, isTreeModelInfoNode, TreeModel, TreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./TreeModel";
import { createNodeId, sameNodes } from "./Utils";

enableMapSet();

/** @internal */
export class TreeActions {
  private _loader: ITreeLoader;
  private _currentModel: TreeModel;
  private _disposed = new Subject<void>();

  constructor(
    private _onModelChanged: (model: TreeModel) => void,
    seed?: TreeModel,
  ) {
    this._loader = new NoopTreeLoader();
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

  private loadNodes(parentId: string, ignoreCache?: boolean) {
    const parentNode = this._currentModel.idToNode.get(parentId);
    // istanbul ignore if
    if (!parentNode || !isTreeModelHierarchyNode(parentNode)) {
      return;
    }

    this._loader
      .loadNodes({
        parent: parentNode,
        getHierarchyLevelOptions: (node) => createHierarchyLevelOptions(this._currentModel, getNonGroupedParentId(node)),
        shouldLoadChildren: (node) => !!node.nodeData.autoExpand,
        ignoreCache,
      })
      .pipe(collectTreePartsUntil(this._disposed))
      .subscribe({
        next: (loadedHierarchy) => {
          this.handleLoadedHierarchy(parentId, loadedHierarchy);
        },
      });
  }

  private reloadSubTree(parentId: string | undefined, oldModel: TreeModel, options?: { discardState?: boolean }) {
    const currModel = this._currentModel;
    const expandedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === true);
    const collapsedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === false);
    const getHierarchyLevelOptions = (node: TreeModelRootNode | TreeModelHierarchyNode) => {
      if (!!options?.discardState) {
        return { instanceFilter: undefined, hierarchyLevelSizeLimit: undefined };
      }
      const filteredNodeId = getNonGroupedParentId(node);
      return createHierarchyLevelOptions(filteredNodeId === parentId ? currModel : oldModel, filteredNodeId);
    };
    const shouldLoadChildren = (node: TreeModelHierarchyNode) => {
      if (expandedNodes.findIndex((expandedNode) => sameNodes(expandedNode.nodeData, node.nodeData)) !== -1) {
        return true;
      }
      if (collapsedNodes.findIndex((collapsedNode) => sameNodes(collapsedNode.nodeData, node.nodeData)) !== -1) {
        return false;
      }
      return !!node.nodeData.autoExpand;
    };
    const buildNode = (node: TreeModelHierarchyNode) => (!!options?.discardState || node.id === parentId ? node : addAttributes(node, oldModel));

    const rootNode = parentId !== undefined ? this.getNode(parentId) : currModel.rootNode;
    // istanbul ignore if
    if (!rootNode || isTreeModelInfoNode(rootNode)) {
      return;
    }

    if (parentId === undefined) {
      // cancel all ongoing requests
      this._disposed.next();
    }

    this._loader
      .loadNodes({ parent: rootNode, getHierarchyLevelOptions, shouldLoadChildren, buildNode })
      .pipe(collectTreePartsUntil(this._disposed, !!options?.discardState ? undefined : { ...currModel.rootNode }))
      .subscribe({
        next: (newModel) => {
          this.handleLoadedHierarchy(parentId, newModel);
        },
      });
  }

  public dispose() {
    this._disposed.next();
  }

  public setHierarchyProvider(provider?: HierarchyProvider) {
    this._loader = provider ? new TreeLoader(provider) : /* istanbul ignore next */ new NoopTreeLoader();
  }

  public getNode(nodeId: string | undefined): TreeModelNode | TreeModelRootNode | undefined {
    return TreeModel.getNode(this._currentModel, nodeId);
  }

  public selectNodes(nodeIds: Array<string>, changeType: SelectionChangeType) {
    this.updateTreeModel((model) => {
      TreeModel.selectNodes(model, nodeIds, changeType);
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
    const oldModel = this._currentModel;
    let loadChildren = false;
    this.updateTreeModel((model) => {
      loadChildren = TreeModel.setHierarchyLimit(model, nodeId, limit);
    });

    if (!loadChildren) {
      return;
    }

    this.reloadSubTree(nodeId, oldModel);
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

    this.reloadSubTree(nodeId, oldModel);
  }

  public reloadTree(options?: { discardState?: boolean }) {
    const oldModel = this._currentModel;
    this.updateTreeModel((model) => {
      model.rootNode.isLoading = true;
    });

    this.reloadSubTree(undefined, oldModel, { ...options });
  }
}

function collectTreePartsUntil(untilNotifier: Observable<void>, rootNode?: TreeModelRootNode) {
  return (source: Observable<LoadedTreePart>) =>
    source.pipe(
      takeUntil(untilNotifier),
      reduce<LoadedTreePart, TreeModel>(
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

function addNodesToModel(model: TreeModel, hierarchyPart: LoadedTreePart) {
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

function getNonGroupedParentId(node: TreeModelHierarchyNode | TreeModelRootNode) {
  if (!node.nodeData || !HierarchyNode.isGroupingNode(node.nodeData)) {
    return node.id;
  }

  if (!node.nodeData.nonGroupingAncestor) {
    return undefined;
  }

  return createNodeId(node.nodeData.nonGroupingAncestor);
}

function createHierarchyLevelOptions(model: TreeModel, nodeId: string | undefined): HierarchyLevelOptions {
  if (nodeId === undefined) {
    return { instanceFilter: model.rootNode.instanceFilter, hierarchyLevelSizeLimit: model.rootNode.hierarchyLimit };
  }

  const modelNode = model.idToNode.get(nodeId);
  if (!modelNode || isTreeModelInfoNode(modelNode)) {
    return { instanceFilter: undefined, hierarchyLevelSizeLimit: undefined };
  }
  return { instanceFilter: modelNode.instanceFilter, hierarchyLevelSizeLimit: modelNode.hierarchyLimit };
}

// istanbul ignore next
class NoopTreeLoader implements ITreeLoader {
  public loadNodes(): Observable<LoadedTreePart> {
    return EMPTY;
  }
}

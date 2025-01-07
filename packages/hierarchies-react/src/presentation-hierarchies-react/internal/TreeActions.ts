/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./DisposePolyfill.js";
import { Draft, enableMapSet, produce } from "immer";
import { EMPTY, Observable, reduce, Subject, takeUntil } from "rxjs";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { SelectionChangeType } from "../UseSelectionHandler.js";
import { HierarchyLevelOptions, ITreeLoader, LoadedTreePart, LoadNodesOptions, TreeLoader } from "./TreeLoader.js";
import { isTreeModelHierarchyNode, isTreeModelInfoNode, TreeModel, TreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./TreeModel.js";
import { createNodeId, sameNodes } from "./Utils.js";

enableMapSet();

/** @internal */
export class TreeActions {
  private _loader: ITreeLoader;
  private _nodeIdFactory: (node: Pick<HierarchyNode, "key" | "parentKeys">) => string;
  private _currentModel: TreeModel;
  private _reset = new Subject<void>();

  constructor(
    private _onModelChanged: (model: TreeModel) => void,
    private _onLoad: (actionType: "initial-load" | "hierarchy-level-load" | "reload", duration: number) => void,
    private _onHierarchyLimitExceeded: (props: { parentId?: string; filter?: GenericInstanceFilter; limit?: number | "unbounded" }) => void,
    private _onHierarchyLoadError: (props: { parentId?: string; type: "timeout" | "unknown"; error: unknown }) => void,
    nodeIdFactory?: (node: Pick<HierarchyNode, "key" | "parentKeys">) => string,
    seed?: TreeModel,
  ) {
    this._loader = new NoopTreeLoader();
    this._nodeIdFactory = nodeIdFactory ?? createNodeId;
    this._currentModel = seed ?? /* c8 ignore next */ {
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

  private onLoadingComplete(parentId: string | undefined) {
    this.updateTreeModel((model) => {
      TreeModel.setIsLoading(model, parentId, false);
    });
  }

  private getLoadAction(parentId: string | undefined) {
    return this._currentModel.idToNode.size === 0 ? "initial-load" : parentId === undefined ? "reload" : "hierarchy-level-load";
  }

  private loadSubTree(options: LoadNodesOptions, initialRootNode?: TreeModelRootNode) {
    const loadAction = this.getLoadAction(options.parent.id);
    const timeTracker = new TimeTracker((time) => this._onLoad(loadAction, time));
    const parentId = options.parent.id;
    this._loader
      .loadNodes(options)
      .pipe(collectTreePartsUntil(this._reset, initialRootNode))
      .subscribe({
        next: (newModel) => {
          const childNodes = newModel.parentChildMap.get(parentId);
          const firstChildNode = childNodes?.length ? newModel.idToNode.get(childNodes[0]) : undefined;
          this.handleLoadedHierarchy(parentId, newModel);
          // only report load duration if no error occurs
          if (!(firstChildNode && isTreeModelInfoNode(firstChildNode))) {
            timeTracker.finish();
          }
        },
        complete: () => {
          this.onLoadingComplete(parentId);
          timeTracker[Symbol.dispose]();
        },
      });
  }

  private loadNodes(parentId: string, ignoreCache?: boolean) {
    const parentNode = this._currentModel.idToNode.get(parentId);
    /* c8 ignore next 3 */
    if (!parentNode || !isTreeModelHierarchyNode(parentNode)) {
      return;
    }

    this.loadSubTree({
      parent: parentNode,
      getHierarchyLevelOptions: (node) => createHierarchyLevelOptions(this._currentModel, getNonGroupedParentId(node, this._nodeIdFactory)),
      shouldLoadChildren: (node) => !!node.nodeData.autoExpand,
      ignoreCache,
    });
  }

  private reloadSubTree(parentId: string | undefined, oldModel: TreeModel, options?: { discardState?: boolean; ignoreCache?: boolean }) {
    const currModel = this._currentModel;
    const expandedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === true);
    const collapsedNodes = !!options?.discardState ? [] : collectNodes(parentId, oldModel, (node) => node.isExpanded === false);
    const getHierarchyLevelOptions = (node: TreeModelRootNode | TreeModelHierarchyNode) => {
      if (!!options?.discardState) {
        return { instanceFilter: undefined, hierarchyLevelSizeLimit: undefined };
      }
      const filteredNodeId = getNonGroupedParentId(node, this._nodeIdFactory);
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
    /* c8 ignore next 3 */
    if (!rootNode || isTreeModelInfoNode(rootNode)) {
      return;
    }

    if (parentId === undefined) {
      // cancel all ongoing requests
      this._reset.next();
    }

    this.loadSubTree(
      { parent: rootNode, getHierarchyLevelOptions, shouldLoadChildren, buildNode, ignoreCache: options?.ignoreCache },
      !!options?.discardState ? undefined : { ...currModel.rootNode },
    );
  }

  public reset() {
    this._reset.next();
  }

  public setHierarchyProvider(provider?: HierarchyProvider) {
    this._loader = provider
      ? new TreeLoader(
          provider,
          this._onHierarchyLimitExceeded,
          ({ parentId, type, error }) => {
            if (type === "timeout") {
              const loadAction = this.getLoadAction(parentId);
              this._onLoad(loadAction, Number.MAX_SAFE_INTEGER);
            }
            this._onHierarchyLoadError({ parentId, type, error });
          },
          this._nodeIdFactory,
        )
      : /* c8 ignore next */ new NoopTreeLoader();
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

  public reloadTree(options?: { parentNodeId?: string; state?: "keep" | "discard" | "reset" }) {
    const oldModel = this._currentModel;
    this.updateTreeModel((model) => {
      TreeModel.setIsLoading(model, options?.parentNodeId, true);
      if (options?.state === "reset") {
        TreeModel.removeSubTree(model, options?.parentNodeId);
      }
    });

    const discardState = options?.state === "discard" || options?.state === "reset";
    const ignoreCache = options?.state === "reset";
    this.reloadSubTree(options?.parentNodeId, oldModel, { discardState, ignoreCache });
  }
}

function collectTreePartsUntil(untilNotifier: Observable<void>, rootNode?: TreeModelRootNode) {
  return (source: Observable<LoadedTreePart>) =>
    source.pipe(
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
      takeUntil(untilNotifier),
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

function getNonGroupedParentId(node: TreeModelHierarchyNode | TreeModelRootNode, nodeIdFactory: (node: Pick<HierarchyNode, "key" | "parentKeys">) => string) {
  if (!node.nodeData || !HierarchyNode.isGroupingNode(node.nodeData)) {
    return node.id;
  }

  if (!node.nodeData.nonGroupingAncestor) {
    return undefined;
  }

  return nodeIdFactory(node.nodeData.nonGroupingAncestor);
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

/* c8 ignore start */
class NoopTreeLoader implements ITreeLoader {
  public loadNodes(): Observable<LoadedTreePart> {
    return EMPTY;
  }
}
/* c8 ignore end */

class TimeTracker {
  private _start: number;
  private _stopped: boolean = false;

  constructor(private _onFinish: (time: number) => void) {
    this._start = Date.now();
  }

  public [Symbol.dispose]() {
    this._stopped = true;
  }

  public finish() {
    /* c8 ignore next 3 */
    if (this._stopped) {
      return;
    }

    this._stopped = true;
    const elapsedTime = Date.now() - this._start;
    this._onFinish(elapsedTime);
  }
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { Observable } from "rxjs/internal/Observable";
import { concat } from "rxjs/internal/observable/concat";
import { defer } from "rxjs/internal/observable/defer";
import { EMPTY } from "rxjs/internal/observable/empty";
import { from } from "rxjs/internal/observable/from";
import { concatMap } from "rxjs/internal/operators/concatMap";
import { endWith } from "rxjs/internal/operators/endWith";
import { expand } from "rxjs/internal/operators/expand";
import { filter } from "rxjs/internal/operators/filter";
import { ignoreElements } from "rxjs/internal/operators/ignoreElements";
import { map } from "rxjs/internal/operators/map";
import { mergeMap } from "rxjs/internal/operators/mergeMap";
import { take } from "rxjs/internal/operators/take";
import { tap } from "rxjs/internal/operators/tap";
import {
  computeVisibleNodes,
  isTreeModelNode,
  isTreeModelNodePlaceholder,
  PagedTreeNodeLoader,
  RenderedItemsRange,
  TreeModel,
  TreeModelNode,
  TreeModelNodePlaceholder,
  TreeModelRootNode,
  TreeModelSource,
  TreeNodeLoadResult,
  VisibleTreeNodes,
} from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider.js";
import { toRxjsObservable } from "../Utils.js";

/**
 * Creates a new tree model from scratch while attempting to match provided tree model's expanded structure.
 * @param treeModel Previous tree model.
 * @param dataProvider Tree node provider.
 * @param pageSize Data provider's page size.
 * @param itemsRange Range describing rendered items that are visible.
 * @returns An observable which will emit a new [TreeModelSource]($components-react) and complete.
 * @internal
 */
export function reloadTree(
  treeModel: TreeModel,
  dataProvider: IPresentationTreeDataProvider,
  pageSize: number,
  itemsRange?: RenderedItemsRange,
): Observable<TreeModelSource> {
  const modelSource = new TreeModelSource();
  const nodeLoader = new TreeReloader(dataProvider, modelSource, pageSize, treeModel, itemsRange);
  return nodeLoader.reloadTree().pipe(endWith(modelSource));
}

class TreeReloader extends PagedTreeNodeLoader<IPresentationTreeDataProvider> {
  public constructor(
    dataProvider: IPresentationTreeDataProvider,
    modelSource: TreeModelSource,
    pageSize: number,
    private previousTreeModel: TreeModel,
    private itemsRange?: RenderedItemsRange,
  ) {
    super(dataProvider, modelSource, pageSize);
  }

  public reloadTree(): Observable<never> {
    const previouslyExpandedNodes = collectExpandedNodes(undefined, this.previousTreeModel);
    return concat(
      // We need to know root node count before continuing
      this.loadNode(this.modelSource.getModel().getRootNode(), 0),
      this.reloadPreviouslyExpandedNodes(previouslyExpandedNodes),
      this.reloadVisibleNodes(),
    ).pipe(ignoreElements());
  }

  private reloadPreviouslyExpandedNodes(previouslyExpandedNodes: ExpandedNode[]) {
    return from(previouslyExpandedNodes).pipe(
      // Process expanded nodes recursively, breadth first
      expand((expandedNode) => {
        const node = this.modelSource.getModel().getNode(expandedNode.id);
        if (node !== undefined) {
          // The expanded node is already loaded in the new tree model, now load and expand its children recursively
          return concat(this.loadChildren(node), expandedNode.expandedChildren);
        }

        // The expanded node is either not loaded yet, or does not exist in the new tree hierarchy
        const parentNode = getTreeNode(this.modelSource.getModel(), expandedNode.parentId);
        if (parentNode === undefined || parentNode.numChildren === undefined) {
          // Cannot determine sibling count. Assume parent is missing from the new tree or something went wrong.
          return EMPTY;
        }

        if (parentNode.numChildren === 0) {
          // Parent node no longer has any children, thus we will not find the expanded node
          return EMPTY;
        }

        // Try to make the expanded node appear in the new tree hierarchy. Test three locations: at, a page before,
        // and a page after previous known location.

        // TODO: We should keep a list of nodes that we failed to find. There is a chance that we will load them
        // accidentally while searching for other expanded nodes under the same parent.
        return from([
          Math.min(expandedNode.index, parentNode.numChildren - 1),
          Math.min(Math.max(0, expandedNode.index - this.pageSize), parentNode.numChildren - 1),
          Math.min(expandedNode.index + this.pageSize, parentNode.numChildren - 1),
        ]).pipe(
          // For each guess, load the corresponding page
          concatMap((index) => this.loadNode(parentNode, index)),
          // Stop making guesses when the node is found
          map(() => this.modelSource.getModel().getNode(expandedNode.id)),
          filter((loadedNode) => loadedNode !== undefined),
          take(1),
          // If the node is found, load and expand its children recursively
          concatMap((loadedNode) => {
            assert(loadedNode !== undefined);
            return concat(this.loadChildren(loadedNode), expandedNode.expandedChildren);
          }),
        );
      }),
    );
  }

  private reloadVisibleNodes() {
    return defer(() => {
      // if visible range is not provided do not load any more nodes
      if (!this.itemsRange) {
        return EMPTY;
      }

      // collect not loaded (placeholder) nodes that are in visible range
      const visibleNodes = computeVisibleNodes(this.modelSource.getModel());
      const visibleRange = getVisibleRange(this.itemsRange, visibleNodes);
      const notLoadedNode: TreeModelNodePlaceholder[] = [];
      for (let i = visibleRange.start; i <= visibleRange.end; i++) {
        const node = visibleNodes.getAtIndex(i);
        if (!node || !isTreeModelNodePlaceholder(node)) {
          continue;
        }
        notLoadedNode.push(node);
      }

      // load all placeholder nodes in visible range
      return from(notLoadedNode).pipe(
        mergeMap((placeholder) => {
          const parentNode = placeholder.parentId ? this.modelSource.getModel().getNode(placeholder.parentId) : this.modelSource.getModel().getRootNode();
          assert(parentNode !== undefined);
          return toRxjsObservable(super.loadNode(parentNode, placeholder.childIndex));
        }),
      );
    });
  }

  private loadChildren(parentNode: TreeModelNode): Observable<never> {
    // If child count is known, children are already loaded, but we still need to make sure the parent node is expanded
    const sourceObservable = parentNode.numChildren === undefined ? this.loadNode(parentNode, 0) : EMPTY;

    // Load the first page and expand the parent node
    return sourceObservable.pipe(
      ignoreElements(),
      tap({
        // If node loading succeeded, set parent's expansion state to `true`
        complete: () =>
          this.modelSource.modifyModel((model) => {
            const node = model.getNode(parentNode.id);
            assert(node !== undefined);
            if ((node.numChildren ?? 0) > 0) {
              node.isExpanded = true;
            }
          }),
      }),
    );
  }

  /** Only loads the node if it is not present in the tree model already */
  public override loadNode(parent: TreeModelNode | TreeModelRootNode, childIndex: number): Observable<TreeNodeLoadResult> {
    const node = this.modelSource.getModel().getNode(parent.id, childIndex);
    if (isTreeModelNode(node)) {
      return EMPTY;
    }

    return toRxjsObservable(super.loadNode(parent, childIndex));
  }
}

interface ExpandedNode {
  id: string;
  parentId: string | undefined;
  index: number;
  expandedChildren: ExpandedNode[];
}

function collectExpandedNodes(rootNodeId: string | undefined, treeModel: TreeModel): ExpandedNode[] {
  const expandedNodes: ExpandedNode[] = [];
  for (const [nodeId] of treeModel.getChildren(rootNodeId)?.iterateValues() ?? []) {
    const node = treeModel.getNode(nodeId);
    if (isTreeModelNode(node) && node.isExpanded) {
      const index = treeModel.getChildOffset(node.parentId, node.id);
      assert(index !== undefined);
      expandedNodes.push({
        id: node.id,
        parentId: node.parentId,
        index,
        expandedChildren: collectExpandedNodes(node.id, treeModel),
      });
    }
  }

  return expandedNodes;
}

function getTreeNode(treeModel: TreeModel, nodeId: string | undefined): TreeModelNode | TreeModelRootNode | undefined {
  return nodeId === undefined ? treeModel.getRootNode() : treeModel.getNode(nodeId);
}

function getVisibleRange(itemsRange: RenderedItemsRange, visibleNodes: VisibleTreeNodes) {
  if (itemsRange.visibleStopIndex < visibleNodes.getNumNodes()) {
    return { start: itemsRange.visibleStartIndex, end: itemsRange.visibleStopIndex };
  }

  const visibleNodesCount = itemsRange.visibleStopIndex - itemsRange.visibleStartIndex;
  const endPosition = visibleNodes.getNumNodes() - 1;
  const startPosition = endPosition - visibleNodesCount;
  return {
    start: startPosition < 0 ? 0 : startPosition,
    end: endPosition < 0 ? 0 : endPosition,
  };
}

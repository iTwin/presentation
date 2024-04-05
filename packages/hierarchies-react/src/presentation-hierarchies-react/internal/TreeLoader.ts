/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, defer, expand, from, map, mergeMap, Observable, of } from "rxjs";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider, RowsLimitExceededError } from "@itwin/presentation-hierarchies";
import { isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelInfoNode, TreeModelNode, TreeModelRootNode } from "./TreeModel";
import { createNodeId, sameNodes } from "./Utils";

/** @internal */
export interface LoadedTreePart {
  parentId: string | undefined;
  loadedNodes: TreeModelNode[];
}

/** @internal */
export interface ReloadOptions {
  expandedNodes: TreeModelHierarchyNode[];
  collapsedNodes: TreeModelHierarchyNode[];
  getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode) => GenericInstanceFilter | undefined;
  buildNode: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode;
  ignoreCache?: boolean;
}

/** @internal */
export interface ITreeLoader {
  getNodes(
    parent: TreeModelHierarchyNode | TreeModelRootNode,
    getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode) => GenericInstanceFilter | undefined,
    shouldLoadChildren: (node: TreeModelHierarchyNode) => boolean,
    ignoreCache?: boolean,
  ): Observable<LoadedTreePart>;
  reloadNodes(parent: TreeModelHierarchyNode | TreeModelRootNode, options: ReloadOptions): Observable<LoadedTreePart>;
}

/** @internal */
export class TreeLoader implements ITreeLoader {
  constructor(private _hierarchyProvider: HierarchyProvider) {}

  private loadChildren(
    parent: TreeModelHierarchyNode | TreeModelRootNode,
    getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode) => GenericInstanceFilter | undefined,
    buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode,
    ignoreCache?: boolean,
  ) {
    const instanceFilter = getInstanceFilter(parent);
    const infoNodeIdBase = `${parent.id ?? "<root>"}`;

    return defer(async () =>
      this._hierarchyProvider.getNodes({
        parentNode: parent.nodeData,
        hierarchyLevelSizeLimit: parent.hierarchyLimit,
        instanceFilter,
        ignoreCache,
      }),
    ).pipe(
      catchError((err) => {
        const nodeProps = {
          id: `${infoNodeIdBase}-${err.message}`,
          parentId: parent.id,
        };
        if (err instanceof RowsLimitExceededError) {
          return of([{ ...nodeProps, type: "ResultSetTooLarge" as const, message: err.message }]);
        }
        return of([{ ...nodeProps, type: "Unknown" as const, message: "Failed to create hierarchy level" }]);
      }),
      map(
        (childNodes): LoadedTreePart => ({
          parentId: parent.id,
          loadedNodes:
            instanceFilter && childNodes.length === 0
              ? [
                  {
                    id: `${infoNodeIdBase}-no-filter-matches`,
                    parentId: parent.id,
                    type: "NoFilterMatchingNodes" as const,
                    message: "No child nodes match current filter",
                  },
                ]
              : childNodes.map(createTreeModelNodesFactory(buildNode)),
        }),
      ),
    );
  }

  private loadNodes(
    parent: TreeModelHierarchyNode | TreeModelRootNode,
    getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode) => GenericInstanceFilter | undefined,
    shouldLoadChildren: (node: TreeModelHierarchyNode) => boolean,
    buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode,
    ignoreCache?: boolean,
  ) {
    return this.loadChildren(parent, getInstanceFilter, buildNode, ignoreCache).pipe(
      expand((loadedPart) =>
        from(loadedPart.loadedNodes.filter((node): node is TreeModelHierarchyNode => isTreeModelHierarchyNode(node) && shouldLoadChildren(node))).pipe(
          mergeMap((node) => this.loadChildren(node, getInstanceFilter, buildNode, ignoreCache)),
        ),
      ),
    );
  }

  public getNodes(
    parent: TreeModelHierarchyNode | TreeModelRootNode,
    getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode) => GenericInstanceFilter | undefined,
    shouldLoadChildren: (node: TreeModelHierarchyNode) => boolean,
    ignoreCache?: boolean,
  ) {
    return this.loadNodes(parent, getInstanceFilter, shouldLoadChildren, undefined, ignoreCache);
  }

  public reloadNodes(
    parent: TreeModelHierarchyNode | TreeModelRootNode,
    { expandedNodes, collapsedNodes, getInstanceFilter, buildNode, ignoreCache }: ReloadOptions,
  ) {
    return this.loadNodes(
      parent,
      getInstanceFilter,
      (node: TreeModelHierarchyNode) => {
        if (expandedNodes.findIndex((expandedNode) => sameNodes(expandedNode.nodeData, node.nodeData)) !== -1) {
          return true;
        }
        if (collapsedNodes.findIndex((collapsedNode) => sameNodes(collapsedNode.nodeData, node.nodeData)) !== -1) {
          return false;
        }
        return !!node.nodeData.autoExpand;
      },
      buildNode,
      ignoreCache,
    );
  }
}

function createTreeModelNodesFactory(
  buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode,
): (node: TreeModelInfoNode | HierarchyNode) => TreeModelNode {
  return (node: TreeModelInfoNode | HierarchyNode) => {
    if (!isHierarchyNode(node)) {
      return node;
    }

    const modelNode: TreeModelHierarchyNode = {
      id: createNodeId(node),
      children: node.children,
      label: node.label,
      nodeData: node,
    };
    return buildNode ? buildNode(modelNode) : modelNode;
  };
}

function isHierarchyNode(node: TreeModelInfoNode | HierarchyNode): node is HierarchyNode {
  return "key" in node && node.key !== undefined;
}

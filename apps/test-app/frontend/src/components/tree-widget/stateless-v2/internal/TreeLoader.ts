/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, defer, expand, from, map, mergeMap, Observable, of } from "rxjs";
import {
  GenericInstanceFilter,
  HierarchyNode,
  HierarchyNodeKey,
  HierarchyProvider,
  ParentHierarchyNode,
  RowsLimitExceededError,
} from "@itwin/presentation-hierarchy-builder";
import { isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelInfoNode, TreeModelNode, TreeModelRootNode } from "./TreeModel";

/** @internal */
export interface LoadedHierarchyPart {
  parentId: string | undefined;
  loadedNodes: TreeModelNode[];
}

/** @internal */
export interface ReloadOptions {
  expandedNodes: TreeModelHierarchyNode[];
  collapsedNodes: TreeModelHierarchyNode[];
  getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode<ParentHierarchyNode>) => GenericInstanceFilter | undefined;
  buildNode: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode;
}

/** @internal */
export interface IHierarchyLoader {
  getNodes(
    parent: TreeModelHierarchyNode<ParentHierarchyNode> | TreeModelRootNode,
    getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode<ParentHierarchyNode>) => GenericInstanceFilter | undefined,
    shouldLoadChildren: (node: TreeModelHierarchyNode<ParentHierarchyNode>) => boolean,
  ): Observable<LoadedHierarchyPart>;
  reloadNodes(parent: TreeModelHierarchyNode<ParentHierarchyNode> | TreeModelRootNode, options: ReloadOptions): Observable<LoadedHierarchyPart>;
}

/** @internal */
export class HierarchyLoader implements IHierarchyLoader {
  constructor(private _hierarchyProvider: HierarchyProvider) {}

  private loadChildren(
    parent: TreeModelHierarchyNode<ParentHierarchyNode> | TreeModelRootNode,
    getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode<ParentHierarchyNode>) => GenericInstanceFilter | undefined,
    buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode,
  ) {
    return defer(async () =>
      this._hierarchyProvider.getNodes({
        parentNode: parent.nodeData,
        hierarchyLevelSizeLimit: parent.hierarchyLimit,
        instanceFilter: getInstanceFilter(parent),
      }),
    ).pipe(
      catchError((err) => {
        if (err instanceof RowsLimitExceededError) {
          const node: TreeModelInfoNode = {
            id: `${parent.id ?? ""}-${err.message}`,
            parentId: parent.id,
            type: "ResultSetTooLarge",
            message: err.message,
          };
          return of([node]);
        }
        throw err;
      }),
      map(
        (childNodes): LoadedHierarchyPart => ({
          parentId: parent.id,
          loadedNodes: childNodes.map(createTreeModelNodesFactory(buildNode)),
        }),
      ),
    );
  }

  private loadNodes(
    parent: TreeModelHierarchyNode<ParentHierarchyNode> | TreeModelRootNode,
    getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode<ParentHierarchyNode>) => GenericInstanceFilter | undefined,
    shouldLoadChildren: (node: TreeModelHierarchyNode<ParentHierarchyNode>) => boolean,
    buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode,
  ) {
    return this.loadChildren(parent, getInstanceFilter, buildNode).pipe(
      expand((loadedPart) =>
        from(loadedPart.loadedNodes.filter((node): node is TreeModelHierarchyNode => isTreeModelHierarchyNode(node) && shouldLoadChildren(node))).pipe(
          mergeMap((node) => this.loadChildren(node, getInstanceFilter, buildNode)),
        ),
      ),
    );
  }

  public getNodes(
    parent: TreeModelHierarchyNode<ParentHierarchyNode> | TreeModelRootNode,
    getInstanceFilter: (node: TreeModelRootNode | TreeModelHierarchyNode<ParentHierarchyNode>) => GenericInstanceFilter | undefined,
    shouldLoadChildren: (node: TreeModelHierarchyNode<ParentHierarchyNode>) => boolean,
  ) {
    return this.loadNodes(parent, getInstanceFilter, shouldLoadChildren);
  }

  public reloadNodes(
    parent: TreeModelHierarchyNode<ParentHierarchyNode> | TreeModelRootNode,
    { expandedNodes, collapsedNodes, getInstanceFilter, buildNode }: ReloadOptions,
  ) {
    return this.loadNodes(
      parent,
      getInstanceFilter,
      (node: TreeModelHierarchyNode<ParentHierarchyNode>) => {
        if (expandedNodes.findIndex((expandedNode) => sameNodes(expandedNode.nodeData, node.nodeData)) !== -1) {
          return true;
        }
        if (collapsedNodes.findIndex((collapsedNode) => sameNodes(collapsedNode.nodeData, node.nodeData)) !== -1) {
          return false;
        }
        return !!node.nodeData.autoExpand;
      },
      buildNode,
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

export function createNodeId(node: Pick<HierarchyNode, "key" | "parentKeys">) {
  return [...node.parentKeys.map(serializeNodeKey), serializeNodeKey(node.key)].join(",");
}

export function serializeNodeKey(key: HierarchyNodeKey): string {
  return HierarchyNodeKey.isCustom(key) ? key : convertObjectValuesToString(key);
}

function convertObjectValuesToString(obj: object): string {
  return Object.entries(obj)
    .map(([, value]) => {
      if (typeof value === "object") {
        return convertObjectValuesToString(value);
      }
      return String(value);
    })
    .join(",");
}

function sameNodes(lhs: ParentHierarchyNode, rhs: ParentHierarchyNode): boolean {
  if (HierarchyNodeKey.compare(lhs.key, rhs.key) !== 0) {
    return false;
  }

  if (lhs.parentKeys.length !== rhs.parentKeys.length) {
    return false;
  }

  for (let i = lhs.parentKeys.length - 1; i >= 0; --i) {
    if (HierarchyNodeKey.compare(lhs.parentKeys[i], rhs.parentKeys[i]) !== 0) {
      return false;
    }
  }
  return true;
}

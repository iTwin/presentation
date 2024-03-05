/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, defer, expand, from, map, mergeMap, Observable, of } from "rxjs";
import { omit } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyNodeKey, HierarchyProvider, ParentNodeKey, RowsLimitExceededError } from "@itwin/presentation-hierarchy-builder";
import { isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelInfoNode, TreeModelNode, TreeModelRootNode } from "./TreeModel";

/** @internal */
export interface LoadedHierarchyPart {
  parent: TreeModelHierarchyNode | TreeModelRootNode;
  loadedNodes: TreeModelNode[];
}

/** @internal */
export interface ReloadOptions {
  expandedNodes: TreeModelHierarchyNode[];
  collapsedNodes: TreeModelHierarchyNode[];
  buildNode: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode;
}

/** @internal */
export interface IHierarchyLoader {
  getNodes(parent: TreeModelHierarchyNode | TreeModelRootNode, shouldLoadChildren: (node: TreeModelHierarchyNode) => boolean): Observable<LoadedHierarchyPart>;
  reloadNodes(parent: TreeModelHierarchyNode | TreeModelRootNode, options: ReloadOptions): Observable<LoadedHierarchyPart>;
}

/** @internal */
export class HierarchyLoader implements IHierarchyLoader {
  constructor(private _hierarchyProvider: HierarchyProvider) {}

  private loadChildren(parent: TreeModelHierarchyNode | TreeModelRootNode, buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode) {
    return defer(async () =>
      this._hierarchyProvider.getNodes({
        parentNode: parent?.nodeData,
        hierarchyLevelSizeLimit: parent?.hierarchyLimit,
        instanceFilter: parent?.instanceFilter,
      }),
    ).pipe(
      catchError((err) => {
        if (err instanceof RowsLimitExceededError) {
          const node: TreeModelInfoNode = {
            id: `${parent?.id ?? ""}-${err.message}`,
            parentId: parent?.id,
            type: "ResultSetTooLarge",
            message: err.message,
          };
          return of([node]);
        }
        throw err;
      }),
      map(
        (childNodes): LoadedHierarchyPart => ({
          parent,
          loadedNodes: childNodes.map(createTreeModelNodesFactory(buildNode)),
        }),
      ),
    );
  }

  private loadNodes(
    parent: TreeModelHierarchyNode | TreeModelRootNode,
    shouldLoadChildren: (node: TreeModelHierarchyNode) => boolean,
    buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode,
  ) {
    return this.loadChildren(parent, buildNode).pipe(
      expand((loadedPart) =>
        from(loadedPart.loadedNodes.filter((node): node is TreeModelHierarchyNode => isTreeModelHierarchyNode(node) && shouldLoadChildren(node))).pipe(
          mergeMap((node) => this.loadChildren(node, buildNode)),
        ),
      ),
    );
  }

  public getNodes(parent: TreeModelHierarchyNode | TreeModelRootNode, shouldLoadChildren: (node: TreeModelHierarchyNode) => boolean) {
    return this.loadNodes(parent, shouldLoadChildren);
  }

  public reloadNodes(parent: TreeModelHierarchyNode | TreeModelRootNode, { expandedNodes, collapsedNodes, buildNode }: ReloadOptions) {
    return this.loadNodes(
      parent,
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

function createNodeId(node: HierarchyNode) {
  return [
    ...node.parentKeys.map((key) => (typeof key === "string" ? key : convertObjectValuesToString(key))),
    HierarchyNodeKey.isCustom(node.key)
      ? node.key
      : HierarchyNodeKey.isInstances(node.key)
        ? convertObjectValuesToString(node.key)
        : convertObjectValuesToString(omit(node.key, ["groupedInstanceKeys"])),
  ].join(",");
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

function sameNodes(lhs: HierarchyNode, rhs: HierarchyNode): boolean {
  if (ParentNodeKey.compare(lhs.key, rhs.key) !== 0) {
    return false;
  }

  if (lhs.parentKeys.length !== rhs.parentKeys.length) {
    return false;
  }

  for (let i = lhs.parentKeys.length - 1; i >= 0; --i) {
    if (ParentNodeKey.compare(lhs.parentKeys[i], rhs.parentKeys[i]) !== 0) {
      return false;
    }
  }
  return true;
}

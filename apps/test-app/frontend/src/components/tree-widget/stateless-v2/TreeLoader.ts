/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { catchError, defer, expand, from, map, mergeMap, Observable, of } from "rxjs";
import { omit } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyNodeKey, HierarchyProvider, ParentNodeKey, RowsLimitExceededError } from "@itwin/presentation-hierarchy-builder";
import { InfoNode, isModelNode, ModelNode, NodeIdentifier, RootNode, TreeNode } from "./TreeModel";

export interface LoadedHierarchyPart {
  parent: NodeIdentifier | RootNode;
  loadedNodes: TreeNode[];
}

export interface IHierarchyLoader {
  getNodes(parent: NodeIdentifier | RootNode, shouldLoadChildren: (node: HierarchyNode) => boolean): Observable<LoadedHierarchyPart>;
  reloadNodes(options: {
    expandedNodes: NodeIdentifier[];
    collapsedNodes: NodeIdentifier[];
    buildNode: (node: ModelNode) => ModelNode;
  }): Observable<LoadedHierarchyPart>;
}

export class HierarchyLoader implements IHierarchyLoader {
  constructor(private _hierarchyProvider: HierarchyProvider) {}

  private loadChildren(parent: NodeIdentifier | RootNode, buildNode?: (node: ModelNode) => ModelNode) {
    return defer(async () =>
      this._hierarchyProvider.getNodes({
        parentNode: parent?.nodeData,
        hierarchyLevelSizeLimit: parent?.hierarchyLimit,
        instanceFilter: parent?.instanceFilter,
      }),
    ).pipe(
      catchError((err) => {
        if (err instanceof RowsLimitExceededError) {
          return of({
            id: `${parent?.id ?? ""}-${err.message}`,
            parentId: parent?.id,
            type: "ResultSetTooLarge",
            message: err.message,
          } as InfoNode);
        }
        throw err;
      }),
      map(
        (childNodes): LoadedHierarchyPart => ({
          parent,
          loadedNodes: Array.isArray(childNodes)
            ? childNodes.map(createBaseModelNode).map((node: ModelNode) => (buildNode ? buildNode(node) : node))
            : [childNodes],
        }),
      ),
    );
  }

  private loadNodes(parent: NodeIdentifier | RootNode, shouldLoadChildren: (node: HierarchyNode) => boolean, buildNode?: (node: ModelNode) => ModelNode) {
    return this.loadChildren(parent, buildNode).pipe(
      expand((loadedPart) =>
        from(loadedPart.loadedNodes.filter((node): node is ModelNode => isModelNode(node) && shouldLoadChildren(node.nodeData))).pipe(
          mergeMap((node) => this.loadChildren(node, buildNode)),
        ),
      ),
    );
  }

  public getNodes(parent: NodeIdentifier | RootNode, shouldLoadChildren: (node: HierarchyNode) => boolean) {
    return this.loadNodes(parent, shouldLoadChildren);
  }

  public reloadNodes({
    expandedNodes,
    collapsedNodes,
    buildNode,
  }: {
    expandedNodes: NodeIdentifier[];
    collapsedNodes: NodeIdentifier[];
    buildNode: (node: ModelNode) => ModelNode;
  }) {
    return this.loadNodes(
      { id: undefined, nodeData: undefined },
      (node: HierarchyNode) => {
        if (expandedNodes.findIndex((expandedNode) => sameNodes(expandedNode.nodeData, node)) !== -1) {
          return true;
        }
        if (collapsedNodes.findIndex((collapsedNode) => sameNodes(collapsedNode.nodeData, node)) !== -1) {
          return false;
        }
        return !!node.autoExpand;
      },
      buildNode,
    );
  }
}

function createBaseModelNode(hierarchyNode: HierarchyNode): ModelNode {
  return {
    id: createNodeId(hierarchyNode),
    children: hierarchyNode.children,
    label: hierarchyNode.label,
    nodeData: hierarchyNode,
  };
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

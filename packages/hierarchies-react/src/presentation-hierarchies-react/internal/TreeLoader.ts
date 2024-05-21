/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, expand, from, map, mergeMap, Observable, of, toArray } from "rxjs";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider, RowsLimitExceededError } from "@itwin/presentation-hierarchies";
import { isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelInfoNode, TreeModelNode, TreeModelRootNode } from "./TreeModel";
import { createNodeId } from "./Utils";

/** @internal */
export interface LoadedTreePart {
  parentId: string | undefined;
  loadedNodes: TreeModelNode[];
}

/** @internal */
export interface HierarchyLevelOptions {
  instanceFilter?: GenericInstanceFilter;
  hierarchyLevelSizeLimit?: number | "unbounded";
}

export interface LoadNodesOptions {
  parent: TreeModelHierarchyNode | TreeModelRootNode;
  getHierarchyLevelOptions: (node: TreeModelRootNode | TreeModelHierarchyNode) => HierarchyLevelOptions;
  shouldLoadChildren: (node: TreeModelHierarchyNode) => boolean;
  buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode;
  ignoreCache?: boolean;
}

/** @internal */
export interface ITreeLoader {
  loadNodes(options: LoadNodesOptions): Observable<LoadedTreePart>;
}

/** @internal */
export class TreeLoader implements ITreeLoader {
  constructor(private _hierarchyProvider: HierarchyProvider) {}

  private loadChildren({ parent, getHierarchyLevelOptions, buildNode, ignoreCache }: Omit<LoadNodesOptions, "shouldLoadChildren">) {
    const { instanceFilter, hierarchyLevelSizeLimit } = getHierarchyLevelOptions(parent);
    const infoNodeIdBase = `${parent.id ?? "<root>"}`;
    const treeModelNodesFactory = createTreeModelNodesFactory(buildNode);
    return from(
      this._hierarchyProvider.getNodes({
        parentNode: parent.nodeData,
        hierarchyLevelSizeLimit,
        instanceFilter,
        ignoreCache,
      }),
    ).pipe(
      toArray(),
      catchError((err) => {
        const nodeProps = {
          id: `${infoNodeIdBase}-${err.message}`,
          parentId: parent.id,
        };
        if (err instanceof RowsLimitExceededError) {
          return of([{ ...nodeProps, type: "ResultSetTooLarge" as const, resultSetSizeLimit: err.limit }]);
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
              : childNodes.map(treeModelNodesFactory),
        }),
      ),
    );
  }

  public loadNodes({ shouldLoadChildren, ...options }: LoadNodesOptions) {
    return this.loadChildren(options).pipe(
      expand((loadedPart) =>
        from(loadedPart.loadedNodes.filter((node): node is TreeModelHierarchyNode => isTreeModelHierarchyNode(node) && shouldLoadChildren(node))).pipe(
          mergeMap((node) => this.loadChildren({ ...options, parent: node })),
        ),
      ),
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

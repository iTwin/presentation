/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, EMPTY, expand, filter, from, map, mergeMap, of, toArray } from "rxjs";
import { createNodeId } from "./Utils.js";

import type { Observable } from "rxjs";
import type { GenericInstanceFilter, HierarchyNode, HierarchyProvider, RowsLimitExceededError } from "@itwin/presentation-hierarchies";
import type { ErrorInfo } from "../TreeNode.js";
import type { TreeModelHierarchyNode, TreeModelRootNode } from "./TreeModel.js";

/** @internal */
export type LoadedTreePart = {
  parent: TreeModelHierarchyNode | TreeModelRootNode;
} & (
  | {
      loadedNodes: TreeModelHierarchyNode[];
    }
  | {
      error: ErrorInfo;
    }
);

/** @internal */
export interface HierarchyLevelOptions {
  instanceFilter?: GenericInstanceFilter;
  hierarchyLevelSizeLimit?: number | "unbounded";
}

/** @internal */
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
  private _treeNodeIdFactory: (node: Pick<HierarchyNode, "key" | "parentKeys">) => string;

  constructor(
    private _hierarchyProvider: HierarchyProvider,
    private _onHierarchyLimitExceeded: (props: { parentId?: string; filter?: GenericInstanceFilter; limit?: number | "unbounded" }) => void,
    private _onHierarchyLoadError: (props: { parentId?: string; type: "timeout" | "unknown"; error: unknown }) => void,
    treeNodeIdFactory?: (node: Pick<HierarchyNode, "key" | "parentKeys">) => string,
  ) {
    this._treeNodeIdFactory = treeNodeIdFactory ?? /* c8 ignore next */ createNodeId;
  }

  private loadChildren({ parent, getHierarchyLevelOptions, buildNode, ignoreCache }: Omit<LoadNodesOptions, "shouldLoadChildren">) {
    const { instanceFilter, hierarchyLevelSizeLimit } = getHierarchyLevelOptions(parent);
    const infoNodeIdBase = `${parent.id ?? "<root>"}`;
    const treeModelNodesFactory = createTreeModelNodesFactory({ buildNode, treeNodeIdFactory: this._treeNodeIdFactory });
    return from(
      this._hierarchyProvider.getNodes({
        parentNode: parent.nodeData,
        hierarchyLevelSizeLimit,
        instanceFilter,
        ignoreCache,
      }),
    ).pipe(
      toArray(),
      map((childNodes): LoadedTreePart => {
        return instanceFilter && childNodes.length === 0
          ? {
              parent,
              error: {
                id: `${infoNodeIdBase}-no-filter-matches`,
                type: "NoFilterMatches" as const,
              },
            }
          : {
              parent,
              loadedNodes: childNodes.map(treeModelNodesFactory),
            };
      }),
      catchError((err) => {
        let hierarchyLoadErrorType: "unknown" | "timeout" = "unknown";
        if (err instanceof Error) {
          if (isRowsLimitError(err)) {
            this._onHierarchyLimitExceeded({ parentId: parent.id, filter: instanceFilter, limit: err.limit });
            return of({
              parent,
              error: { id: `${infoNodeIdBase}-${err.message}`, type: "ResultSetTooLarge" as const, resultSetSizeLimit: err.limit },
            });
          }
          if (isTimeoutError(err)) {
            hierarchyLoadErrorType = "timeout";
          }
        }

        this._onHierarchyLoadError({ parentId: parent.id, type: hierarchyLoadErrorType, error: err });
        return of({
          parent,
          error: {
            id: `${infoNodeIdBase}-ChildrenLoad`,
            type: "ChildrenLoad" as const,
            message: "Failed to create hierarchy level",
          },
        });
      }),
    );
  }

  public loadNodes({ shouldLoadChildren, ...options }: LoadNodesOptions) {
    return this.loadChildren(options).pipe(
      expand((loadedPart) =>
        "loadedNodes" in loadedPart
          ? from(loadedPart.loadedNodes).pipe(
              filter((node) => shouldLoadChildren(node)),
              mergeMap((node) => this.loadChildren({ ...options, parent: node })),
            )
          : EMPTY,
      ),
    );
  }
}

function createTreeModelNodesFactory({
  buildNode,
  treeNodeIdFactory,
}: {
  buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode;
  treeNodeIdFactory: (node: Pick<HierarchyNode, "key" | "parentKeys">) => string;
}): (node: HierarchyNode) => TreeModelHierarchyNode {
  return (node: HierarchyNode) => {
    const modelNode: TreeModelHierarchyNode = {
      id: treeNodeIdFactory(node),
      children: node.children,
      label: node.label,
      nodeData: node,
    };
    return buildNode ? buildNode(modelNode) : modelNode;
  };
}

function isRowsLimitError(error: Error): error is RowsLimitExceededError {
  return "limit" in error && error.message.includes("Query rows limit of");
}

function isTimeoutError(error: Error) {
  return error.message.includes("query too long to execute or server is too busy");
}

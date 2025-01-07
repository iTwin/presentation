/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { catchError, expand, from, map, mergeMap, Observable, of, toArray } from "rxjs";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider, RowsLimitExceededError } from "@itwin/presentation-hierarchies";
import { isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelInfoNode, TreeModelNode, TreeModelRootNode } from "./TreeModel.js";
import { createNodeId } from "./Utils.js";

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
      catchError((err) => {
        const nodeProps = {
          id: `${infoNodeIdBase}-Unknown`,
          parentId: parent.id,
        };
        let hierarchyLoadErrorType: "unknown" | "timeout" = "unknown";
        if (err instanceof Error) {
          nodeProps.id = `${infoNodeIdBase}-${err.message}`;
          if (isRowsLimitError(err)) {
            this._onHierarchyLimitExceeded({ parentId: parent.id, filter: instanceFilter, limit: err.limit });
            return of([{ ...nodeProps, type: "ResultSetTooLarge" as const, resultSetSizeLimit: err.limit }]);
          }
          if (isTimeoutError(err)) {
            hierarchyLoadErrorType = "timeout";
          }
        }

        this._onHierarchyLoadError({ parentId: parent.id, type: hierarchyLoadErrorType, error: err });
        return of([
          {
            ...nodeProps,
            type: "Unknown" as const,
            message: "Failed to create hierarchy level",
          },
        ]);
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
                    type: "NoFilterMatches" as const,
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

function createTreeModelNodesFactory({
  buildNode,
  treeNodeIdFactory,
}: {
  buildNode?: (node: TreeModelHierarchyNode) => TreeModelHierarchyNode;
  treeNodeIdFactory: (node: Pick<HierarchyNode, "key" | "parentKeys">) => string;
}): (node: TreeModelInfoNode | HierarchyNode) => TreeModelNode {
  return (node: TreeModelInfoNode | HierarchyNode) => {
    if (!isHierarchyNode(node)) {
      return node;
    }

    const modelNode: TreeModelHierarchyNode = {
      id: treeNodeIdFactory(node),
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

function isRowsLimitError(error: Error): error is RowsLimitExceededError {
  const asRowsError = error as RowsLimitExceededError;
  return asRowsError.limit !== undefined && asRowsError.message.includes("Query rows limit of");
}

function isTimeoutError(error: Error) {
  return error.message.includes("query too long to execute or server is too busy");
}

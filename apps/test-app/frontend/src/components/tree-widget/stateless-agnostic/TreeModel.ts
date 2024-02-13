/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { Guid } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { from, map, mergeMap, Subject, Subscription } from "rxjs";

export interface PresentationNodeKey {
  id: string;
  nodeData: HierarchyNode;
}

export interface ModelNode extends PresentationNodeKey {
  label: string;
  children: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
}

export interface TreeModel {
  parentChildMap: Map<string | undefined, string[]>;
  idToNode: { [id: string]: ModelNode };
}

export class HierarchyLoader {
  private _loader = new Subject<PresentationNodeKey | undefined>();
  private _subscription: Subscription;

  constructor(
    private _hierarchyProvider: HierarchyProvider,
    private _onLoad: (parentNode: PresentationNodeKey | undefined, loadedNodes: ModelNode[]) => void,
  ) {
    this._subscription = this._loader
      .pipe(
        mergeMap((parentNode) => {
          return from(this._hierarchyProvider.getNodes({ parentNode: parentNode?.nodeData })).pipe(
            map((childNodes) => {
              return { parentNode, loadedNodes: childNodes.map(createLoadedNode) };
            }),
          );
        }, 2),
      )
      .subscribe({
        next: ({ parentNode, loadedNodes }) => {
          this._onLoad(parentNode, loadedNodes);
          for (const node of loadedNodes) {
            if (node.isExpanded) {
              this.loadNode(node);
            }
          }
        },
      });
  }

  public dispose() {
    this._subscription.unsubscribe();
  }

  public loadNode(parent: PresentationNodeKey | undefined) {
    this._loader.next(parent);
  }
}

function createLoadedNode(hierarchyNode: HierarchyNode): ModelNode {
  const id = Guid.createValue();
  return {
    id,
    children: hierarchyNode.children,
    label: hierarchyNode.label,
    isExpanded: hierarchyNode.autoExpand,
    nodeData: hierarchyNode,
    isLoading: hierarchyNode.children && !!hierarchyNode.autoExpand,
  };
}

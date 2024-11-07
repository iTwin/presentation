/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useCallback } from "react";
import { Subject, takeUntil, tap } from "rxjs";
import {
  AbstractTreeNodeLoaderWithProvider,
  MutableTreeModel,
  MutableTreeModelNode,
  TreeEditingParams,
  TreeEventHandler,
  TreeModelChanges,
  TreeNodeItem,
  TreeSelectionModificationEventArgs,
  TreeSelectionReplacementEventArgs,
} from "@itwin/components-react";
import { Guid, IDisposable } from "@itwin/core-bentley";
import { useDisposable } from "@itwin/core-react";
import { Keys, KeySet, NodeKey } from "@itwin/presentation-common";
import { Presentation, SelectionChangeEventArgs, SelectionChangeType, SelectionHelper } from "@itwin/presentation-frontend";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider.js";
import { isPresentationTreeNodeItem } from "../PresentationTreeNodeItem.js";
import { toRxjsObservable } from "../Utils.js";

/**
 * Data structure that describes parameters for UnifiedSelectionTreeEventHandler
 * @public
 */
export interface UnifiedSelectionTreeEventHandlerParams {
  /** Node loader used to load children when node is expanded. */
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;

  /**
   * Unique name for SelectionHandler to avoid handling events raised by itself. The
   * name is created if not provided.
   */
  name?: string;

  /** Specifies whether children should be disposed when parent node is collapsed or not. */
  collapsedChildrenDisposalEnabled?: boolean;

  /** Parameters used for node editing. */
  editingParams?: TreeEditingParams;
}

/**
 * Tree event handler that handles unified selection.
 * Extends wrapped tree event handler's functionality by adding, removing or replacing nodes in
 * unified selection. It also reacts to unified selection changes and selects/deselects tree nodes
 * according changes.
 *
 * **Note:** conditions used to determine if node is selected and nodes that should be added to
 * unified selection can be controlled by overriding 'shouldSelectNode' and 'createKeysForSelection' methods.
 *
 * @public
 */
export class UnifiedSelectionTreeEventHandler extends TreeEventHandler implements IDisposable {
  #dataProvider: IPresentationTreeDataProvider;
  #selectionSourceName: string;
  #listeners: Array<() => void> = [];
  #cancelled = new Subject<void>();

  constructor(params: UnifiedSelectionTreeEventHandlerParams) {
    super({
      ...params,
      modelSource: params.nodeLoader.modelSource,
    });
    this.#dataProvider = params.nodeLoader.dataProvider;
    this.#selectionSourceName = params.name ?? `Tree_${this.#dataProvider.rulesetId}_${Guid.createValue()}`;
    this.#listeners.push(Presentation.selection.selectionChange.addListener((args) => this.onSelectionChanged(args)));
    this.#listeners.push(this.modelSource.onModelChanged.addListener((args) => this.selectNodes(args[1])));
    this.selectNodes();
  }

  public override dispose() {
    super.dispose();
    this.#cancelled.next();
    this.#listeners.forEach((dispose) => dispose());
  }

  public override onSelectionModified({ modifications }: TreeSelectionModificationEventArgs) {
    const withUnifiedSelection = toRxjsObservable(modifications).pipe(
      takeUntil(this.#cancelled),
      tap({
        next: ({ selectedNodeItems, deselectedNodeItems }) => {
          if (selectedNodeItems.length !== 0) {
            this.addToSelection(selectedNodeItems);
          }
          if (deselectedNodeItems.length !== 0) {
            this.removeFromSelection(deselectedNodeItems);
          }
        },
      }),
    );

    return super.onSelectionModified({ modifications: withUnifiedSelection });
  }

  public override onSelectionReplaced({ replacements }: TreeSelectionReplacementEventArgs) {
    this.#cancelled.next();
    let firstEmission = true;
    const withUnifiedSelection = toRxjsObservable(replacements).pipe(
      takeUntil(this.#cancelled),
      tap({
        next: ({ selectedNodeItems }) => {
          if (selectedNodeItems.length === 0) {
            return;
          }
          if (firstEmission) {
            firstEmission = false;
            this.replaceSelection(selectedNodeItems);
            return;
          }
          this.addToSelection(selectedNodeItems);
        },
      }),
    );

    return super.onSelectionReplaced({ replacements: withUnifiedSelection });
  }

  public selectNodes(modelChange?: TreeModelChanges) {
    // when handling model change event only need to update newly added nodes
    if (modelChange) {
      this.updateAffectedNodes(modelChange);
    } else {
      this.updateAllNodes();
    }
  }

  /** @deprecated in 4.0. Use [[isPresentationTreeNodeItem]] and [[PresentationTreeNodeItem.key]] to get [NodeKey]($presentation-common). */
  /* c8 ignore start */
  protected getNodeKey(node: TreeNodeItem): NodeKey {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return this.#dataProvider.getNodeKey(node);
  }
  /* c8 ignore end */

  /**
   * Determines if node should be selected.
   * Default implementation returns true if node key is in selection
   * or node is ECInstance node and instance key is in selection.
   */
  protected shouldSelectNode(node: TreeNodeItem, selection: Readonly<KeySet>) {
    /* c8 ignore next 3 */
    if (!isPresentationTreeNodeItem(node)) {
      return false;
    }

    // consider node selected if it's key is in selection
    if (selection.has(node.key)) {
      return true;
    }

    // ... or if it's an ECInstances node and any of instance keys is in selection
    if (NodeKey.isInstancesNodeKey(node.key) && node.key.instanceKeys.some((instanceKey) => selection.has(instanceKey))) {
      return true;
    }

    return false;
  }

  /**
   * Returns node keys that should be added, removed or used to replace unified selection.
   * Default implementation returns keys of supplied nodes.
   */
  protected createKeysForSelection(nodes: TreeNodeItem[], _selectionType: SelectionChangeType) {
    return this.getKeys(nodes);
  }

  protected getKeys(nodes: TreeNodeItem[]): Keys {
    const nodeKeys: NodeKey[] = nodes
      .map((node) => (isPresentationTreeNodeItem(node) ? node.key : /* c8 ignore next */ undefined))
      .filter((key) => key !== undefined) as NodeKey[];
    return SelectionHelper.getKeysForSelection(nodeKeys);
  }

  private addToSelection(nodes: TreeNodeItem[]) {
    Presentation.selection.addToSelection(
      this.#selectionSourceName,
      this.#dataProvider.imodel,
      this.createKeysForSelection(nodes, SelectionChangeType.Add),
      0,
      this.#dataProvider.rulesetId,
    );
  }

  private removeFromSelection(nodes: TreeNodeItem[]) {
    Presentation.selection.removeFromSelection(
      this.#selectionSourceName,
      this.#dataProvider.imodel,
      this.createKeysForSelection(nodes, SelectionChangeType.Remove),
      0,
      this.#dataProvider.rulesetId,
    );
  }

  private replaceSelection(nodes: TreeNodeItem[]) {
    Presentation.selection.replaceSelection(
      this.#selectionSourceName,
      this.#dataProvider.imodel,
      this.createKeysForSelection(nodes, SelectionChangeType.Replace),
      0,
      this.#dataProvider.rulesetId,
    );
  }

  private onSelectionChanged(evt: SelectionChangeEventArgs) {
    if (evt.imodel !== this.#dataProvider.imodel) {
      return;
    }

    if (evt.source !== this.#selectionSourceName && (evt.changeType === SelectionChangeType.Clear || evt.changeType === SelectionChangeType.Replace)) {
      this.#cancelled.next();
    }

    this.selectNodes();
  }

  private updateAllNodes() {
    const selection = Presentation.selection.getSelection(this.#dataProvider.imodel);
    this.modelSource.modifyModel((model: MutableTreeModel) => {
      for (const node of model.iterateTreeModelNodes()) {
        this.updateNodeSelectionState(node, selection);
      }
    });
  }

  private updateAffectedNodes(modelChange: TreeModelChanges) {
    const affectedNodeIds = [...modelChange.addedNodeIds, ...modelChange.modifiedNodeIds];
    if (affectedNodeIds.length === 0) {
      return;
    }

    const selection = Presentation.selection.getSelection(this.#dataProvider.imodel);
    this.modelSource.modifyModel((model: MutableTreeModel) => {
      for (const nodeId of affectedNodeIds) {
        const node = model.getNode(nodeId);
        /* c8 ignore next 3 */
        if (!node) {
          continue;
        }

        this.updateNodeSelectionState(node, selection);
      }
    });
  }

  private updateNodeSelectionState(node: MutableTreeModelNode, selection: Readonly<KeySet>) {
    const shouldBeSelected = this.shouldSelectNode(node.item, selection);
    if (!node.isSelected && shouldBeSelected) {
      node.isSelected = true;
    } else if (node.isSelected && !shouldBeSelected) {
      node.isSelected = false;
    }
  }
}

/**
 * A custom hook which creates and disposes [[UnifiedSelectionTreeEventHandler]]
 * @public
 * @deprecated in 4.x. This hook is not compatible with React 18 `StrictMode`. Use [[usePresentationTreeState]] and
 * [[UsePresentationTreeProps.eventHandlerFactory]] instead or manually create and dispose [[UnifiedSelectionTreeEventHandler]].
 */
export function useUnifiedSelectionTreeEventHandler(props: UnifiedSelectionTreeEventHandlerParams) {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return useDisposable(
    useCallback(
      () => new UnifiedSelectionTreeEventHandler(props),
      Object.values(props) /* eslint-disable-line react-hooks/exhaustive-deps */ /* want to re-create the handler whenever any prop changes */,
    ),
  );
}

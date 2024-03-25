/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useCallback } from "react";
import { takeUntil } from "rxjs/internal/operators/takeUntil";
import { tap } from "rxjs/internal/operators/tap";
import { Subject } from "rxjs/internal/Subject";
import {
  AbstractTreeNodeLoaderWithProvider,
  MutableTreeModel,
  MutableTreeModelNode,
  TreeEditingParams,
  TreeEventHandler,
  TreeModelChanges,
  TreeModelSource,
  TreeNodeItem,
  TreeSelectionModificationEventArgs,
  TreeSelectionReplacementEventArgs,
} from "@itwin/components-react";
import { Guid, IDisposable } from "@itwin/core-bentley";
import { useDisposable } from "@itwin/core-react";
import { Keys, KeySet, NodeKey } from "@itwin/presentation-common";
import { Presentation, SelectionChangeEventArgs, SelectionChangeType, SelectionHandler, SelectionHelper } from "@itwin/presentation-frontend";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";
import { isPresentationTreeNodeItem } from "../PresentationTreeNodeItem";
import { toRxjsObservable } from "../Utils";

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

  /** @internal used for testing */
  selectionHandler?: SelectionHandler;
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
  private _dataProvider: IPresentationTreeDataProvider;
  private _modelSource: TreeModelSource;
  private _selectionSourceName: string;
  private _listeners: Array<() => void> = [];

  private _cancelled = new Subject<void>();

  constructor(params: UnifiedSelectionTreeEventHandlerParams) {
    super({
      ...params,
      modelSource: params.nodeLoader.modelSource,
    });
    this._dataProvider = params.nodeLoader.dataProvider;
    this._modelSource = params.nodeLoader.modelSource;
    this._selectionSourceName = params.name ?? `Tree_${this._dataProvider.rulesetId}_${Guid.createValue()}`;
    this._listeners.push(Presentation.selection.selectionChange.addListener((args) => this.onSelectionChanged(args)));
    this._listeners.push(this._modelSource.onModelChanged.addListener((args) => this.selectNodes(args[1])));
    this.selectNodes();
  }

  public override get modelSource() {
    return this._modelSource;
  }

  public override dispose() {
    super.dispose();
    this._cancelled.next();
    this._listeners.forEach((dispose) => dispose());
  }

  public override onSelectionModified({ modifications }: TreeSelectionModificationEventArgs) {
    const withUnifiedSelection = toRxjsObservable(modifications).pipe(
      takeUntil(this._cancelled),
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
    let firstEmission = true;
    const withUnifiedSelection = toRxjsObservable(replacements).pipe(
      takeUntil(this._cancelled),
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
  // istanbul ignore next
  protected getNodeKey(node: TreeNodeItem): NodeKey {
    // eslint-disable-next-line deprecation/deprecation
    return this._dataProvider.getNodeKey(node);
  }

  /**
   * Determines if node should be selected.
   * Default implementation returns true if node key is in selection
   * or node is ECInstance node and instance key is in selection.
   */
  protected shouldSelectNode(node: TreeNodeItem, selection: Readonly<KeySet>) {
    // istanbul ignore if
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
      .map((node) => (isPresentationTreeNodeItem(node) ? node.key : /* istanbul ignore next */ undefined))
      .filter((key) => key !== undefined) as NodeKey[];
    return SelectionHelper.getKeysForSelection(nodeKeys);
  }

  private addToSelection(nodes: TreeNodeItem[]) {
    Presentation.selection.addToSelection(
      this._selectionSourceName,
      this._dataProvider.imodel,
      this.createKeysForSelection(nodes, SelectionChangeType.Add),
      0,
      this._dataProvider.rulesetId,
    );
  }

  private removeFromSelection(nodes: TreeNodeItem[]) {
    Presentation.selection.removeFromSelection(
      this._selectionSourceName,
      this._dataProvider.imodel,
      this.createKeysForSelection(nodes, SelectionChangeType.Remove),
      0,
      this._dataProvider.rulesetId,
    );
  }

  private replaceSelection(nodes: TreeNodeItem[]) {
    Presentation.selection.replaceSelection(
      this._selectionSourceName,
      this._dataProvider.imodel,
      this.createKeysForSelection(nodes, SelectionChangeType.Replace),
      0,
      this._dataProvider.rulesetId,
    );
  }

  private onSelectionChanged(evt: SelectionChangeEventArgs) {
    if (evt.imodel !== this._dataProvider.imodel) {
      return;
    }

    if (evt.changeType === SelectionChangeType.Clear || evt.changeType === SelectionChangeType.Replace) {
      this._cancelled.next();
    }

    this.selectNodes();
  }

  private updateAllNodes() {
    const selection = Presentation.selection.getSelection(this._dataProvider.imodel);
    this._modelSource.modifyModel((model: MutableTreeModel) => {
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

    const selection = Presentation.selection.getSelection(this._dataProvider.imodel);
    this._modelSource.modifyModel((model: MutableTreeModel) => {
      for (const nodeId of affectedNodeIds) {
        const node = model.getNode(nodeId);
        // istanbul ignore if
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
  // eslint-disable-next-line deprecation/deprecation
  return useDisposable(
    useCallback(
      () => new UnifiedSelectionTreeEventHandler(props),
      Object.values(props) /* eslint-disable-line react-hooks/exhaustive-deps */ /* want to re-create the handler whenever any prop changes */,
    ),
  );
}

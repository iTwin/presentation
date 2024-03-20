/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable as RxjsObservable, Subject, takeUntil, tap } from "rxjs";
import {
  AbstractTreeNodeLoader,
  MutableTreeModel,
  MutableTreeModelNode,
  Observable,
  TreeEventHandler,
  TreeModelChanges,
  TreeModelSource,
  TreeNodeItem,
  TreeSelectionModificationEventArgs,
  TreeSelectionReplacementEventArgs,
} from "@itwin/components-react";
import { Guid, IDisposable } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { GroupingNodeKey, Key, KeySet, PresentationQuery, PresentationQueryBinding, StandardNodeTypes } from "@itwin/presentation-common";
import { Presentation, SelectionChangeEventArgs, SelectionChangeType, SelectionHandler } from "@itwin/presentation-frontend";
import { HierarchyNode, InstanceKey, parseFullClassName } from "@itwin/presentation-hierarchies";
import { getHierarchyNode, serializeNodeKey } from "./TreeNodeItemUtils";

export interface UnifiedSelectionTreeEventHandlerParams {
  /** The iModel whose data is being displayed in the component. */
  imodel: IModelConnection;

  /** Node loader used to load children when node is expanded. */
  nodeLoader: AbstractTreeNodeLoader;

  /** Specifies whether children should be disposed when parent node is collapsed or not. */
  collapsedChildrenDisposalEnabled?: boolean;
}

export class UnifiedSelectionTreeEventHandler extends TreeEventHandler implements IDisposable {
  private _modelSource: TreeModelSource;
  private _selectionHandler: SelectionHandler;
  private _unregisterModelChangedListener: () => void;

  private _cancelled = new Subject<void>();

  constructor(params: UnifiedSelectionTreeEventHandlerParams) {
    super({
      ...params,
      modelSource: params.nodeLoader.modelSource,
    });
    this._modelSource = params.nodeLoader.modelSource;
    this._selectionHandler = new SelectionHandler({
      manager: Presentation.selection,
      name: `StatelessTree_${Guid.createValue()}`,
      imodel: params.imodel,
    });
    this._selectionHandler.onSelect = (args) => this.onSelect(args);
    this._unregisterModelChangedListener = this._modelSource.onModelChanged.addListener((args) => this.selectNodes(args[1]));
    this.selectNodes();
  }

  public override get modelSource() {
    return this._modelSource;
  }

  public override dispose() {
    super.dispose();
    this._cancelled.next();
    this._selectionHandler.dispose();
    this._unregisterModelChangedListener();
  }

  public override onSelectionModified({ modifications }: TreeSelectionModificationEventArgs) {
    const withUnifiedSelection = toRxjsObservable(modifications).pipe(
      takeUntil(this._cancelled),
      tap({
        next: ({ selectedNodeItems, deselectedNodeItems }) => {
          if (selectedNodeItems.length !== 0) {
            this._selectionHandler.addToSelection(this.createKeysForSelection(selectedNodeItems, SelectionChangeType.Add));
          }
          if (deselectedNodeItems.length !== 0) {
            this._selectionHandler.removeFromSelection(this.createKeysForSelection(deselectedNodeItems, SelectionChangeType.Remove));
          }
        },
        complete: () => {
          this.selectNodes();
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
            this._selectionHandler.replaceSelection(this.createKeysForSelection(selectedNodeItems, SelectionChangeType.Replace));
            return;
          }
          this._selectionHandler.addToSelection(this.createKeysForSelection(selectedNodeItems, SelectionChangeType.Add));
        },
        complete: () => {
          this.selectNodes();
        },
      }),
    );

    return super.onSelectionReplaced({ replacements: withUnifiedSelection });
  }

  private selectNodes(modelChange?: TreeModelChanges) {
    const selection = this._selectionHandler.getSelection();

    // when handling model change event only need to update newly added nodes
    if (modelChange) {
      this.updateAffectedNodes(selection, modelChange);
    } else {
      this.updateAllNodes(selection);
    }
  }

  /**
   * Returns node keys that should be added, removed or used to replace unified selection.
   * Default implementation returns keys of supplied nodes.
   */
  protected createKeysForSelection(items: TreeNodeItem[], _selectionType: SelectionChangeType) {
    return items
      .map(getHierarchyNode)
      .filter((n): n is HierarchyNode => !!n)
      .flatMap(getNodeKeys);
  }

  private onSelect(evt: SelectionChangeEventArgs) {
    if (evt.source === this._selectionHandler.name) {
      return;
    }

    if (evt.changeType === SelectionChangeType.Clear || evt.changeType === SelectionChangeType.Replace) {
      this._cancelled.next();
    }

    this.selectNodes();
  }

  private updateAllNodes(selection: Readonly<KeySet>) {
    this._modelSource.modifyModel((model: MutableTreeModel) => {
      for (const node of model.iterateTreeModelNodes()) {
        this.updateNodeSelectionState(node, selection);
      }
    });
  }

  private updateAffectedNodes(selection: Readonly<KeySet>, modelChange: TreeModelChanges) {
    const affectedNodeIds = [...modelChange.addedNodeIds, ...modelChange.modifiedNodeIds];
    if (affectedNodeIds.length === 0) {
      return;
    }

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
    node.isSelected = this.shouldSelectNode(node.item, selection);
  }

  /**
   * Determines if node should be selected.
   * Default implementation returns true if node key is in selection
   * or node is ECInstance node and instance key is in selection.
   */
  protected shouldSelectNode(item: TreeNodeItem, selection: Readonly<KeySet>) {
    const node = getHierarchyNode(item);
    if (node === undefined) {
      return false;
    }

    // consider node selected if it's key is in selection
    return getNodeKeys(node).some((k) => selection.has(k));
  }
}

function getNodeKeys(node: HierarchyNode): Key[] {
  if (HierarchyNode.isCustom(node)) {
    return [
      {
        version: 3,
        type: node.key,
        pathFromRoot: [...node.parentKeys, node.key].map((pk) => JSON.stringify(pk)),
      },
    ];
  }
  if (HierarchyNode.isInstancesNode(node)) {
    return node.key.instanceKeys.map((ik) => {
      const { schemaName, className } = parseFullClassName(ik.className);
      return { className: `${schemaName}:${className}`, id: ik.id };
    });
  }
  if (HierarchyNode.isGroupingNode(node)) {
    return [
      {
        version: 3,
        pathFromRoot: [...node.parentKeys.map(serializeNodeKey), serializeNodeKey(node.key)],
        groupedInstancesCount: node.groupedInstanceKeys.length,
        instanceKeysSelectQuery: createInstanceKeysSelectQuery(node.groupedInstanceKeys),
        ...(() => {
          switch (node.key.type) {
            case "class-grouping":
              return { type: StandardNodeTypes.ECClassGroupingNode, className: node.key.className };
            case "label-grouping":
              return { type: StandardNodeTypes.DisplayLabelGroupingNode, label: node.key.label };
            case "property-grouping:value":
            case "property-grouping:range":
              return { type: StandardNodeTypes.ECPropertyGroupingNode, className: node.key.propertyClassName, propertyName: node.key.propertyName };
            case "property-grouping:other":
              return { type: StandardNodeTypes.ECPropertyGroupingNode };
          }
        })(),
      } as GroupingNodeKey,
    ];
  }
  return [];
}

function createInstanceKeysSelectQuery(keys: InstanceKey[]): PresentationQuery {
  let query = "";
  const bindings: PresentationQueryBinding[] = [];
  new KeySet(keys).instanceKeys.forEach((idsSet, fullClassName) => {
    const { schemaName, className } = parseFullClassName(fullClassName);
    const ids = [...idsSet];
    if (query.length > 0) {
      query += ` UNION ALL `;
    }
    query += `SELECT ECClassId, ECInstanceId FROM [${schemaName}].[${className}] WHERE ECInstanceId IN (${ids.map(() => "?").join(",")})`;
    ids.forEach((id) => bindings.push({ type: "Id" as const, value: id }));
  });
  return { query, bindings };
}

function toRxjsObservable<T>(observable: Observable<T>): RxjsObservable<T> {
  return new RxjsObservable((subscriber) => {
    observable.subscribe(subscriber);
  });
}

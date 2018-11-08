/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module UnifiedSelection */

import * as React from "react";
import { Keys, Subtract } from "@bentley/presentation-common";
import { StandardNodeTypes, ECInstanceNodeKey } from "@bentley/presentation-common/lib/hierarchy/Key";
import { Presentation, SelectionHandler, SelectionChangeEventArgs, ISelectionProvider } from "@bentley/presentation-frontend";
import { TreeNodeItem } from "@bentley/ui-components";
import { TreeProps as TreeProps } from "@bentley/ui-components/lib/tree/component/Tree";
import { getDisplayName } from "../common/Utils";
import IUnifiedSelectionComponent from "../common/IUnifiedSelectionComponent";
import IPresentationTreeDataProvider from "./IPresentationTreeDataProvider";

/**
 * Possible options of what gets put into selection
 * when node is selected
 */
export const enum SelectionTarget {
  /**
   * Node's key is selected
   */
  Node,

  /**
   * If the node is an ECInstanceNode - key of the ECInstance
   * is selected. Otherwise node's key is selected.
   */
  Instance,
}

/**
 * Props that are injected to the HOC component.
 */
export interface Props {
  /** The data provider used by the tree. */
  dataProvider: IPresentationTreeDataProvider;

  /** Defines what gets put into selection when a node is selected */
  selectionTarget?: SelectionTarget;

  /**
   * Called when nodes are selected. The callback should return `true`
   * to continue default handling or `false` otherwise.
   */
  onNodesSelected?: (items: TreeNodeItem[], replace: boolean) => boolean;

  /**
   * Called when nodes are deselected. The callback should return `true`
   * to continue default handling or `false` otherwise.
   */
  onNodesDeselected?: (items: TreeNodeItem[]) => boolean;

  /** @hidden */
  selectionHandler?: SelectionHandler;
}

/**
 * A HOC component that adds unified selection functionality to the supplied
 * tree component.
 *
 * **Note:** it is required for the tree to use [[PresentationTreeDataProvider]]
 */
// tslint:disable-next-line: variable-name naming-convention
export default function withUnifiedSelection<P extends TreeProps>(TreeComponent: React.ComponentType<P>): React.ComponentType<Subtract<P, Props> & Props> {

  type CombinedProps = Subtract<P, Props> & Props;

  return class WithUnifiedSelection extends React.Component<CombinedProps> implements IUnifiedSelectionComponent {

    private _selectionHandler?: SelectionHandler;

    /** Returns the display name of this component */
    public static get displayName() { return `WithUnifiedSelection(${getDisplayName(TreeComponent)})`; }

    /** Get selection handler used by this property grid */
    public get selectionHandler(): SelectionHandler | undefined { return this._selectionHandler; }

    public get imodel() { return this.props.dataProvider.connection; }

    public get rulesetId() { return this.props.dataProvider.rulesetId; }

    // tslint:disable-next-line:naming-convention
    private get baseProps(): TreeProps { return this.props; }

    public componentDidMount() {
      const name = `Tree_${counter++}`;
      const imodel = this.props.dataProvider.connection;
      const rulesetId = this.props.dataProvider.rulesetId;
      this._selectionHandler = this.props.selectionHandler
        ? this.props.selectionHandler : new SelectionHandler(Presentation.selection, name, imodel, rulesetId);
      this._selectionHandler!.onSelect = this.onSelectionChanged;
    }

    public componentWillUnmount() {
      if (this._selectionHandler)
        this._selectionHandler.dispose();
    }

    public componentDidUpdate() {
      if (this._selectionHandler) {
        this._selectionHandler.imodel = this.props.dataProvider.connection;
        this._selectionHandler.rulesetId = this.props.dataProvider.rulesetId;
      }
    }

    // tslint:disable-next-line:naming-convention
    private isNodeSelected = (node: TreeNodeItem): boolean => {
      // give consumers a chance to tell if node is selected
      if (this.baseProps.selectedNodes) {
        if (Array.isArray(this.baseProps.selectedNodes))
          return -1 !== this.baseProps.selectedNodes.indexOf(node.id);
        return this.baseProps.selectedNodes(node);
      }

      if (!this._selectionHandler)
        return false;

      const selection = this._selectionHandler.getSelection();

      // consider node selected if it's key is in selection
      const nodeKey = this.props.dataProvider.getNodeKey(node);
      if (selection.has(nodeKey))
        return true;

      // ... or if it's an ECInstance node and instance key is in selection
      if (nodeKey.type === StandardNodeTypes.ECInstanceNode) {
        const instanceKey = (nodeKey as ECInstanceNodeKey).instanceKey;
        return selection.has(instanceKey);
      }

      return false;
    }

    private getNodeKeys(nodes: TreeNodeItem[]): Keys {
      const nodeKeys = nodes.map((node) => this.props.dataProvider.getNodeKey(node));
      let keys: Keys = nodeKeys;
      if (this.props.selectionTarget === SelectionTarget.Instance) {
        keys = nodeKeys.map((key) => {
          if (key.type === StandardNodeTypes.ECInstanceNode)
            return (key as ECInstanceNodeKey).instanceKey;
          return key;
        });
      }
      return keys;
    }

    // tslint:disable-next-line:naming-convention
    private onNodesSelected = (nodes: TreeNodeItem[], replace: boolean) => {
      // workaround for https://github.com/Microsoft/TypeScript/issues/27201
      const props: Readonly<Props> = this.props;

      // give consumers a chance to handle selection changes and either
      // continue default handling (by returning `true`) or abort (by
      // returning `false`)
      if (props.onNodesSelected && !props.onNodesSelected(nodes, replace))
        return;

      if (!this._selectionHandler)
        return;

      if (replace)
        this._selectionHandler.replaceSelection(this.getNodeKeys(nodes));
      else
        this._selectionHandler.addToSelection(this.getNodeKeys(nodes));
    }

    // tslint:disable-next-line:naming-convention
    private onNodesDeselected = (nodes: TreeNodeItem[]) => {
      // workaround for https://github.com/Microsoft/TypeScript/issues/27201
      const props: Readonly<Props> = this.props;

      // give consumers a chance to handle selection changes and either
      // continue default handling (by returning `true`) or abort (by
      // returning `false`)
      if (props.onNodesDeselected && !props.onNodesDeselected(nodes))
        return;

      if (!this._selectionHandler)
        return;

      this._selectionHandler.removeFromSelection(this.getNodeKeys(nodes));
      // wip: may want to remove both node **and** instance key
    }

    // tslint:disable-next-line:naming-convention
    private onSelectionChanged = (args: SelectionChangeEventArgs, _provider: ISelectionProvider) => {
      if (args.level === 0)
        this.forceUpdate();
    }

    public render() {
      const {
        selectionTarget, selectionHandler, // do not bleed our props
        selectedNodes, onNodesSelected, onNodesDeselected, // take out the props we're overriding
        ...props /* tslint:disable-line: trailing-comma */ // pass-through props
      } = this.props as any;
      return (
        <TreeComponent
          selectedNodes={this.isNodeSelected} onNodesSelected={this.onNodesSelected} onNodesDeselected={this.onNodesDeselected}
          {...props}
        />
      );
    }

  };
}

let counter = 1;

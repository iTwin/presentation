/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tree */

import * as React from "react";
import { Subtract } from "@bentley/presentation-common";
import { DataTreeProps as TreeProps } from "@bentley/ui-components/lib/tree/component/DataTree";
import { getDisplayName } from "../common/Utils";
import IPresentationTreeDataProvider from "./IPresentationTreeDataProvider";
import FilteredPresentationTreeDataProvider from "./FilteredDataProvider";
import "./WithFilteringSupport.scss";

/**
 * Props that are injected to the HOC component.
 */
export interface Props {
  filter?: string;
  /** The data provider used by the tree. */
  dataProvider: IPresentationTreeDataProvider;
  /**
   * Called once filter is applied.
   */
  onFilterApplied?: (filter?: string) => void;
  /**
   * Called once FilteredDataProvider counts how many results there are
   */
  onHighlightedCounted?: (count: number) => void;
  /**
   * Index of current active highlighted node in a filtered tree
   */
  activeHighlightedIndex?: number;
}

interface State {
  filteredDataProvider?: FilteredPresentationTreeDataProvider;
}

const defaultState: State = {
  filteredDataProvider: undefined,
};

/**
 * A HOC component that adds filtering functionality to the supplied
 * tree component.
 *
 * **Note:** it is required for the tree to use [[IPresentationTreeDataProvider]]
 */
// tslint:disable-next-line: variable-name naming-convention
export default function withFilteringSupport<P extends TreeProps>(TreeComponent: React.ComponentType<P>): React.ComponentType<Subtract<P, Props & Pick<TreeProps, "expandedNodes">> & Props> {

  type CombinedProps = Subtract<P, Props & Pick<TreeProps, "expandedNodes">> & Props;

  return class WithFilteringSupport extends React.Component<CombinedProps, State> {
    public static get displayName() { return `WithFilteringSupport(${getDisplayName(TreeComponent)})`; }
    public constructor(props: CombinedProps, context?: any) {
      super(props, context);
      this.state = defaultState;
    }

    public static getDerivedStateFromProps(nextProps: Props, state: State): State {
      if (nextProps.filter === undefined || nextProps.filter === "")
        return defaultState;
      return state;
    }

    public async componentDidUpdate(prevProps: Props, _prevState: State): Promise<void> {
      const nothingChanged = this.areEqual(prevProps, this.props);
      const filterIsEmpty = !this.hasFilter;

      if (nothingChanged || filterIsEmpty) {
        let currentlyLoading = false;
        if (filterIsEmpty)
          currentlyLoading = false;
        else if (!this.state.filteredDataProvider)
          currentlyLoading = true;
        else
          currentlyLoading = !this.areEqual({ dataProvider: this.state.filteredDataProvider, filter: this.state.filteredDataProvider.filter }, this.props);

        if (!currentlyLoading && this.props.onFilterApplied)
          this.props.onFilterApplied(this.props.filter);
        return;
      }

      await this.loadDataProvider(this.props.filter!);
    }

    public async componentDidMount(): Promise<void> {
      if (!this.hasFilter) {
        if (this.props.onFilterApplied)
          this.props.onFilterApplied(this.props.filter);
        return;
      }
      await this.loadDataProvider(this.props.filter!);
    }

    private async loadDataProvider(filter: string): Promise<void> {
      const nodePaths = await this.props.dataProvider.getFilteredNodePaths(filter);
      if (this.props.filter !== filter)
        return;

      const filteredDataProvider = new FilteredPresentationTreeDataProvider(this.props.dataProvider, filter, nodePaths);

      if (this.props.onHighlightedCounted)
        this.props.onHighlightedCounted(filteredDataProvider.countFilteringResults(nodePaths));

      this.setState({ filteredDataProvider });
    }

    // tslint:disable-next-line:naming-convention
    private get hasFilter() {
      return (this.props.filter !== "" && this.props.filter !== undefined);
    }

    private areEqual(prop1: Props, prop2: Props): boolean {
      if (prop1.filter !== prop2.filter)
        return false;

      if (prop1.dataProvider.rulesetId !== prop2.dataProvider.rulesetId || prop1.dataProvider.connection !== prop2.dataProvider.connection)
        return false;

      return true;
    }

    // tslint:disable-next-line:naming-convention
    private get shouldDisplayOverlay() {
      if (this.hasFilter) {
        if (!this.state.filteredDataProvider)
          return true;
        return !this.areEqual({ dataProvider: this.state.filteredDataProvider, filter: this.state.filteredDataProvider.filter }, this.props);
      }
      return false;
    }

    public render() {
      const {
        filter, dataProvider, onFilterApplied,
        ...props /* tslint:disable-line: trailing-comma */
      } = this.props as any;

      const overlay = this.shouldDisplayOverlay ? <div className="filteredTreeOverlay" /> : undefined;
      return (
        <div className="filteredTree">
          <TreeComponent
            dataProvider={this.state.filteredDataProvider ? this.state.filteredDataProvider : this.props.dataProvider}
            expandedNodes={this.state.filteredDataProvider ? this.state.filteredDataProvider.getAllNodeIds() : []}
            nodeHighlightingProps={{
              searchText: this.props.filter,
              activeResultNode: this.state.filteredDataProvider && this.props.activeHighlightedIndex ?
                this.state.filteredDataProvider.getActiveResultNode(this.props.activeHighlightedIndex!) :
                undefined,
            }}
            {...props}
          />
          {overlay}
        </div>
      );
    }

  };
}

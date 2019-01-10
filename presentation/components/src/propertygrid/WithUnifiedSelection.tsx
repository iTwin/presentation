/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module UnifiedSelection */

import * as React from "react";
import { KeySet, Subtract } from "@bentley/presentation-common";
import { Presentation, SelectionHandler, SelectionChangeEventArgs } from "@bentley/presentation-frontend";
import { PropertyGridProps } from "@bentley/ui-components";
import { getDisplayName } from "../common/Utils";
import { IUnifiedSelectionComponent } from "../common/IUnifiedSelectionComponent";
import { IPresentationPropertyDataProvider } from "./DataProvider";

/**
 * Props that are injected to the HOC component.
 */
export interface Props {
  /** The data provider used by the property grid. */
  dataProvider: IPresentationPropertyDataProvider;

  /** @hidden */
  selectionHandler?: SelectionHandler;
}

/**
 * A HOC component that adds unified selection functionality to the supplied
 * property grid component.
 *
 * **Note:** it is required for the property grid to use [[IPresentationPropertyDataProvider]]
 */
// tslint:disable-next-line: variable-name naming-convention
export function propertyGridWithUnifiedSelection<P extends PropertyGridProps>(PropertyGridComponent: React.ComponentType<P>): React.ComponentType<Subtract<P, Props> & Props> {

  type CombinedProps = Subtract<P, Props> & Props;

  return class WithUnifiedSelection extends React.Component<CombinedProps> implements IUnifiedSelectionComponent {

    private _selectionHandler?: SelectionHandler;

    /** Returns the display name of this component */
    public static get displayName() { return `WithUnifiedSelection(${getDisplayName(PropertyGridComponent)})`; }

    /** Get selection handler used by this property grid */
    public get selectionHandler(): SelectionHandler | undefined { return this._selectionHandler; }

    /** Get ID of the ruleset used by this unified selection property grid */
    public get rulesetId() { return this.props.dataProvider.rulesetId; }

    /** Get imodel used by this property grid to query property data */
    public get imodel() { return this.props.dataProvider.imodel; }

    public componentDidMount() {
      const name = `PropertyGrid_${counter++}`;
      const imodel = this.props.dataProvider.imodel;
      const rulesetId = this.props.dataProvider.rulesetId;
      this._selectionHandler = this.props.selectionHandler
        ? this.props.selectionHandler : new SelectionHandler(Presentation.selection, name, imodel, rulesetId);
      this._selectionHandler!.onSelect = this.onSelectionChanged;
      this.updateDataProviderSelection();
    }

    public componentWillUnmount() {
      if (this._selectionHandler)
        this._selectionHandler.dispose();
    }

    public componentDidUpdate() {
      if (this._selectionHandler) {
        this._selectionHandler.imodel = this.props.dataProvider.imodel;
        this._selectionHandler.rulesetId = this.props.dataProvider.rulesetId;
      }
    }

    private getSelectedKeys(selectionLevel?: number): Readonly<KeySet> | undefined {
      if (undefined === selectionLevel) {
        const availableLevels = this._selectionHandler!.getSelectionLevels();
        if (0 === availableLevels.length)
          return undefined;
        selectionLevel = availableLevels[availableLevels.length - 1];
      }

      for (let i = selectionLevel; i >= 0; i--) {
        const selection = this._selectionHandler!.getSelection(i);
        if (!selection.isEmpty)
          return selection;
      }
      return new KeySet();
    }

    private setDataProviderSelection(selection: Readonly<KeySet>): void {
      this.props.dataProvider.keys = selection;
    }

    private updateDataProviderSelection(selectionLevel?: number) {
      const selection = this.getSelectedKeys(selectionLevel);
      if (selection)
        this.setDataProviderSelection(selection);
    }

    // tslint:disable-next-line:naming-convention
    private onSelectionChanged = (evt: SelectionChangeEventArgs): void => {
      this.updateDataProviderSelection(evt.level);
    }

    public render() {
      const {
        selectionHandler, // do not bleed our props
        ...props /* tslint:disable-line: trailing-comma */ // pass-through props
      } = this.props as any;
      return (
        <PropertyGridComponent {...props} />
      );
    }
  };
}

let counter = 1;

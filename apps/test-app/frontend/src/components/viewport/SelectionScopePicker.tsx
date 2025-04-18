/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Component } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import { SelectionScope } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";

/* eslint-disable @typescript-eslint/no-deprecated */

export interface SelectionScopePickerProps {
  imodel: IModelConnection;
}
export interface SelectionScopePickerState {
  availableSelectionScopes?: SelectionScope[];
  activeScopeId?: string;
}
export default class SelectionScopePicker extends Component<SelectionScopePickerProps, SelectionScopePickerState> {
  constructor(props: SelectionScopePickerProps) {
    super(props);
    this.state = {
      activeScopeId:
        typeof Presentation.selection.scopes.activeScope === "string"
          ? Presentation.selection.scopes.activeScope
          : Presentation.selection.scopes.activeScope?.id,
    };
  }
  public override componentDidMount() {
    void this.initAvailableSelectionScopes();
  }
  private async initAvailableSelectionScopes() {
    const scopes = await Presentation.selection.scopes.getSelectionScopes(this.props.imodel);
    // note: the functional selection scope is currently 'hidden' - we need to manually add it here
    scopes.push({ id: "functional-element", label: "Functional Element", description: "Selected associated functional element" });
    scopes.push({ id: "functional-assembly", label: "Functional Assembly", description: "Selected associated functional assembly" });
    scopes.push({ id: "functional-top-assembly", label: "Functional Top Assembly", description: "Selected associated functional top assembly" });
    this.setState({ availableSelectionScopes: scopes });
  }
  public override componentDidUpdate(prevProps: SelectionScopePickerProps, _prevState: SelectionScopePickerState) {
    if (this.props.imodel !== prevProps.imodel) {
      this.setState({ availableSelectionScopes: undefined });
      void this.initAvailableSelectionScopes();
    }
  }
  private onSelectedScopeChanged = (e: React.ChangeEvent<HTMLSelectElement>) => {
    Presentation.selection.scopes.activeScope = e.target.value;
    this.setState({ activeScopeId: e.target.value });
  };
  public override render() {
    if (!this.state.availableSelectionScopes || 0 === this.state.availableSelectionScopes.length) {
      return null;
    }
    return (
      <div className="SelectionScopePicker">
        <select onChange={this.onSelectedScopeChanged} value={this.state.activeScopeId}>
          {this.state.availableSelectionScopes.map((scope: SelectionScope) => (
            <option value={scope.id} key={scope.id}>
              {scope.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
}

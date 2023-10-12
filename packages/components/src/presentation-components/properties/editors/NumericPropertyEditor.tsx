/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef, PureComponent } from "react";
import { PropertyEditorBase, PropertyEditorProps, TypeEditor } from "@itwin/components-react";
import { NumericPropertyInput } from "../inputs/NumericPropertyInput";
import { PropertyEditorAttributes } from "./Common";

/**
 * Name for `NumericPropertyEditor`.
 *
 * @internal
 */
export const NumericEditorName = "presentation-numeric-editor";

/**
 * Editor for numeric properties.
 *
 * @internal
 */
export class NumericPropertyEditorBase extends PropertyEditorBase {
  // istanbul ignore next
  public override get containerHandlesEnter(): boolean {
    return false;
  }

  // istanbul ignore next
  public override get containerStopsKeydownPropagation(): boolean {
    return false;
  }

  // istanbul ignore next
  public override get containerHandlesTab(): boolean {
    return false;
  }

  // istanbul ignore next
  public get reactNode(): React.ReactNode {
    return <NumericPropertyEditor />;
  }
}

/**
 * Component that renders numeric property target input for numeric value editing.
 *
 * @internal
 */
export class NumericPropertyEditor extends PureComponent<PropertyEditorProps> implements TypeEditor {
  private _ref = createRef<PropertyEditorAttributes>();

  // istanbul ignore next
  public async getPropertyValue() {
    return this._ref.current?.getValue();
  }

  // istanbul ignore next
  public get htmlElement() {
    return this._ref.current?.htmlElement ?? null;
  }

  // istanbul ignore next
  public get hasFocus() {
    if (!this._ref.current?.htmlElement || !document.activeElement) {
      return false;
    }
    return this._ref.current.htmlElement.contains(document.activeElement);
  }

  /** @internal */
  public override render() {
    return this.props.propertyRecord ? <NumericPropertyInput ref={this._ref} {...this.props} propertyRecord={this.props.propertyRecord} /> : null;
  }
}

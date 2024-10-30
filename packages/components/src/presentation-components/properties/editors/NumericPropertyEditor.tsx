/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef, PureComponent } from "react";
import { PropertyEditorBase, PropertyEditorProps, TypeEditor } from "@itwin/components-react";
import { NumericPropertyInput } from "../inputs/NumericPropertyInput.js";
import { PropertyEditorAttributes } from "./Common.js";

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
  /* c8 ignore start */
  public override get containerHandlesTab(): boolean {
    return false;
  }

  public get reactNode(): React.ReactNode {
    return <NumericPropertyEditor />;
  }
  /* c8 ignore end */
}

/**
 * Component that renders numeric property target input for numeric value editing.
 *
 * @internal
 */
export class NumericPropertyEditor extends PureComponent<PropertyEditorProps> implements TypeEditor {
  private _ref = createRef<PropertyEditorAttributes>();

  /* c8 ignore start */
  public async getPropertyValue() {
    return this._ref.current?.getValue();
  }

  public get htmlElement() {
    return this._ref.current?.htmlElement ?? null;
  }

  public get hasFocus() {
    if (!this._ref.current?.htmlElement || !document.activeElement) {
      return false;
    }
    return this._ref.current.htmlElement.contains(document.activeElement);
  }
  /* c8 ignore end */

  /** @internal */
  public override render() {
    return this.props.propertyRecord ? <NumericPropertyInput ref={this._ref} {...this.props} propertyRecord={this.props.propertyRecord} /> : null;
  }
}

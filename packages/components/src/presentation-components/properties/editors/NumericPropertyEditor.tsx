/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef, PureComponent } from "react";
import { PropertyEditorBase } from "@itwin/components-react";
import { NumericPropertyInput } from "../inputs/NumericPropertyInput.js";

import type { PropertyEditorProps, TypeEditor } from "@itwin/components-react";
import type { PropertyEditorAttributes } from "./Common.js";

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
  /* v8 ignore start -- @preserve */
  public override get containerHandlesTab(): boolean {
    return false;
  }

  public get reactNode(): React.ReactNode {
    return <NumericPropertyEditor />;
  }
  /* v8 ignore stop -- @preserve */
}

/**
 * Component that renders numeric property target input for numeric value editing.
 *
 * @internal
 */
export class NumericPropertyEditor extends PureComponent<PropertyEditorProps> implements TypeEditor {
  private _ref = createRef<PropertyEditorAttributes>();

  /* v8 ignore start -- @preserve */
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
  /* v8 ignore stop -- @preserve */

  /** @internal */
  public override render() {
    return this.props.propertyRecord ? (
      <NumericPropertyInput ref={this._ref} {...this.props} propertyRecord={this.props.propertyRecord} />
    ) : null;
  }
}

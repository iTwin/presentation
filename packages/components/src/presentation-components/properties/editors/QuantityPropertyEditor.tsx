/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef, PureComponent } from "react";
import { PropertyEditorBase, PropertyEditorProps, TypeEditor } from "@itwin/components-react";
import { QuantityPropertyEditorInput } from "../inputs/QuantityPropertyEditorInput.js";
import { PropertyEditorAttributes } from "./Common.js";

/**
 * Name for `QuantityPropertyEditor`.
 * @internal
 */
export const QuantityEditorName = "presentation-quantity-editor";

/**
 * Editor for quantity properties.
 * @internal
 */
export class QuantityPropertyEditorBase extends PropertyEditorBase {
  /* c8 ignore start */
  public get reactNode(): React.ReactNode {
    return <QuantityPropertyEditor />;
  }
  /* c8 ignore end */
}

/**
 * Component that renders quantity property value input
 * @internal
 */
export class QuantityPropertyEditor extends PureComponent<PropertyEditorProps> implements TypeEditor {
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
    return this.props.propertyRecord ? <QuantityPropertyEditorInput ref={this._ref} {...this.props} propertyRecord={this.props.propertyRecord} /> : null;
  }
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef, PureComponent } from "react";
import { PropertyEditorBase, PropertyEditorProps, TypeEditor } from "@itwin/components-react";
import { QuantityPropertyEditorInput } from "../inputs/QuantityPropertyEditorInput.js";
import { PropertyEditorAttributes } from "./Common.js";

/**
 * Editor for quantity properties.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
export class QuantityPropertyEditorBase extends PropertyEditorBase {
  /* v8 ignore start -- @preserve */
  public get reactNode(): React.ReactNode {
    return <QuantityPropertyEditor />;
  }
  /* v8 ignore stop -- @preserve */
}

/**
 * Component that renders quantity property value input
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
export class QuantityPropertyEditor extends PureComponent<PropertyEditorProps> implements TypeEditor {
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
      <QuantityPropertyEditorInput ref={this._ref} {...this.props} propertyRecord={this.props.propertyRecord} />
    ) : null;
  }
}

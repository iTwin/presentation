/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef, PureComponent } from "react";
import { StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyEditorBase, PropertyEditorManager, PropertyEditorProps, TypeEditor } from "@itwin/components-react";
import { NumericPropertyInput, NumericPropertyInputAttributes } from "./NumericPropertyInput";

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

  public get reactNode(): React.ReactNode {
    return <NumericPropertyEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Number, NumericPropertyEditorBase, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Int, NumericPropertyEditorBase, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Float, NumericPropertyEditorBase, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Double, NumericPropertyEditorBase, NumericEditorName);

/**
 * Component that renders numeric property target input for numeric value editing.
 *
 * @internal
 */
export class NumericPropertyEditor extends PureComponent<PropertyEditorProps> implements TypeEditor {
  private _ref = createRef<NumericPropertyInputAttributes>();

  // istanbul ignore next
  public async getPropertyValue() {
    return this._ref.current?.getValue();
  }

  // istanbul ignore next
  public get htmlElement() {
    return this._ref.current?.divElement ?? null;
  }

  // istanbul ignore next
  public get hasFocus() {
    if (!this._ref.current?.divElement || !document.activeElement) {
      return false;
    }
    return this._ref.current.divElement.contains(document.activeElement);
  }

  /** @internal */
  public override render() {
    return this.props.propertyRecord ? <NumericPropertyInput ref={this._ref} {...this.props} propertyRecord={this.props.propertyRecord} /> : null;
  }
}

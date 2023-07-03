import { createRef, forwardRef, PureComponent } from 'react';

import { StandardTypeNames } from '@itwin/appui-abstract';
import {
    PropertyEditorBase, PropertyEditorManager, PropertyEditorProps, TypeEditor
} from '@itwin/components-react';

import {
    NumericPropertyTargetInput, NumericPropertyTargetInputAttributes
} from './NumericPropertyTargetInput';

/**
 * Name for `NumericPropertyEditor`.
 *
 * @internal
 */
export const NumericEditorName = "numeric-editor";

/**
 * Editor for numeric properties.
 *
 * @internal
 */
export class NumericPropertyEditor extends PropertyEditorBase {
  // istanbul ignore next
  public override get containerHandlesEnter(): boolean {
    return false;
  }

  // istanbul ignore next
  public override get containerStopsKeydownPropagation(): boolean {
    return false;
  }

  public get reactNode(): React.ReactNode {
    return <NumericPropertyTargetEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Number, NumericPropertyEditor, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Int, NumericPropertyEditor, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Float, NumericPropertyEditor, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Double, NumericPropertyEditor, NumericEditorName);

/**
 * Component that renders numeric property target input for numeric value editing.
 *
 * @internal
 */
export class NumericPropertyTargetEditor extends PureComponent<PropertyEditorProps> implements TypeEditor {
  private _ref = createRef<NumericPropertyTargetInputAttributes>();

  // istanbul ignore next
  public async getPropertyValue() {
    return this._ref.current?.getValue();
  }

  // istanbul ignore next
  public get htmlElement() {
    return this._ref.current?.inputElement ?? null;
  }

  // istanbul ignore next
  public get hasFocus() {
    if (!this._ref.current?.inputElement || !document.activeElement) {
      return false;
    }
    return this._ref.current.inputElement.contains(document.activeElement);
  }

  /** @internal */
  public override render() {
    return <NumericPropertyTargetEditorInner ref={this._ref} {...this.props} />;
  }
}

const NumericPropertyTargetEditorInner = forwardRef<NumericPropertyTargetInputAttributes, PropertyEditorProps>((props, ref) => {
  if (!props.propertyRecord) {
    return null;
  }

  return <NumericPropertyTargetInput {...props} propertyRecord={props.propertyRecord} ref={ref} />;
});
NumericPropertyTargetEditorInner.displayName = "NumericPropertyTargetEditorInner";

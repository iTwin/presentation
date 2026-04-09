/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef, forwardRef, PureComponent } from "react";
import { PropertyEditorBase, PropertyEditorProps, TypeEditor } from "@itwin/components-react";
import {
  NavigationPropertyTargetSelector,
  ReadonlyNavigationPropertyTarget,
} from "../inputs/NavigationPropertyTargetSelector.js";
import { PropertyEditorAttributes } from "./Common.js";
import { useNavigationPropertyEditorContext } from "./NavigationPropertyEditorContext.js";

/**
 * Editor for navigation properties.
 *
 * **Note:** Should be used inside [[navigationPropertyEditorContext]].
 * @internal
 */
export class NavigationPropertyEditor extends PropertyEditorBase {
  /* v8 ignore start -- @preserve */
  public override get containerHandlesEnter(): boolean {
    return false;
  }
  public get reactNode(): React.ReactNode {
    return <NavigationPropertyTargetEditor />;
  }
  /* v8 ignore stop -- @preserve */
}

/**
 * Component that renders navigation property target selector for navigation property value editing.
 *
 * **Note:** Should be used inside [[navigationPropertyEditorContext]].
 * @internal
 */
export class NavigationPropertyTargetEditor extends PureComponent<PropertyEditorProps> implements TypeEditor {
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

  public override render() {
    return <NavigationPropertyTargetEditorInner ref={this._ref} {...this.props} />;
  }
}

const NavigationPropertyTargetEditorInner = forwardRef<PropertyEditorAttributes, PropertyEditorProps>((props, ref) => {
  const context = useNavigationPropertyEditorContext();
  if (!props.propertyRecord) {
    return null;
  }

  if (!context) {
    return <ReadonlyNavigationPropertyTarget record={props.propertyRecord} />;
  }

  return (
    <NavigationPropertyTargetSelector
      {...props}
      ref={ref}
      imodel={context.imodel}
      getNavigationPropertyInfo={context.getNavigationPropertyInfo}
      propertyRecord={props.propertyRecord}
    />
  );
});
NavigationPropertyTargetEditorInner.displayName = "NavigationPropertyTargetEditorInner";

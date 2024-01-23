/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyEditorManager } from "@itwin/components-react";
import {
  NavigationPropertyEditor as NavigationPropertyEditorInternal,
  NavigationPropertyTargetEditor as NavigationPropertyTargetEditorInternal,
} from "./NavigationPropertyEditor";
import { NumericEditorName, NumericPropertyEditorBase } from "./NumericPropertyEditor";
import { QuantityEditorName, QuantityPropertyEditorBase } from "./QuantityPropertyEditor";

export * from "./NavigationPropertyEditorContext";

/**
 * Editor for navigation properties.
 * @beta
 * @deprecated in 5.0. This component should not be used directly. Instead, it should be used though the
 * [[PropertyEditorManager]] system where it's automatically registered as a default editor for all
 * [[StandardTypeNames.Navigation]] properties.
 */
const NavigationPropertyEditor = NavigationPropertyEditorInternal;
/**
 * Component that renders navigation property target selector for navigation property value editing.
 * @beta
 * @deprecated in 5.0. This component should not be used directly. Instead, it should be used though the
 * [[PropertyEditorManager]] system where it's automatically registered as a default editor for all
 * [[StandardTypeNames.Navigation]] properties.
 */
const NavigationPropertyTargetEditor = NavigationPropertyTargetEditorInternal;
// eslint-disable-next-line deprecation/deprecation
export { NavigationPropertyEditor, NavigationPropertyTargetEditor };

// register editor for kind of quantity properties
PropertyEditorManager.registerEditor(StandardTypeNames.Double, QuantityPropertyEditorBase, QuantityEditorName);

// register editor for navigation properties
PropertyEditorManager.registerEditor(StandardTypeNames.Navigation, NavigationPropertyEditorInternal);

// register editor for numeric properties
PropertyEditorManager.registerEditor(StandardTypeNames.Number, NumericPropertyEditorBase, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Int, NumericPropertyEditorBase, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Float, NumericPropertyEditorBase, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Double, NumericPropertyEditorBase, NumericEditorName);

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyEditorManager } from "@itwin/components-react";
import { NavigationPropertyEditor } from "./NavigationPropertyEditor";
import { NumericEditorName, NumericPropertyEditorBase } from "./NumericPropertyEditor";
import { QuantityEditorName, QuantityPropertyEditorBase } from "./QuantityPropertyEditor";

export * from "./NavigationPropertyEditorContext";

// register editor for kind of quantity properties
PropertyEditorManager.registerEditor(StandardTypeNames.Double, QuantityPropertyEditorBase, QuantityEditorName);

// register editor for navigation properties
PropertyEditorManager.registerEditor(StandardTypeNames.Navigation, NavigationPropertyEditor);

// register editor for numeric properties
PropertyEditorManager.registerEditor(StandardTypeNames.Number, NumericPropertyEditorBase, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Int, NumericPropertyEditorBase, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Float, NumericPropertyEditorBase, NumericEditorName);
PropertyEditorManager.registerEditor(StandardTypeNames.Double, NumericPropertyEditorBase, NumericEditorName);

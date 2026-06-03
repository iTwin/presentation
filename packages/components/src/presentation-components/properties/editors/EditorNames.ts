/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module Properties
 */

import { Guid } from "@itwin/core-bentley";

const editorSuffix = Guid.createValue();

/**
 * Name for `QuantityPropertyEditor`.
 * @internal
 */
export const QuantityEditorName = `presentation-quantity-editor-${editorSuffix}`;

/**
 * Name for `NumericPropertyEditor`.
 * @internal
 */
export const NumericEditorName = `presentation-numeric-editor-${editorSuffix}`;

/**
 * Name for `NavigationPropertyEditor`.
 * @internal
 */
export const NavigationEditorName = `presentation-navigation-editor-${editorSuffix}`;

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyValue } from "@itwin/appui-abstract";

/** @internal */
export interface PropertyEditorAttributes {
  getValue: () => PropertyValue | undefined;
  htmlElement: HTMLElement | null;
}

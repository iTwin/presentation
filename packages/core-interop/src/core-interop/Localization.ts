/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Localization } from "@itwin/core-common";

/**
 * Create a `Translator` that uses [Localization]($core-common) API to create a localized string.
 * @beta
 */
export function createTranslator(localization: Localization): (input: string) => string {
  return (input) => localization.getLocalizedString(input);
}

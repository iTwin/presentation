/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Localization } from "@itwin/core-common";
import { LOCALIZATION_NAMESPACE, LocalizationFunction } from "@itwin/presentation-hierarchy-builder";

/**
 * Create a `LocalizationFunction` that uses [Localization]($core-common) API to register the namespace and create a localized string.
 * @beta
 */
export async function createLocalizationFunction(localization: Localization): Promise<LocalizationFunction> {
  await localization.registerNamespace(LOCALIZATION_NAMESPACE);
  return (input) => localization.getLocalizedString(input);
}

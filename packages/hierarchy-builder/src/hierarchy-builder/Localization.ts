/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** A localization function implementation returns the same input. */
const NOOP_LOCALIZATION_FUNCTION = (input: string) => input;

// eslint-disable-next-line @typescript-eslint/naming-convention
let g_localization_function = NOOP_LOCALIZATION_FUNCTION;

/**
 * An type for a localization function used by this package.
 * @beta
 */
export type LocalizationFunction = (input: string) => string;

/**
 * A namespace that is used for localization.
 * @beta
 */
export const LOCALIZATION_NAMESPACE = "PresentationHierarchyBuilder";

/**
 * Set localization function to use by this package. By default the package uses a no-op localization function.
 * @beta
 */
export function setLocalizationFunction(localizationFunction?: LocalizationFunction) {
  g_localization_function = localizationFunction || NOOP_LOCALIZATION_FUNCTION;
}

/**
 * Use localization function that is set in this package.
 * @internal
 */
export function translate(input: string) {
  return g_localization_function(`${LOCALIZATION_NAMESPACE}:${input}`);
}

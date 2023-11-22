/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** A translator implementation returns the same input. */
// eslint-disable-next-line @typescript-eslint/naming-convention
const NOOP_Translator = (input: string) => input;

// eslint-disable-next-line @typescript-eslint/naming-convention
let g_translator = NOOP_Translator;

/**
 * An type for a translator used by this package.
 * @beta
 */
export type Translator = (input: string) => string;

/**
 * A namespace that is used for localization.
 * @beta
 */
export const LOCALIZATION_NAMESPACE = "PresentationHierarchyBuilder";

/**
 * Set translator to use by this package. By default the package uses a no-op translator.
 * @beta
 */
export function setTranslator(translator: Translator) {
  g_translator = translator;
}

/**
 * Use translator that is set in this package.
 *
 * @beta
 */
export function translate(input: string) {
  return g_translator(`${LOCALIZATION_NAMESPACE}:${input}`);
}

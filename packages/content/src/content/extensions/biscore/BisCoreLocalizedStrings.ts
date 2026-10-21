/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Localizable strings for the categories contributed by the BisCore content
 * configuration (`createBisCoreContentConfiguration` / `createIModelContentConfiguration`).
 *
 * @public
 */
export interface BisCoreLocalizedStrings {
  /** Label of the category nesting BisCore's element source-related fields. */
  sourceInformation: string;
  /** Label of the category nesting the element's model-source repository link's fields. */
  modelSource: string;
  /** Label of the category nesting a source group's member sources' document-link fields. */
  secondarySources: string;
  /** Label of the category nesting an external source's own document-link fields. */
  documentLink: string;
}

/**
 * Default English strings used by the BisCore content configuration when no `localizedStrings`
 * overrides are provided.
 */
export const DEFAULT_BIS_CORE_LOCALIZED_STRINGS: BisCoreLocalizedStrings = {
  sourceInformation: "Source Information",
  modelSource: "Model Source",
  secondarySources: "Secondary Sources",
  documentLink: "Document Link",
};

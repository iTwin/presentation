/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createBisCoreContentConfiguration } from "./biscore/BisCoreContentConfiguration.js";
import { createEmbeddedPresentationRulesConfiguration } from "./presentation-rules/EmbeddedRulesets.js";

import type { ECSchemaProvider, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import type { ContentConfiguration } from "../Content.js";
import type { BisCoreLocalizedStrings } from "./biscore/BisCoreLocalizedStrings.js";

/**
 * Props for `createIModelContentConfiguration`.
 *
 * @public
 */
export interface CreateIModelContentConfigurationProps {
  /** Access to the iModel for reading its embedded content configuration and inspecting its schemas. */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;

  /**
   * Overrides for the default English strings used by categories BisCore's fields
   * providers contribute. Defaults to English when omitted.
   */
  localizedStrings?: Partial<BisCoreLocalizedStrings>;
}

/**
 * Builds the default `ContentConfiguration` for producing content from an iModel: BisCore-specific
 * content enhancements plus any configuration embedded in the iModel itself — e.g. related and
 * calculated properties, and adjustments to field labels, categories, and visibility.
 *
 * The returned configuration can be passed to `resolveContentSources` and `createContentProvider`,
 * and can be further combined with other configurations (e.g. by concatenating
 * `imodelFieldsProviders`/`descriptorTransformers` arrays).
 *
 * @public
 */
export async function createIModelContentConfiguration(
  props: CreateIModelContentConfigurationProps,
): Promise<ContentConfiguration> {
  const { imodelAccess, localizedStrings } = props;
  const bisCore = createBisCoreContentConfiguration({ localizedStrings });
  const embedded = await createEmbeddedPresentationRulesConfiguration({ imodelAccess });
  return {
    imodelFieldsProviders: [...bisCore.imodelFieldsProviders, ...embedded.imodelFieldsProviders],
    descriptorTransformers: [...bisCore.descriptorTransformers, ...embedded.descriptorTransformers],
  };
}

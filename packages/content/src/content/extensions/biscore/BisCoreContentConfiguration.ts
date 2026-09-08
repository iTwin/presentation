/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  hideTypeDefinitionElementInternalPropertiesTransformer,
  renamePhysicalTypePhysicalMaterialTransformer,
  showExternalSourceAspectPropsTransformer,
} from "./BisCoreDescriptorTransformers.js";
import { createBisCoreAspectsFieldsProvider, createBisCoreFieldsProvider } from "./BisCoreFieldsProviders.js";
import { type BisCoreLocalizedStrings, DEFAULT_BIS_CORE_LOCALIZED_STRINGS } from "./BisCoreLocalizedStrings.js";

import type { ContentConfiguration } from "../../Content.js";

/**
 * Props for `createBisCoreContentConfiguration`.
 */
export interface CreateBisCoreContentConfigurationProps {
  /**
   * Overrides for the default English strings used by the labels and categories BisCore's fields
   * providers and descriptor transformers contribute. Defaults to English when omitted.
   */
  localizedStrings?: Partial<BisCoreLocalizedStrings>;
}

/**
 * Creates a `ContentConfiguration` with BisCore-specific content enhancements for `BisCore.Element`
 * targets: owned aspect fields, element/group/model-source links, external-source information
 * (source identifier, document links, secondary sources), 2d/3d type definitions, represented
 * drawing and graphical elements, and BisCore-specific field metadata adjustments (hidden internal
 * type-definition properties, the renamed `PhysicalMaterial` property).
 *
 * Owned aspect fields are also contributed on nested content: related elements whose full property
 * set is surfaced in content — e.g. an element's links, its type definition, the elements it
 * represents — get their own owned-aspect fields too. Contributions that surface only a few named
 * properties of a related element (the model-source and secondary-source links) don't.
 *
 * The returned configuration can be combined with other configurations (e.g. by concatenating
 * `imodelFieldsProviders`/`descriptorTransformers` arrays) before being passed to
 * `resolveContentSources` and `createContentProvider`.
 */
export function createBisCoreContentConfiguration(
  props?: CreateBisCoreContentConfigurationProps,
): Required<Pick<ContentConfiguration, "imodelFieldsProviders" | "descriptorTransformers">> {
  const localizedStrings = { ...DEFAULT_BIS_CORE_LOCALIZED_STRINGS, ...props?.localizedStrings };
  return {
    imodelFieldsProviders: [createBisCoreAspectsFieldsProvider(), createBisCoreFieldsProvider(localizedStrings)],
    descriptorTransformers: [
      hideTypeDefinitionElementInternalPropertiesTransformer,
      renamePhysicalTypePhysicalMaterialTransformer,
      showExternalSourceAspectPropsTransformer,
    ],
  };
}

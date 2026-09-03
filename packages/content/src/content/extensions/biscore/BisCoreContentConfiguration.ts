/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createBisCoreDescriptorTransformers } from "./BisCoreDescriptorTransformers.js";
import { createBisCoreFieldsProviders } from "./BisCoreFieldsProviders.js";

import type { ContentConfiguration } from "../../Content.js";

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
 *
 * @public
 */
export function createBisCoreContentConfiguration(): ContentConfiguration {
  return {
    imodelFieldsProviders: createBisCoreFieldsProviders(),
    descriptorTransformers: createBisCoreDescriptorTransformers(),
  };
}

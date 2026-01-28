/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { PropertyValueRendererManager } from "@itwin/components-react";
import { Presentation } from "@itwin/presentation-frontend";
import { localizationNamespaceName } from "./common/Utils.js";
import { InstanceKeyValueRenderer } from "./properties/InstanceKeyValueRenderer.js";

import type { IPropertyValueRenderer } from "@itwin/components-react";

/**
 * Registers 'PresentationComponents' localization namespace and returns callback
 * to unregister it.
 * @internal
 */
export const initializeLocalization = async () => {
  await Presentation.localization.registerNamespace(localizationNamespaceName);
  return () => Presentation.localization.unregisterNamespace(localizationNamespaceName);
};

/**
 * Registers custom property value renderers and returns cleanup callback that unregisters them.
 * @internal
 */
export const initializePropertyValueRenderers = async () => {
  const customRenderers: Array<{ name: string; renderer: IPropertyValueRenderer }> = [{ name: "SelectableInstance", renderer: new InstanceKeyValueRenderer() }];

  for (const { name, renderer } of customRenderers) {
    PropertyValueRendererManager.defaultManager.registerRenderer(name, renderer);
  }

  return () => {
    for (const { name } of customRenderers) {
      PropertyValueRendererManager.defaultManager.unregisterRenderer(name);
    }
  };
};

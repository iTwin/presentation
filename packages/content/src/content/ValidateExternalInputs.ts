/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ExternalFieldsProvider, InputPropertyDeclaration } from "./extensions/ExternalFieldsProvider.js";

/** Rejects invalid external input paths before source resolution or input preparation. */
export function validateExternalInputs(providers: ExternalFieldsProvider[]): void {
  for (const provider of providers) {
    const declarations: Array<[string, InputPropertyDeclaration]> = Object.entries(provider.inputs ?? {});
    for (const [key, { related }] of declarations) {
      if (related && related.path.length === 0) {
        throw new Error(
          `External fields provider "${provider.id}" input "${key}" declares an empty related path. Omit "related" for a direct property input.`,
        );
      }
    }
  }
}

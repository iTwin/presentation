/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { filterFields } from "./Utils.js";

import type { ContentTransformStep } from "../ContentTransformer.js";

/** Creates a content transform step that drops fields marked as `hidden`. */
export function hideHiddenFields(): ContentTransformStep {
  return (records) => ({ ...records, entries: filterFields(records.entries, (field) => !field.hidden) });
}

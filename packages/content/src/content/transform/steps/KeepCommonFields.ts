/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { filterFields, isFieldApplicable } from "./Utils.js";

import type { ContentTransformStep } from "../TransformContent.js";

/**
 * Creates a content transform step that keeps only fields applicable to every content item (see `isFieldApplicable`).
 * Use it to show only properties common to all selected instances.
 */
export function keepCommonFields(): ContentTransformStep {
  return (records, { items }) => ({
    ...records,
    entries: filterFields(records.entries, (field) => items.every((item) => isFieldApplicable(field, item))),
  });
}

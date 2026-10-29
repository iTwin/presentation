/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { hideHiddenFields } from "../../../content/transform/steps/HideHiddenFields.js";
import { createPropertyField, createRecords } from "../Helpers.js";

import type { FieldEntry } from "../../../content/transform/ContentTransformer.js";

describe("hideHiddenFields", () => {
  it("drops hidden fields", () => {
    const entries = [createPropertyField("visible"), createPropertyField("hidden", { hidden: true })].map(
      (field): FieldEntry => ({ kind: "field", field, values: [] }),
    );
    const result = hideHiddenFields()(createRecords({ entries }));
    expect(result.entries).to.deep.equal([entries[0]]);
  });
});

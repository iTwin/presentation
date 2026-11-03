/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { removeHiddenFields } from "../../../content/transform/steps/RemoveHiddenFields.js";
import { createPropertyField, createStepArgs } from "../Helpers.js";

import type { FieldEntry } from "../../../content/transform/TransformContent.js";

describe("removeHiddenFields", () => {
  it("drops hidden fields", () => {
    const entries = [createPropertyField("visible"), createPropertyField("hidden", { hidden: true })].map(
      (field): FieldEntry => ({ kind: "field", field, values: [] }),
    );
    const result = removeHiddenFields()(...createStepArgs({ entries }));
    expect(result.entries).to.deep.equal([entries[0]]);
  });
});

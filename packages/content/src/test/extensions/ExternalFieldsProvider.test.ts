/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expectTypeOf, it } from "vitest";
import { defineExternalFieldsProvider } from "../../content/extensions/ExternalFieldsProvider.js";

import type { Value } from "@itwin/presentation-shared";

describe("ExternalFieldsProvider input typing", () => {
  it('narrows `inputValues` to `Value[]` only for a `cardinalityHint: "many"` input', () => {
    defineExternalFieldsProvider({
      id: "provider_v1",
      fields: [{ id: "combined", label: "Combined", type: { kind: "primitive", type: "String" } }],
      inputs: {
        one: { propertyClassName: "Schema.A", propertyName: "Code" },
        oneHinted: { propertyClassName: "Schema.A", propertyName: "Code", cardinalityHint: "one" },
        many: { propertyClassName: "Schema.B", propertyName: "Name", cardinalityHint: "many" },
      },
      async getValues({ items }) {
        expectTypeOf(items[0].inputValues.one).toEqualTypeOf<Value>();
        expectTypeOf(items[0].inputValues.oneHinted).toEqualTypeOf<Value>();
        expectTypeOf(items[0].inputValues.many).toEqualTypeOf<Value[]>();
        return items.map(() => ({ combined: "" }));
      },
    });
  });
});

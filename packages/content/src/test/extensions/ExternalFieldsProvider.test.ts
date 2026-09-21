/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expectTypeOf, it } from "vitest";
import { defineExternalFieldsProvider } from "../../content/extensions/ExternalFieldsProvider.js";

import type { Value } from "@itwin/presentation-shared";

describe("ExternalFieldsProvider input typing", () => {
  it('narrows `inputValues` to `Value[]` only for a `related.cardinalityHint: "many"` input', () => {
    defineExternalFieldsProvider({
      id: "provider_v1",
      fields: [{ id: "combined", label: "Combined", type: { kind: "primitive", type: "String" } }],
      inputs: {
        one: { propertyClassName: "Schema.A", propertyName: "Code" },
        unhinted: {
          propertyClassName: "Schema.B",
          propertyName: "Name",
          related: {
            path: [{ sourceClassName: "Schema.A", relationshipName: "Schema.Rel", targetClassName: "Schema.B" }],
          },
        },
        oneHinted: {
          propertyClassName: "Schema.B",
          propertyName: "Name",
          related: {
            path: [{ sourceClassName: "Schema.A", relationshipName: "Schema.Rel", targetClassName: "Schema.B" }],
            cardinalityHint: "one",
          },
        },
        many: {
          propertyClassName: "Schema.B",
          propertyName: "Name",
          related: {
            path: [{ sourceClassName: "Schema.A", relationshipName: "Schema.Rel", targetClassName: "Schema.B" }],
            cardinalityHint: "many",
          },
        },
      },
      async getValues({ items }) {
        expectTypeOf(items[0].inputValues.one).toEqualTypeOf<Value>();
        expectTypeOf(items[0].inputValues.unhinted).toEqualTypeOf<Value>();
        expectTypeOf(items[0].inputValues.oneHinted).toEqualTypeOf<Value>();
        expectTypeOf(items[0].inputValues.many).toEqualTypeOf<Value[]>();
        return items.map(() => ({ combined: "" }));
      },
    });
  });
});

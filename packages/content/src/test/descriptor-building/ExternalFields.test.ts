/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectExternalFields } from "../../content/descriptor-building/ExternalFields.js";

import type { RelationshipPath } from "@itwin/presentation-shared";
import type { ExternalFieldsProvider } from "../../content/extensions/ExternalFieldsProvider.js";

describe("collectExternalFields", () => {
  it("returns nothing for no providers", () => {
    expect(collectExternalFields([])).to.deep.equal({ fields: {}, inputs: [] });
  });

  it("maps external field declarations, prefixing ids with the provider id", () => {
    const provider: ExternalFieldsProvider = {
      id: "ext_v1",
      fields: [
        { id: "flow", label: "Flow", type: { kind: "primitive", type: "Double" } },
        { id: "status", label: "Status", type: { kind: "primitive", type: "String" }, categoryId: "cat" },
      ],
      async getValues() {
        return [];
      },
    };
    const { fields, inputs } = collectExternalFields([provider]);
    expect(fields).to.deep.equal({
      "ext_v1:flow": {
        kind: "external",
        id: "ext_v1:flow",
        label: "Flow",
        type: { kind: "primitive", type: "Double" },
        providerId: "ext_v1",
      },
      "ext_v1:status": {
        kind: "external",
        id: "ext_v1:status",
        label: "Status",
        type: { kind: "primitive", type: "String" },
        providerId: "ext_v1",
        categoryId: "cat",
      },
    });
    expect(inputs).to.deep.equal([]);
  });

  it("collects input column coordinates, including relationship paths", () => {
    const path: RelationshipPath = [
      { sourceClassName: "TestSchema.A", targetClassName: "TestSchema.B", relationshipName: "TestSchema.AtoB" },
    ];
    const provider: ExternalFieldsProvider<"direct" | "related"> = {
      id: "ext_v1",
      fields: [],
      inputs: {
        direct: { propertyClassName: "TestSchema.A", propertyName: "Code" },
        related: { propertyClassName: "TestSchema.B", propertyName: "Name", path },
      },
      async getValues() {
        return [];
      },
    };
    const { inputs } = collectExternalFields([provider]);
    expect(inputs).to.deep.equal([
      { propertyClassName: "TestSchema.A", propertyName: "Code" },
      { propertyClassName: "TestSchema.B", propertyName: "Name", pathFromTarget: path },
    ]);
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createInstanceFilterProperties } from "../content-react/InstanceFilterProperties.js";
import { classA, createDescriptor, createPropertyField, createSource } from "./Helpers.js";

import type { Field } from "@itwin/presentation-content";

describe("createInstanceFilterProperties", () => {
  it("excludes hidden, and non-property fields", () => {
    const source = createSource({ resolvedPrimaryClasses: [classA], resolvedPaths: [] });
    const availableDirectField = createPropertyField({ id: "available", valueClassNames: [classA] });
    const hiddenField = createPropertyField({ id: "hidden", hidden: true, valueClassNames: [classA] });
    const externalField: Field = {
      kind: "external",
      id: "external",
      label: "external",
      type: { kind: "primitive", type: "String" },
      providerId: "test",
    };

    const result = createInstanceFilterProperties({
      descriptor: createDescriptor(source, [availableDirectField, hiddenField, externalField]),
    });

    expect(result.properties).toMatchObject([{ id: "available", primaryClassNames: [classA] }]);
    expect(result.properties).toHaveLength(1);
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createInstanceFilterProperties } from "../content-react/InstanceFilterProperties.js";
import { classA, classB, classC, createDescriptor, createPropertyField, createSource } from "./Helpers.js";

import type { Field } from "@itwin/presentation-content";
import type { RelationshipPath } from "@itwin/presentation-shared";

describe("createInstanceFilterProperties", () => {
  it("uses the target primary class when source resolution has no concrete classes", () => {
    const source = createSource({ targetPrimaryClass: classA, resolvedPrimaryClasses: [], resolvedPaths: [] });
    const directField = createPropertyField({ id: "direct", valueClassNames: [classA] });

    const result = createInstanceFilterProperties({ descriptor: createDescriptor(source, [directField]) });

    expect(result.classes).toEqual([{ name: classA, label: classA }]);
    expect(result.properties[0].availableClassNames).toEqual([classA]);
  });

  it("derives classes and related availability from all descriptor sources", () => {
    const pathFromA: RelationshipPath = [
      { sourceClassName: classA, relationshipName: "TestSchema.RelAB", targetClassName: classB },
    ];
    const pathFromB: RelationshipPath = [
      { sourceClassName: classB, relationshipName: "TestSchema.RelBC", targetClassName: classC },
    ];
    const sourceA = createSource({
      resolvedPrimaryClasses: [classA],
      resolvedPaths: [{ path: pathFromA, targetClassNames: [classA] }],
    });
    const sourceB = createSource({
      targetPrimaryClass: classB,
      resolvedPrimaryClasses: [classB],
      resolvedPaths: [{ path: pathFromB, targetClassNames: [classB] }],
    });
    const relatedFieldFromA = createPropertyField({
      id: "related-a",
      pathFromTarget: pathFromA,
      valueClassNames: [classB],
    });
    const relatedFieldFromB = createPropertyField({
      id: "related-b",
      pathFromTarget: pathFromB,
      valueClassNames: [classC],
    });

    const result = createInstanceFilterProperties({
      descriptor: createDescriptor([sourceA, sourceB], [relatedFieldFromA, relatedFieldFromB]),
    });

    expect(result.classes.map((item) => item.name)).toEqual([classA, classB]);
    expect(result.properties).toMatchObject([
      { field: { id: "related-a" }, availableClassNames: [classA] },
      { field: { id: "related-b" }, availableClassNames: [classB] },
    ]);
  });

  it("excludes hidden, non-property, and direct fields unavailable to source classes", () => {
    const source = createSource({ resolvedPrimaryClasses: [classA], resolvedPaths: [] });
    const availableDirectField = createPropertyField({ id: "available", valueClassNames: [classA] });
    const unavailableDirectField = createPropertyField({ id: "unavailable", valueClassNames: [classB] });
    const hiddenField = createPropertyField({ id: "hidden", hidden: true, valueClassNames: [classA] });
    const externalField: Field = {
      kind: "external",
      id: "external",
      label: "external",
      type: { kind: "primitive", type: "String" },
      providerId: "test",
    };

    const result = createInstanceFilterProperties({
      descriptor: createDescriptor(source, [availableDirectField, unavailableDirectField, hiddenField, externalField]),
    });

    expect(result.properties).toMatchObject([{ field: { id: "available" }, availableClassNames: [classA] }]);
    expect(result.properties).toHaveLength(1);
  });

  it("scopes related properties to target classes recorded on matching resolved paths", () => {
    const pathAC: RelationshipPath = [
      { sourceClassName: classA, relationshipName: "TestSchema.RelAB", targetClassName: classB },
      { sourceClassName: classB, relationshipName: "TestSchema.RelBC", targetClassName: classC },
    ];
    const pathBC: RelationshipPath = [
      { sourceClassName: classB, relationshipName: "TestSchema.RelBC", targetClassName: classC },
    ];
    const source = createSource({
      resolvedPrimaryClasses: [classA, classB],
      resolvedPaths: [
        { path: pathAC, targetClassNames: [classA] },
        { path: pathBC, targetClassNames: [classB] },
      ],
    });
    const directField = createPropertyField({ id: "direct", valueClassNames: [classB] });
    const relatedFieldFromA = createPropertyField({
      id: "related-a",
      pathFromTarget: pathAC,
      valueClassNames: [classB],
    });
    const relatedFieldFromB = createPropertyField({
      id: "related-b",
      pathFromTarget: pathBC,
      valueClassNames: [classC],
    });

    const result = createInstanceFilterProperties({
      descriptor: createDescriptor(source, [directField, relatedFieldFromA, relatedFieldFromB]),
    });

    expect(result.classes.map((item) => item.name)).toEqual([classA, classB]);
    expect(result.properties).toMatchObject([
      { field: { id: "direct", pathFromTarget: [] }, availableClassNames: [classB] },
      { field: { id: "related-a" }, availableClassNames: [classA] },
      { field: { id: "related-b" }, availableClassNames: [classB] },
    ]);
    expect(result.properties).toHaveLength(3);
  });

  it("does not match paths that only differ by relationship direction", () => {
    const reversedPath: RelationshipPath = [
      {
        sourceClassName: classA,
        relationshipName: "TestSchema.RelAB",
        targetClassName: classB,
        relationshipReverse: true,
      },
    ];
    const source = createSource({
      resolvedPrimaryClasses: [classA],
      resolvedPaths: [
        {
          path: [{ sourceClassName: classA, relationshipName: "TestSchema.RelAB", targetClassName: classB }],
          targetClassNames: [classA],
        },
      ],
    });
    const relatedField = createPropertyField({
      id: "related",
      pathFromTarget: reversedPath,
      valueClassNames: [classB],
    });

    const result = createInstanceFilterProperties({ descriptor: createDescriptor(source, [relatedField]) });

    expect(result.properties).toEqual([]);
  });
});

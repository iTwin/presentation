/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useInstanceFilterPropertiesInfo } from "../content-react/UseInstanceFilterPropertiesInfo.js";
import { classA, classB, createDescriptor, createPropertyField, createSource } from "./Helpers.js";

describe("useInstanceFilterPropertiesInfo", () => {
  it("filters properties to the union available to selected classes", () => {
    const source = createSource({ resolvedPrimaryClasses: [classA, classB], resolvedPaths: [] });
    const descriptor = createDescriptor(source, [
      createPropertyField({ id: "a", valueClassNames: [classA] }),
      createPropertyField({ id: "b", valueClassNames: [classB] }),
      createPropertyField({ id: "both", valueClassNames: [classA, classB] }),
    ]);
    const { result } = renderHook(() => useInstanceFilterPropertiesInfo({ descriptor }));

    expect(result.current.visibleProperties.map((property) => property.field.id)).toEqual(["a", "b", "both"]);

    act(() => {
      result.current.onSelectedClassesChanged([classB]);
    });

    expect(result.current.visibleProperties.map((property) => property.field.id)).toEqual(["b", "both"]);

    act(() => {
      result.current.onSelectedClassesChanged([classA, classB]);
    });

    expect(result.current.visibleProperties.map((property) => property.field.id)).toEqual(["a", "b", "both"]);
  });

  it("uses initial selected classes and recreates source-scoped properties when the source changes", () => {
    const sourceA = createSource({ resolvedPrimaryClasses: [classA, classB], resolvedPaths: [] });
    const sourceB = createSource({ resolvedPrimaryClasses: [classB], resolvedPaths: [] });
    const descriptorA = createDescriptor(sourceA, [
      createPropertyField({ id: "a", valueClassNames: [classA] }),
      createPropertyField({ id: "b", valueClassNames: [classB] }),
    ]);
    const descriptorB = createDescriptor(sourceB, [createPropertyField({ id: "b", valueClassNames: [classB] })]);
    const { result, rerender } = renderHook(
      ({ descriptor }) => useInstanceFilterPropertiesInfo({ descriptor, initialSelectedClasses: [classA] }),
      { initialProps: { descriptor: descriptorA } },
    );

    expect(result.current.selectedClasses).toEqual([classA]);
    expect(result.current.visibleProperties.map((property) => property.field.id)).toEqual(["a"]);

    rerender({ descriptor: descriptorB });

    expect(result.current.classes.map((item) => item.name)).toEqual([classB]);
    expect(result.current.properties.map((property) => property.field.id)).toEqual(["b"]);
    expect(result.current.visibleProperties).toEqual([]);
  });
});

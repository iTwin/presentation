/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { ECSQL_PREFIX } from "../../content/InternalUtils.js";
import { buildValueFilterClauses } from "../../content/query/ValueFilters.js";

import type { PrimitiveValueType } from "@itwin/presentation-shared";
import type { ContentValueFilter } from "../../content/Content.js";
import type { CalculatedField, PropertyField } from "../../content/model/Field.js";

describe("buildValueFilterClauses", () => {
  const propertyField: PropertyField = {
    kind: "property",
    id: "field-id",
    label: "Field",
    type: { kind: "primitive", type: "Double" },
    propertyClassName: "TestSchema.TestClass",
    propertyName: "Length",
    pathFromTarget: [],
    valueClassNames: ["TestSchema.TestClass"],
    selectorId: "selector-id",
  };

  const calculatedField: CalculatedField = {
    kind: "calculated",
    id: "calculated-id",
    label: "Calculated",
    type: { kind: "primitive", type: "String" },
    expression: "this.CodeValue || '-' || this.UserLabel",
    selectorId: "calculated-id",
  };

  const stringField: PropertyField = { ...propertyField, type: { kind: "primitive", type: "String" } };

  function getSelectorType(field: PropertyField | CalculatedField): Exclude<PrimitiveValueType, "Point2d" | "Point3d"> {
    if (field.type.kind === "navigation") {
      return "Id";
    }
    if (field.type.kind === "primitive" && field.type.type !== "Point2d" && field.type.type !== "Point3d") {
      return field.type.type;
    }
    return "String";
  }

  function build(filters: ContentValueFilter[]) {
    return buildValueFilterClauses({
      filters,
      resolveSelector: (field, member) => ({
        selector: `[${field.id}]${member ? `.[${member}]` : ""}`,
        type: getSelectorType(field),
      }),
    });
  }

  it("returns undefined when no filters are provided", () => {
    expect(build([])).toBeUndefined();
  });

  it.each([
    [propertyField, "is-equal", "=", 1],
    [propertyField, "is-not-equal", "<>", 2],
    [propertyField, "less-than", "<", 3],
    [propertyField, "less-than-or-equal", "<=", 4],
    [propertyField, "greater-than", ">", 5],
    [propertyField, "greater-than-or-equal", ">=", 6],
    [stringField, "like", "LIKE", "abc%"],
  ] as const)("builds %s clause", (field, operator, sqlOperator, value) => {
    const result = build([{ field, operator, value }]);
    expect(result).to.deep.equal({
      where: `[field-id] ${sqlOperator} :${ECSQL_PREFIX}vf0`,
      bindings: { [`${ECSQL_PREFIX}vf0`]: { type: typeof value === "number" ? "double" : "string", value } },
    });
  });

  it("builds null checks without bindings", () => {
    const result = build([
      { field: propertyField, operator: "is-null" },
      { field: propertyField, operator: "is-not-null" },
    ]);

    expect(result).to.deep.equal({ where: "([field-id] IS NULL) AND ([field-id] IS NOT NULL)", bindings: {} });
  });

  it("passes field and member to column resolver", () => {
    const resolveColumn = vi.fn(
      (field: PropertyField | CalculatedField, member?: string) => `[${field.id}]${member ? `.[${member}]` : ""}`,
    );

    const result = buildValueFilterClauses({
      filters: [{ field: propertyField, member: "x", operator: "is-equal", value: 1 }],
      resolveSelector: (field, member) => ({ selector: resolveColumn(field, member), type: getSelectorType(field) }),
    });

    expect(resolveColumn).toHaveBeenCalledWith(propertyField, "x");
    expect(result?.where).to.equal(`[field-id].[x] = :${ECSQL_PREFIX}vf0`);
  });

  it("uses column resolver output for calculated fields", () => {
    const result = buildValueFilterClauses({
      filters: [{ field: calculatedField, operator: "like", value: "A%" }],
      resolveSelector: () => ({ selector: "[this].[CodeValue] || '-' || [this].[UserLabel]", type: "String" }),
    });

    expect(result).to.deep.equal({
      where: `[this].[CodeValue] || '-' || [this].[UserLabel] LIKE :${ECSQL_PREFIX}vf0`,
      bindings: { [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "A%" } },
    });
  });

  it("merges selector-supplied bindings into the query bindings", () => {
    const result = buildValueFilterClauses({
      filters: [{ field: calculatedField, operator: "greater-than", value: 10 }],
      resolveSelector: () => ({
        selector: "([this].[Length] * :scale)",
        type: "Double",
        bindings: { scale: { type: "double", value: 2 } },
      }),
    });

    expect(result).to.deep.equal({
      where: `([this].[Length] * :scale) > :${ECSQL_PREFIX}vf0`,
      bindings: { scale: { type: "double", value: 2 }, [`${ECSQL_PREFIX}vf0`]: { type: "double", value: 10 } },
    });
  });

  it("keeps an identical selector binding contributed by repeated selectors", () => {
    const result = buildValueFilterClauses({
      filters: [
        { field: calculatedField, operator: "greater-than", value: 1 },
        { field: calculatedField, operator: "less-than", value: 9 },
      ],
      resolveSelector: () => ({
        selector: "([this].[Length] * :scale)",
        type: "Double",
        bindings: { scale: { type: "double", value: 2 } },
      }),
    });

    expect(result?.bindings).to.deep.equal({
      scale: { type: "double", value: 2 },
      [`${ECSQL_PREFIX}vf0`]: { type: "double", value: 1 },
      [`${ECSQL_PREFIX}vf1`]: { type: "double", value: 9 },
    });
  });

  it("throws when selectors reuse a binding name with different values", () => {
    let call = 0;
    expect(() =>
      buildValueFilterClauses({
        filters: [
          { field: calculatedField, operator: "greater-than", value: 1 },
          { field: calculatedField, operator: "less-than", value: 9 },
        ],
        resolveSelector: () => ({
          selector: "([this].[Length] * :scale)",
          type: "Double",
          bindings: { scale: { type: "double", value: ++call } },
        }),
      }),
    ).to.throw('Duplicate ECSQL binding name "scale" with different values');
  });

  it("uses field descriptor-specific scalar binding types", () => {
    const date = new Date("2026-07-17T10:00:00.000Z");
    const result = buildValueFilterClauses({
      filters: [
        {
          field: { ...propertyField, id: "bool", type: { kind: "primitive", type: "Boolean" } },
          operator: "is-equal",
          value: true,
        },
        {
          field: { ...propertyField, id: "int", type: { kind: "primitive", type: "Integer" } },
          operator: "is-equal",
          value: 1,
        },
        {
          field: { ...propertyField, id: "long", type: { kind: "primitive", type: "Long" } },
          operator: "is-equal",
          value: 2,
        },
        {
          field: { ...propertyField, id: "id", type: { kind: "primitive", type: "Id" } },
          operator: "is-equal",
          value: "0x1",
        },
        {
          field: { ...propertyField, id: "date", type: { kind: "primitive", type: "DateTime" } },
          operator: "is-equal",
          value: date,
        },
      ],
      resolveSelector: (field) => ({ selector: `[${field.id}]`, type: getSelectorType(field) }),
    });

    expect(result?.bindings).to.deep.equal({
      [`${ECSQL_PREFIX}vf0`]: { type: "boolean", value: true },
      [`${ECSQL_PREFIX}vf1`]: { type: "int", value: 1 },
      [`${ECSQL_PREFIX}vf2`]: { type: "long", value: 2 },
      [`${ECSQL_PREFIX}vf3`]: { type: "id", value: "0x1" },
      [`${ECSQL_PREFIX}vf4`]: { type: "string", value: date.toISOString() },
    });
  });

  it("uses IdSet binding for id-typed is-in filters", () => {
    const idField: PropertyField = { ...propertyField, type: { kind: "primitive", type: "Id" } };

    const result = build([{ field: idField, operator: "is-in", value: ["0x1", "0x2"] }]);

    expect(result).to.deep.equal({
      where: `[field-id] IN (SELECT id FROM IdSet(:${ECSQL_PREFIX}vf0) ECSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES)`,
      bindings: { [`${ECSQL_PREFIX}vf0`]: { type: "idset", value: ["0x1", "0x2"] } },
    });
  });

  it("uses IdSet binding for navigation is-in filters", () => {
    const navigationField: PropertyField = {
      ...propertyField,
      type: { kind: "navigation", targetClassName: "TestSchema.Related" },
    };

    const result = build([{ field: navigationField, operator: "is-in", value: ["0x1", "0x2"] }]);

    expect(result).to.deep.equal({
      where: `[field-id].[Id] IN (SELECT id FROM IdSet(:${ECSQL_PREFIX}vf0) ECSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES)`,
      bindings: { [`${ECSQL_PREFIX}vf0`]: { type: "idset", value: ["0x1", "0x2"] } },
    });
  });

  it("appends Id member for scalar navigation filters", () => {
    const navigationField: PropertyField = {
      ...propertyField,
      type: { kind: "navigation", targetClassName: "TestSchema.Related" },
    };

    const result = build([{ field: navigationField, operator: "is-equal", value: "0x1" }]);

    expect(result).to.deep.equal({
      where: `[field-id].[Id] = :${ECSQL_PREFIX}vf0`,
      bindings: { [`${ECSQL_PREFIX}vf0`]: { type: "id", value: "0x1" } },
    });
  });

  it("ignores member for scalar navigation filters", () => {
    const navigationField: PropertyField = {
      ...propertyField,
      type: { kind: "navigation", targetClassName: "TestSchema.Related" },
    };

    const result = build([{ field: navigationField, member: "x", operator: "is-equal", value: "0x1" }]);

    expect(result).to.deep.equal({
      where: `[field-id].[Id] = :${ECSQL_PREFIX}vf0`,
      bindings: { [`${ECSQL_PREFIX}vf0`]: { type: "id", value: "0x1" } },
    });
  });

  it("uses IdSet binding for id-typed is-not-in filters", () => {
    const idField: PropertyField = { ...propertyField, type: { kind: "primitive", type: "Id" } };

    const result = build([{ field: idField, operator: "is-not-in", value: ["0x1", "0x2"] }]);

    expect(result).to.deep.equal({
      where: `[field-id] NOT IN (SELECT id FROM IdSet(:${ECSQL_PREFIX}vf0) ECSQLOPTIONS ENABLE_EXPERIMENTAL_FEATURES)`,
      bindings: { [`${ECSQL_PREFIX}vf0`]: { type: "idset", value: ["0x1", "0x2"] } },
    });
  });

  it("uses inline bindings for non-id is-in filters", () => {
    const result = build([{ field: stringField, operator: "is-in", value: ["A", "B"] }]);

    expect(result).to.deep.equal({
      where: `[field-id] IN (:${ECSQL_PREFIX}vf0_0, :${ECSQL_PREFIX}vf0_1)`,
      bindings: {
        [`${ECSQL_PREFIX}vf0_0`]: { type: "string", value: "A" },
        [`${ECSQL_PREFIX}vf0_1`]: { type: "string", value: "B" },
      },
    });
  });

  it("uses inline bindings for non-id is-not-in filters", () => {
    const result = build([{ field: stringField, operator: "is-not-in", value: ["A", "B"] }]);

    expect(result).to.deep.equal({
      where: `[field-id] NOT IN (:${ECSQL_PREFIX}vf0_0, :${ECSQL_PREFIX}vf0_1)`,
      bindings: {
        [`${ECSQL_PREFIX}vf0_0`]: { type: "string", value: "A" },
        [`${ECSQL_PREFIX}vf0_1`]: { type: "string", value: "B" },
      },
    });
  });

  it("returns false condition for empty is-in filters", () => {
    expect(build([{ field: propertyField, operator: "is-in", value: [] }])).to.deep.equal({
      where: "FALSE",
      bindings: {},
    });
  });

  it("returns true condition for empty is-not-in filters", () => {
    expect(build([{ field: propertyField, operator: "is-not-in", value: [] }])).to.deep.equal({
      where: "TRUE",
      bindings: {},
    });
  });

  it("builds inferred bindings for composite members", () => {
    const structField: PropertyField = { ...propertyField, type: { kind: "struct", members: [] } };

    const result = build([{ field: structField, member: "Street", operator: "is-equal", value: "Main" }]);

    expect(result).to.deep.equal({
      where: `[field-id].[Street] = :${ECSQL_PREFIX}vf0`,
      bindings: { [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "Main" } },
    });
  });
});

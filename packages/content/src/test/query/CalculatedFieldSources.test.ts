/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  renderCalculatedExpression,
  renderSourceClassJoin,
  resolveCalculatedFieldSources,
  SOURCE_CLASS_ALIAS_PREFIX,
} from "../../content/query/CalculatedFieldSources.js";
import { createEntityClass, createSchemaAccess } from "../MetadataStubs.js";

import type { ContentSource } from "../../content/ContentTarget.js";
import type { CalculatedField } from "../../content/model/Field.js";

const sourceAlias0 = `${SOURCE_CLASS_ALIAS_PREFIX}0`;
const sourceAlias1 = `${SOURCE_CLASS_ALIAS_PREFIX}1`;

const base = createEntityClass({ fullName: "TestSchema.Base" });
const pump = createEntityClass({ fullName: "TestSchema.Pump", baseClass: base });
const wall = createEntityClass({ fullName: "TestSchema.Wall", baseClass: base });
const imodelAccess = createSchemaAccess([base, pump, wall]);

function createField(
  props: Pick<CalculatedField, "sourceClassName" | "primaryClassNames"> & Partial<CalculatedField>,
): CalculatedField {
  return {
    kind: "calculated",
    id: "p_v1:calc",
    label: "Calc",
    type: { kind: "primitive", type: "Double" },
    expression: "this.FlowRate * 60",
    ...props,
  };
}

function createSource(primaryClass: CalculatedField["sourceClassName"], resolvedPrimaryClasses: string[]) {
  return {
    target: { primaryClass },
    resolvedPrimaryClasses,
    resolvedDeclarations: [],
    resolvedExternalInputs: [],
  } as ContentSource;
}

describe("resolveCalculatedFieldSources", () => {
  it("evaluates a field against the primary alias when the source's class is its source class or derives from it", async () => {
    const field = createField({ sourceClassName: "TestSchema.Base", primaryClassNames: ["TestSchema.Pump"] });
    const sources = await resolveCalculatedFieldSources({
      schemaProvider: imodelAccess,
      source: createSource("TestSchema.Pump", ["TestSchema.Pump"]),
      fields: [field],
    });
    expect(sources).to.deep.equal({ aliases: new Map([[field.id, "this"]]), joins: [] });
  });

  it("joins the source class of a field narrower than the source's class", async () => {
    const field = createField({ sourceClassName: "TestSchema.Pump", primaryClassNames: ["TestSchema.Pump"] });
    const sources = await resolveCalculatedFieldSources({
      schemaProvider: imodelAccess,
      source: createSource("TestSchema.Base", ["TestSchema.Pump", "TestSchema.Wall"]),
      fields: [field],
    });
    expect(sources).to.deep.equal({
      aliases: new Map([[field.id, sourceAlias0]]),
      joins: [{ className: "TestSchema.Pump", alias: sourceAlias0 }],
    });
  });

  it("shares one join between fields declared on the same class and dedupes repeated fields", async () => {
    const first = createField({
      id: "first",
      sourceClassName: "TestSchema.Pump",
      primaryClassNames: ["TestSchema.Pump"],
    });
    const second = createField({
      id: "second",
      sourceClassName: "TestSchema.Pump",
      primaryClassNames: ["TestSchema.Pump"],
    });
    const wallField = createField({
      id: "wall",
      sourceClassName: "TestSchema.Wall",
      primaryClassNames: ["TestSchema.Wall"],
    });
    const sources = await resolveCalculatedFieldSources({
      schemaProvider: imodelAccess,
      source: createSource("TestSchema.Base", ["TestSchema.Pump", "TestSchema.Wall"]),
      fields: [first, second, first, wallField],
    });
    expect(sources).to.deep.equal({
      aliases: new Map([
        ["first", sourceAlias0],
        ["second", sourceAlias0],
        ["wall", sourceAlias1],
      ]),
      joins: [
        { className: "TestSchema.Pump", alias: sourceAlias0 },
        { className: "TestSchema.Wall", alias: sourceAlias1 },
      ],
    });
  });

  it("omits a field applying to none of the source's classes", async () => {
    const field = createField({ sourceClassName: "TestSchema.Pump", primaryClassNames: ["TestSchema.Pump"] });
    const sources = await resolveCalculatedFieldSources({
      schemaProvider: imodelAccess,
      source: createSource("TestSchema.Base", ["TestSchema.Wall"]),
      fields: [field],
    });
    expect(sources).to.deep.equal({ aliases: new Map(), joins: [] });
  });

  it("falls back to the target's class when no concrete classes were resolved", async () => {
    const field = createField({ sourceClassName: "TestSchema.Pump", primaryClassNames: ["TestSchema.Pump"] });
    const sources = await resolveCalculatedFieldSources({
      schemaProvider: imodelAccess,
      source: createSource("TestSchema.Pump", []),
      fields: [field],
    });
    expect(sources.aliases).to.deep.equal(new Map([[field.id, "this"]]));
  });
});

describe("renderSourceClassJoin", () => {
  it("outer-joins the class on the primary instance id", () => {
    expect(renderSourceClassJoin({ className: "TestSchema.Pump", alias: sourceAlias0 })).to.equal(
      `LEFT OUTER JOIN [TestSchema].[Pump] [${sourceAlias0}] ON [${sourceAlias0}].[ECInstanceId] = [this].[ECInstanceId]`,
    );
  });

  it("honors a custom primary alias", () => {
    expect(renderSourceClassJoin({ className: "TestSchema.Pump", alias: sourceAlias0 }, "e")).to.equal(
      `LEFT OUTER JOIN [TestSchema].[Pump] [${sourceAlias0}] ON [${sourceAlias0}].[ECInstanceId] = [e].[ECInstanceId]`,
    );
  });
});

describe("renderCalculatedExpression", () => {
  const field = createField({ sourceClassName: "TestSchema.Pump", primaryClassNames: ["TestSchema.Pump"] });

  it("renders a parenthesized expression against the primary alias", () => {
    expect(renderCalculatedExpression({ field, alias: "this" })).to.equal("([this].FlowRate * 60)");
  });

  it("honors a custom target alias", () => {
    expect(
      renderCalculatedExpression({
        field: { ...field, expression: "p.FlowRate + 2", targetAlias: "p" },
        alias: "this",
      }),
    ).to.equal("([this].FlowRate + 2)");
  });

  it("guards an expression against a joined class's alias, so primaries outside the class yield NULL", () => {
    expect(renderCalculatedExpression({ field, alias: sourceAlias0 })).to.equal(
      `IIF([${sourceAlias0}].[ECInstanceId] IS NOT NULL, ([${sourceAlias0}].FlowRate * 60), NULL)`,
    );
  });

  it("honors a custom target alias and primary alias for a joined class's alias", () => {
    expect(
      renderCalculatedExpression({
        field: { ...field, expression: "p.FlowRate", targetAlias: "p" },
        alias: sourceAlias0,
        primaryAlias: "e",
      }),
    ).to.equal(`IIF([${sourceAlias0}].[ECInstanceId] IS NOT NULL, ([${sourceAlias0}].FlowRate), NULL)`);
  });
});

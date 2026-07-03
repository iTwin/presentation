/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from "vitest";
import { trimWhitespace } from "@itwin/presentation-shared";
import { convertECExpressionToECSql } from "../../../content/extensions/ecexpressions/ECExpressionToECSql.js";

import type { IInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const labelSelectClauseFactory: IInstanceLabelSelectClauseFactory = {
  async createSelectClause(props) {
    return `LABEL(${props.classAlias}${props.className ? `, ${props.className}` : ""})`;
  },
};

describe("convertECExpressionToECSql", () => {
  describe("literals", () => {
    it("emits integer literals inline", async () => {
      expect(await convertECExpressionToECSql({ expression: "42" })).to.deep.equal({ ecsql: "42" });
    });

    it("emits double literals inline", async () => {
      expect(await convertECExpressionToECSql({ expression: "1.5" })).to.deep.equal({ ecsql: "1.5" });
    });

    it("emits a number starting with a decimal point", async () => {
      expect(await convertECExpressionToECSql({ expression: ".5" })).to.deep.equal({ ecsql: ".5" });
    });

    it("emits numbers in exponent notation", async () => {
      expect(await convertECExpressionToECSql({ expression: "1e2" })).to.deep.equal({ ecsql: "1e2" });
      expect(await convertECExpressionToECSql({ expression: "2.5E-3" })).to.deep.equal({ ecsql: "2.5E-3" });
    });

    it("emits hexadecimal literals unchanged", async () => {
      expect(await convertECExpressionToECSql({ expression: "0xFF" })).to.deep.equal({ ecsql: "0xFF" });
    });

    it("emits boolean literals case-insensitively", async () => {
      expect(await convertECExpressionToECSql({ expression: "True" })).to.deep.equal({ ecsql: "TRUE" });
      expect(await convertECExpressionToECSql({ expression: "TRUE" })).to.deep.equal({ ecsql: "TRUE" });
      expect(await convertECExpressionToECSql({ expression: "false" })).to.deep.equal({ ecsql: "FALSE" });
    });

    it("emits the NULL literal case-insensitively", async () => {
      expect(await convertECExpressionToECSql({ expression: "Null" })).to.deep.equal({ ecsql: "NULL" });
      expect(await convertECExpressionToECSql({ expression: "NULL" })).to.deep.equal({ ecsql: "NULL" });
      expect(await convertECExpressionToECSql({ expression: "null" })).to.deep.equal({ ecsql: "NULL" });
    });

    it("binds string literals", async () => {
      expect(await convertECExpressionToECSql({ expression: `"abc"` })).to.deep.equal({
        ecsql: ":pres_expr0",
        bindings: { pres_expr0: { type: "string", value: "abc" } },
      });
    });

    it("decodes escaped quotes in string literals", async () => {
      expect(await convertECExpressionToECSql({ expression: `"a""b"` })).to.deep.equal({
        ecsql: ":pres_expr0",
        bindings: { pres_expr0: { type: "string", value: `a"b` } },
      });
    });
  });

  describe("bindings", () => {
    it("produces string bindings", async () => {
      expect(
        await convertECExpressionToECSql({ expression: `Set("a", "b").AnyMatches(x => x = this.V)` }),
      ).to.deep.equal({
        ecsql: "[this].[V] IN (:pres_expr0, :pres_expr1)",
        bindings: { pres_expr0: { type: "string", value: "a" }, pres_expr1: { type: "string", value: "b" } },
      });
    });

    it("produces integer bindings", async () => {
      expect(await convertECExpressionToECSql({ expression: "Set(1, 2).AnyMatches(x => x = this.V)" })).to.deep.equal({
        ecsql: "[this].[V] IN (:pres_expr0, :pres_expr1)",
        bindings: { pres_expr0: { type: "int", value: 1 }, pres_expr1: { type: "int", value: 2 } },
      });
    });

    it("produces double bindings", async () => {
      expect(await convertECExpressionToECSql({ expression: "Set(1.5).AnyMatches(x => x = this.V)" })).to.deep.equal({
        ecsql: "[this].[V] IN (:pres_expr0)",
        bindings: { pres_expr0: { type: "double", value: 1.5 } },
      });
    });

    it("produces boolean bindings", async () => {
      expect(
        await convertECExpressionToECSql({ expression: "Set(True, False).AnyMatches(x => x = this.V)" }),
      ).to.deep.equal({
        ecsql: "[this].[V] IN (:pres_expr0, :pres_expr1)",
        bindings: { pres_expr0: { type: "boolean", value: true }, pres_expr1: { type: "boolean", value: false } },
      });
    });

    it("produces null bindings", async () => {
      expect(await convertECExpressionToECSql({ expression: "Set(Null).AnyMatches(x => x = this.V)" })).to.deep.equal({
        ecsql: "[this].[V] IN (:pres_expr0)",
        bindings: { pres_expr0: { type: "string", value: undefined } },
      });
    });

    it("produces id bindings", async () => {
      expect(
        await convertECExpressionToECSql({
          expression: "SelectedInstanceKeys.AnyMatches(x => x = this.ECInstanceId)",
          context: { getSelectedInstanceIds: () => ["0x1", "0x2"] },
        }),
      ).to.deep.equal({
        ecsql: "[this].[ECInstanceId] IN (:pres_expr0, :pres_expr1)",
        bindings: { pres_expr0: { type: "id", value: "0x1" }, pres_expr1: { type: "id", value: "0x2" } },
      });
    });
  });

  describe("properties", () => {
    it("brackets property access with default alias", async () => {
      expect(await convertECExpressionToECSql({ expression: "this.PropertyName" })).to.deep.equal({
        ecsql: "[this].[PropertyName]",
      });
    });

    it("substitutes the primary class alias", async () => {
      expect(await convertECExpressionToECSql({ expression: "this.Prop", primaryClassAlias: "x" })).to.deep.equal({
        ecsql: "[x].[Prop]",
      });
    });

    it("brackets nested property access", async () => {
      expect(await convertECExpressionToECSql({ expression: "this.Code.Value" })).to.deep.equal({
        ecsql: "[this].[Code].[Value]",
      });
    });
  });

  describe("operators", () => {
    it("emits arithmetic with precedence", async () => {
      expect(await convertECExpressionToECSql({ expression: "1 + 2 * 3" })).to.deep.equal({ ecsql: "1 + 2 * 3" });
    });

    it("emits a lower-precedence operator trailing a higher-precedence one", async () => {
      expect(await convertECExpressionToECSql({ expression: "this.A * this.B + this.C" })).to.deep.equal({
        ecsql: "[this].[A] * [this].[B] + [this].[C]",
      });
    });

    it("emits division", async () => {
      expect(await convertECExpressionToECSql({ expression: "10 / 2" })).to.deep.equal({ ecsql: "10 / 2" });
    });

    it("preserves explicit parentheses", async () => {
      expect(await convertECExpressionToECSql({ expression: "(1 + 2) * 3" })).to.deep.equal({ ecsql: "(1 + 2) * 3" });
    });

    it("emits comparison operators", async () => {
      expect(await convertECExpressionToECSql({ expression: "this.A < 5" })).to.deep.equal({ ecsql: "[this].[A] < 5" });
      expect(await convertECExpressionToECSql({ expression: "this.A <= 5" })).to.deep.equal({
        ecsql: "[this].[A] <= 5",
      });
      expect(await convertECExpressionToECSql({ expression: "this.A > 5" })).to.deep.equal({ ecsql: "[this].[A] > 5" });
      expect(await convertECExpressionToECSql({ expression: "this.A >= 5" })).to.deep.equal({
        ecsql: "[this].[A] >= 5",
      });
      expect(await convertECExpressionToECSql({ expression: "this.A <> 5" })).to.deep.equal({
        ecsql: "[this].[A] <> 5",
      });
    });

    it("emits logical operators", async () => {
      expect(await convertECExpressionToECSql({ expression: "this.A And this.B Or this.C" })).to.deep.equal({
        ecsql: "[this].[A] AND [this].[B] OR [this].[C]",
      });
    });

    it("maps AndAlso and OrElse to AND and OR", async () => {
      expect(await convertECExpressionToECSql({ expression: "this.A AndAlso this.B" })).to.deep.equal({
        ecsql: "[this].[A] AND [this].[B]",
      });
      expect(await convertECExpressionToECSql({ expression: "this.A OrElse this.B" })).to.deep.equal({
        ecsql: "[this].[A] OR [this].[B]",
      });
    });

    it("maps Mod to %", async () => {
      expect(await convertECExpressionToECSql({ expression: "5 Mod 2" })).to.deep.equal({ ecsql: "5 % 2" });
    });

    it("maps integer division to CAST", async () => {
      expect(await convertECExpressionToECSql({ expression: "7 \\ 2" })).to.deep.equal({
        ecsql: "CAST(7 / 2 AS INTEGER)",
      });
    });

    it("maps concatenation to ||", async () => {
      expect(await convertECExpressionToECSql({ expression: `"a" & "b"` })).to.deep.equal({
        ecsql: ":pres_expr0 || :pres_expr1",
        bindings: { pres_expr0: { type: "string", value: "a" }, pres_expr1: { type: "string", value: "b" } },
      });
    });

    it("maps ~ to a LIKE comparison", async () => {
      expect(await convertECExpressionToECSql({ expression: `this.Name ~ "A%"` })).to.deep.equal({
        ecsql: `CAST([this].[Name] AS TEXT) LIKE :pres_expr0 ESCAPE '\\'`,
        bindings: { pres_expr0: { type: "string", value: "A%" } },
      });
    });

    it("emits bit-shift operators", async () => {
      expect(await convertECExpressionToECSql({ expression: "this.A << 2" })).to.deep.equal({
        ecsql: "[this].[A] << 2",
      });
      expect(await convertECExpressionToECSql({ expression: "this.A >> 2" })).to.deep.equal({
        ecsql: "[this].[A] >> 2",
      });
    });

    it("emits null comparisons using IS", async () => {
      expect(await convertECExpressionToECSql({ expression: "this.Prop = Null" })).to.deep.equal({
        ecsql: "[this].[Prop] IS NULL",
      });
      expect(await convertECExpressionToECSql({ expression: "this.Prop <> Null" })).to.deep.equal({
        ecsql: "[this].[Prop] IS NOT NULL",
      });
      expect(await convertECExpressionToECSql({ expression: "Null = this.Prop" })).to.deep.equal({
        ecsql: "[this].[Prop] IS NULL",
      });
      expect(await convertECExpressionToECSql({ expression: "Null <> this.Prop" })).to.deep.equal({
        ecsql: "[this].[Prop] IS NOT NULL",
      });
    });

    it("emits unary negation and NOT", async () => {
      expect(await convertECExpressionToECSql({ expression: "-5" })).to.deep.equal({ ecsql: "-5" });
      expect(await convertECExpressionToECSql({ expression: "Not this.Flag" })).to.deep.equal({
        ecsql: "NOT [this].[Flag]",
      });
    });
  });

  describe("mapped functions", () => {
    it("maps IIf", async () => {
      expect(await convertECExpressionToECSql({ expression: "IIf(this.A, 1, 2)" })).to.deep.equal({
        ecsql: "IIF([this].[A], 1, 2)",
      });
    });

    it("maps IsNull", async () => {
      expect(await convertECExpressionToECSql({ expression: "IsNull(this.A)" })).to.deep.equal({
        ecsql: "([this].[A]) IS NULL",
      });
    });

    it("maps IfNull", async () => {
      expect(await convertECExpressionToECSql({ expression: "IfNull(this.A, 0)" })).to.deep.equal({
        ecsql: "IFNULL([this].[A], 0)",
      });
    });

    it("maps GetECClassId to ec_classid", async () => {
      expect(await convertECExpressionToECSql({ expression: `GetECClassId("MyClass", "MySchema")` })).to.deep.equal({
        ecsql: "ec_classid(:pres_expr0, :pres_expr1)",
        bindings: {
          pres_expr0: { type: "string", value: "MyClass" },
          pres_expr1: { type: "string", value: "MySchema" },
        },
      });
    });

    it("maps IsOfClass to an IS check", async () => {
      expect(await convertECExpressionToECSql({ expression: `this.IsOfClass("MyClass", "MySchema")` })).to.deep.equal({
        ecsql: "[this].[ECClassId] IS (MySchema.MyClass)",
      });
    });

    it("passes unknown functions through", async () => {
      expect(await convertECExpressionToECSql({ expression: "Upper(this.Name)" })).to.deep.equal({
        ecsql: "Upper([this].[Name])",
      });
    });

    it("passes a function without arguments through", async () => {
      expect(await convertECExpressionToECSql({ expression: "Now()" })).to.deep.equal({ ecsql: "Now()" });
    });
  });

  describe("labels", () => {
    it("emits a label select clause for the method form", async () => {
      expect(
        await convertECExpressionToECSql({ expression: "this.GetDisplayLabel()", labelSelectClauseFactory }),
      ).to.deep.equal({ ecsql: "LABEL(this)" });
    });

    it("uses the primary class name when available", async () => {
      expect(
        await convertECExpressionToECSql({
          expression: "this.GetDisplayLabel()",
          primaryClassAlias: "x",
          primaryClassName: "Schema.Class",
          labelSelectClauseFactory,
        }),
      ).to.deep.equal({ ecsql: "LABEL(x, Schema.Class)" });
    });

    it("emits a label select clause for a non-primary receiver", async () => {
      expect(
        await convertECExpressionToECSql({ expression: "rel.GetDisplayLabel()", labelSelectClauseFactory }),
      ).to.deep.equal({ ecsql: "LABEL(rel)" });
    });

    it("throws when no label factory is provided", async () => {
      await expect(convertECExpressionToECSql({ expression: "this.GetDisplayLabel()" })).rejects.toThrow(
        /labelSelectClauseFactory/,
      );
    });

    it("throws when GetDisplayLabel is called as a free function", async () => {
      await expect(
        convertECExpressionToECSql({ expression: "GetDisplayLabel(this)", labelSelectClauseFactory }),
      ).rejects.toThrow(/must be called on an instance/);
    });
  });

  describe("related instances", () => {
    it("emits EXISTS for the HasRelatedInstance string form (backward)", async () => {
      const result = await convertECExpressionToECSql({
        expression: `this.HasRelatedInstance("BisCore:ModelContainsElements", "Backward", "BisCore:Model")`,
      });
      expect(result.bindings).to.be.undefined;
      expect(trimWhitespace(result.ecsql)).to.equal(
        trimWhitespace(`
          EXISTS (
            SELECT 1
            FROM [BisCore].[ModelContainsElements] [relationship]
            JOIN [BisCore].[Model] [related]
              ON [related].[ECClassId] = [relationship].[SourceECClassId] AND [related].[ECInstanceId] = [relationship].[SourceECInstanceId]
            WHERE [relationship].[TargetECClassId] = [this].[ECClassId] AND [relationship].[TargetECInstanceId] = [this].[ECInstanceId]
          )
        `),
      );
    });

    it("emits COUNT for the GetRelatedInstancesCount string form (forward)", async () => {
      const result = await convertECExpressionToECSql({
        expression: `this.GetRelatedInstancesCount("BisCore:ModelContainsElements", "Forward", "BisCore:Element")`,
      });
      expect(trimWhitespace(result.ecsql)).to.equal(
        trimWhitespace(`
          (
            SELECT COUNT(1)
            FROM [BisCore].[ModelContainsElements] [relationship]
            JOIN [BisCore].[Element] [related]
              ON [related].[ECClassId] = [relationship].[TargetECClassId] AND [related].[ECInstanceId] = [relationship].[TargetECInstanceId]
            WHERE [relationship].[SourceECClassId] = [this].[ECClassId] AND [relationship].[SourceECInstanceId] = [this].[ECInstanceId]
          )
        `),
      );
    });

    it("emits a scalar subquery for the GetRelatedValue string form", async () => {
      const result = await convertECExpressionToECSql({
        expression: `this.GetRelatedValue("BisCore:ModelContainsElements", "Forward", "BisCore:Element", "UserLabel")`,
      });
      expect(trimWhitespace(result.ecsql)).to.equal(
        trimWhitespace(`
          (
            SELECT [related].[UserLabel]
            FROM [BisCore].[ModelContainsElements] [relationship]
            JOIN [BisCore].[Element] [related]
              ON [related].[ECClassId] = [relationship].[TargetECClassId] AND [related].[ECInstanceId] = [relationship].[TargetECInstanceId]
            WHERE [relationship].[SourceECClassId] = [this].[ECClassId] AND [relationship].[SourceECInstanceId] = [this].[ECInstanceId]
            LIMIT 1
          )
        `),
      );
    });

    it("emits a label subquery for the GetRelatedDisplayLabel string form", async () => {
      const result = await convertECExpressionToECSql({
        expression: `this.GetRelatedDisplayLabel("BisCore:ModelContainsElements", "Forward", "BisCore:Element")`,
        labelSelectClauseFactory,
      });
      expect(trimWhitespace(result.ecsql)).to.equal(
        trimWhitespace(`
          (
            SELECT LABEL(related, BisCore.Element)
            FROM [BisCore].[ModelContainsElements] [relationship]
            JOIN [BisCore].[Element] [related]
              ON [related].[ECClassId] = [relationship].[TargetECClassId] AND [related].[ECInstanceId] = [relationship].[TargetECInstanceId]
            WHERE [relationship].[SourceECClassId] = [this].[ECClassId] AND [relationship].[SourceECInstanceId] = [this].[ECInstanceId]
            LIMIT 1
          )
        `),
      );
    });

    it("emits EXISTS for the HasRelatedInstance lambda form", async () => {
      const result = await convertECExpressionToECSql({
        expression: `this.HasRelatedInstance("BisCore:Element", e => e.UserLabel = "test")`,
      });
      expect(trimWhitespace(result.ecsql)).to.equal(
        trimWhitespace(`
          EXISTS (
            SELECT 1
            FROM [BisCore].[Element] [e]
            WHERE [e].[UserLabel] = :pres_expr0
          )
        `),
      );
      expect(result.bindings).to.deep.equal({ pres_expr0: { type: "string", value: "test" } });
    });

    it("emits COUNT for the GetRelatedInstancesCount lambda form", async () => {
      const result = await convertECExpressionToECSql({
        expression: `this.GetRelatedInstancesCount("BisCore:Element", e => e.Name = "x")`,
      });
      expect(trimWhitespace(result.ecsql)).to.equal(
        trimWhitespace(`
          (
            SELECT COUNT(1)
            FROM [BisCore].[Element] [e]
            WHERE [e].[Name] = :pres_expr0
          )
        `),
      );
      expect(result.bindings).to.deep.equal({ pres_expr0: { type: "string", value: "x" } });
    });

    it("emits a scalar subquery for the GetRelatedValue lambda form", async () => {
      const result = await convertECExpressionToECSql({
        expression: `this.GetRelatedValue("BisCore:Element", "UserLabel", e => e.Name = "x")`,
      });
      expect(trimWhitespace(result.ecsql)).to.equal(
        trimWhitespace(`
          (
            SELECT [e].[UserLabel]
            FROM [BisCore].[Element] [e]
            WHERE [e].[Name] = :pres_expr0
            LIMIT 1
          )
        `),
      );
      expect(result.bindings).to.deep.equal({ pres_expr0: { type: "string", value: "x" } });
    });

    it("emits a label subquery for the GetRelatedDisplayLabel lambda form", async () => {
      const result = await convertECExpressionToECSql({
        expression: `this.GetRelatedDisplayLabel("BisCore:Element", e => e.Name = "x")`,
        labelSelectClauseFactory,
      });
      expect(trimWhitespace(result.ecsql)).to.equal(
        trimWhitespace(`
          (
            SELECT LABEL(e, BisCore.Element)
            FROM [BisCore].[Element] [e]
            WHERE [e].[Name] = :pres_expr0
            LIMIT 1
          )
        `),
      );
      expect(result.bindings).to.deep.equal({ pres_expr0: { type: "string", value: "x" } });
    });
  });

  describe("AnyMatches", () => {
    it("emits IN for equality against a Set", async () => {
      expect(
        await convertECExpressionToECSql({ expression: "Set(1, 2, 3).AnyMatches(x => x = this.Value)" }),
      ).to.deep.equal({
        ecsql: "[this].[Value] IN (:pres_expr0, :pres_expr1, :pres_expr2)",
        bindings: {
          pres_expr0: { type: "int", value: 1 },
          pres_expr1: { type: "int", value: 2 },
          pres_expr2: { type: "int", value: 3 },
        },
      });
    });

    it("handles the lambda parameter on the right of an equality", async () => {
      expect(await convertECExpressionToECSql({ expression: `Set("a").AnyMatches(x => this.V = x)` })).to.deep.equal({
        ecsql: "[this].[V] IN (:pres_expr0)",
        bindings: { pres_expr0: { type: "string", value: "a" } },
      });
    });

    it("emits IN for SelectedInstanceKeys", async () => {
      const result = await convertECExpressionToECSql({
        expression: "SelectedInstanceKeys.AnyMatches(x => x = this.ECInstanceId)",
        context: { getSelectedInstanceIds: () => ["0x1", "0x2"] },
      });
      expect(result).to.deep.equal({
        ecsql: "[this].[ECInstanceId] IN (:pres_expr0, :pres_expr1)",
        bindings: { pres_expr0: { type: "id", value: "0x1" }, pres_expr1: { type: "id", value: "0x2" } },
      });
    });

    it("emits FALSE for an empty selection", async () => {
      expect(
        await convertECExpressionToECSql({
          expression: "SelectedInstanceKeys.AnyMatches(x => x = this.ECInstanceId)",
          context: { getSelectedInstanceIds: () => [] },
        }),
      ).to.deep.equal({ ecsql: "FALSE" });
    });

    it("emits an OR chain for non-equality conditions", async () => {
      expect(
        await convertECExpressionToECSql({ expression: "Set(1, 2).AnyMatches(x => x > this.Value)" }),
      ).to.deep.equal({
        ecsql: "(:pres_expr0 > [this].[Value] OR :pres_expr1 > [this].[Value])",
        bindings: { pres_expr0: { type: "int", value: 1 }, pres_expr1: { type: "int", value: 2 } },
      });
    });

    it("emits an OR chain when neither side references the lambda parameter", async () => {
      expect(await convertECExpressionToECSql({ expression: "Set(1).AnyMatches(x => this.A = this.B)" })).to.deep.equal(
        { ecsql: "([this].[A] = [this].[B])", bindings: { pres_expr0: { type: "int", value: 1 } } },
      );
    });

    it("throws when SelectedInstanceKeys has no hook", async () => {
      await expect(
        convertECExpressionToECSql({ expression: "SelectedInstanceKeys.AnyMatches(x => x = this.ECInstanceId)" }),
      ).rejects.toThrow(/getSelectedInstanceIds/);
    });

    it("throws when a Set item is not a literal", async () => {
      await expect(
        convertECExpressionToECSql({ expression: "Set(this.X).AnyMatches(x => x = this.V)" }),
      ).rejects.toThrow(/literal/);
    });

    it("throws for an unsupported function list source", async () => {
      await expect(
        convertECExpressionToECSql({ expression: `GetVariableIntValues("x").AnyMatches(x => x = this.V)` }),
      ).rejects.toThrow(/not supported/);
    });

    it("throws for an unsupported list source", async () => {
      await expect(convertECExpressionToECSql({ expression: "this.Rel.AnyMatches(x => x = this.V)" })).rejects.toThrow(
        /list source/,
      );
      await expect(convertECExpressionToECSql({ expression: `Foo("x").AnyMatches(x => x = this.V)` })).rejects.toThrow(
        /list source/,
      );
    });

    it("throws when AnyMatches receives a non-lambda argument", async () => {
      await expect(convertECExpressionToECSql({ expression: "x.AnyMatches(5)" })).rejects.toThrow(/AnyMatches/);
    });
  });

  describe("context symbols", () => {
    it("resolves context symbols from the nested member map", async () => {
      const result = await convertECExpressionToECSql({
        expression: "this.Id = ParentNode.ECInstanceId",
        context: { resolveRoot: (root) => (root === "ParentNode" ? { ECInstanceId: "0x10" } : undefined) },
      });
      expect(result).to.deep.equal({
        ecsql: "[this].[Id] = :pres_expr0",
        bindings: { pres_expr0: { type: "string", value: "0x10" } },
      });
    });

    it("walks nested member objects", async () => {
      expect(
        await convertECExpressionToECSql({
          expression: "ParentNode.Parent.ECInstanceId",
          context: { resolveRoot: () => ({ Parent: { ECInstanceId: "0x20" } }) },
        }),
      ).to.deep.equal({ ecsql: ":pres_expr0", bindings: { pres_expr0: { type: "string", value: "0x20" } } });
    });

    it("binds numeric resolved values by kind", async () => {
      expect(
        await convertECExpressionToECSql({
          expression: "ParentNode.Level",
          context: { resolveRoot: () => ({ Level: 42 }) },
        }),
      ).to.deep.equal({ ecsql: ":pres_expr0", bindings: { pres_expr0: { type: "int", value: 42 } } });
      expect(
        await convertECExpressionToECSql({
          expression: "ParentNode.Ratio",
          context: { resolveRoot: () => ({ Ratio: 1.5 }) },
        }),
      ).to.deep.equal({ ecsql: ":pres_expr0", bindings: { pres_expr0: { type: "double", value: 1.5 } } });
    });

    it("emits a property reference when the root is not resolved", async () => {
      expect(await convertECExpressionToECSql({ expression: "ParentNode.ECInstanceId" })).to.deep.equal({
        ecsql: "[ParentNode].[ECInstanceId]",
      });
      expect(
        await convertECExpressionToECSql({
          expression: "ParentNode.ECInstanceId",
          context: { resolveRoot: () => undefined },
        }),
      ).to.deep.equal({ ecsql: "[ParentNode].[ECInstanceId]" });
    });

    it("throws when a resolved root is missing the accessed member", async () => {
      await expect(
        convertECExpressionToECSql({ expression: "ParentNode.Missing", context: { resolveRoot: () => ({}) } }),
      ).rejects.toThrow(/Unable to resolve/);
    });

    it("throws when the path descends past a leaf value", async () => {
      await expect(
        convertECExpressionToECSql({
          expression: "ParentNode.Level.Deeper",
          context: { resolveRoot: () => ({ Level: 1 }) },
        }),
      ).rejects.toThrow(/Unable to resolve/);
    });

    it("throws when the path stops on an intermediate object", async () => {
      await expect(
        convertECExpressionToECSql({
          expression: "ParentNode.Parent",
          context: { resolveRoot: () => ({ Parent: { ECInstanceId: "0x20" } }) },
        }),
      ).rejects.toThrow(/Unable to resolve/);
    });
  });

  describe("error handling", () => {
    it("throws for an empty expression", async () => {
      await expect(convertECExpressionToECSql({ expression: "" })).rejects.toThrow(/empty/);
    });

    it("throws for DateTime literals", async () => {
      await expect(convertECExpressionToECSql({ expression: "@123" })).rejects.toThrow(/DateTime/);
    });

    it("throws for array indexing", async () => {
      await expect(convertECExpressionToECSql({ expression: "this.Arr[0]" })).rejects.toThrow(/Array indexing/);
    });

    it("throws for an unterminated string", async () => {
      await expect(convertECExpressionToECSql({ expression: `"abc` })).rejects.toThrow(/Unterminated/);
    });

    it("throws for a stray character", async () => {
      await expect(convertECExpressionToECSql({ expression: "this.A # 1" })).rejects.toThrow(/Unexpected character/);
    });

    it("throws for unsupported operators", async () => {
      await expect(convertECExpressionToECSql({ expression: "2 ^ 3" })).rejects.toThrow(/not supported/);
      await expect(convertECExpressionToECSql({ expression: "1 >>> 2" })).rejects.toThrow(/not supported/);
      await expect(convertECExpressionToECSql({ expression: "this.A Xor this.B" })).rejects.toThrow(/Xor/);
    });

    it("throws for a trailing token", async () => {
      await expect(convertECExpressionToECSql({ expression: "1 2" })).rejects.toThrow(/Unexpected token/);
      await expect(convertECExpressionToECSql({ expression: "this.A this.B" })).rejects.toThrow(/Unexpected token/);
    });

    it("throws for a token that cannot start an expression", async () => {
      await expect(convertECExpressionToECSql({ expression: "," })).rejects.toThrow(/Unexpected token/);
    });

    it("throws for a missing closing parenthesis", async () => {
      await expect(convertECExpressionToECSql({ expression: "(1 + 2" })).rejects.toThrow(/Expected '\)'/);
    });

    it("throws for a dangling member access", async () => {
      await expect(convertECExpressionToECSql({ expression: "this." })).rejects.toThrow(/Expected an identifier/);
    });

    it("throws when accessing a member on a call result", async () => {
      await expect(convertECExpressionToECSql({ expression: "Foo().Bar" })).rejects.toThrow(/Cannot access member/);
    });

    it("throws when calling a method on a call result", async () => {
      await expect(convertECExpressionToECSql({ expression: "Foo().Baz()" })).rejects.toThrow(/Cannot call method/);
    });

    it("throws for blacklisted functions", async () => {
      await expect(convertECExpressionToECSql({ expression: `GetFormattedValue(this.Prop, "en")` })).rejects.toThrow(
        /not supported/,
      );
      await expect(convertECExpressionToECSql({ expression: `GetVariableStringValue("x")` })).rejects.toThrow(
        /not supported/,
      );
      await expect(convertECExpressionToECSql({ expression: `GetSettingValue("x")` })).rejects.toThrow(/not supported/);
      await expect(convertECExpressionToECSql({ expression: `CompareDateTimes(this.A, this.B)` })).rejects.toThrow(
        /not supported/,
      );
    });

    it("throws for an unsupported method call", async () => {
      await expect(convertECExpressionToECSql({ expression: "this.Foo()" })).rejects.toThrow(/Unsupported method/);
    });

    it("throws when a passthrough function receives a lambda argument", async () => {
      await expect(convertECExpressionToECSql({ expression: "Upper(x => x)" })).rejects.toThrow(/lambda/);
    });

    it("throws when IsNull has the wrong number of arguments", async () => {
      await expect(convertECExpressionToECSql({ expression: "IsNull(this.A, this.B)" })).rejects.toThrow(
        /single argument/,
      );
    });

    it("throws when IsOfClass is called without a receiver", async () => {
      await expect(convertECExpressionToECSql({ expression: `IsOfClass("MyClass", "MySchema")` })).rejects.toThrow(
        /must be called on an instance/,
      );
    });

    it("throws for the IsOfClass id overload", async () => {
      await expect(convertECExpressionToECSql({ expression: "this.IsOfClass(this.ClassId)" })).rejects.toThrow(
        /id overload/,
      );
    });

    it("throws when a related-instance function is called without a receiver", async () => {
      await expect(
        convertECExpressionToECSql({ expression: `HasRelatedInstance("A:B", "Forward", "C:D")` }),
      ).rejects.toThrow(/must be called on an instance/);
    });

    it("throws for a non-string related-instance argument", async () => {
      await expect(convertECExpressionToECSql({ expression: "this.HasRelatedInstance(123)" })).rejects.toThrow(
        /string literal/,
      );
    });

    it("throws for an invalid full class name", async () => {
      await expect(
        convertECExpressionToECSql({ expression: `this.HasRelatedInstance("NoColon", "Forward", "Bis:Model")` }),
      ).rejects.toThrow(/Invalid full class name/);
    });

    it("throws for an invalid related property identifier", async () => {
      await expect(
        convertECExpressionToECSql({ expression: `this.GetRelatedValue("S:C", "Forward", "S2:C2", "Bad Name")` }),
      ).rejects.toThrow(/Invalid identifier/);
    });

    it("throws for an invalid relationship direction", async () => {
      await expect(
        convertECExpressionToECSql({
          expression: `this.HasRelatedInstance("BisCore:Rel", "Sideways", "BisCore:Model")`,
        }),
      ).rejects.toThrow(/direction/);
    });
  });
});

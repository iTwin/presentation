/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
// cspell:words rilt

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConcatenatedValueJsonSelector,
  createRawPropertyValueSelector,
} from "../../shared/ecsql-snippets/ECSqlValueSelectorSnippets.js";
import { createIModelInstanceLabelSelectClauseFactory } from "../../shared/instance-label-factory-impls/IModelInstanceLabelSelectClauseFactory.js";
import { trimWhitespace } from "../../shared/Utils.js";
import { createECSchemaProviderStub } from "../MetadataProviderStub.js";

import type { ECSqlQueryExecutor } from "../../shared/ECSqlCore.js";
import type { IInstanceLabelSelectClauseFactory } from "../../shared/InstanceLabelSelectClauseFactory.js";

describe("createIModelInstanceLabelSelectClauseFactory", () => {
  function mockQueryRows(
    payloads: Array<Record<string, unknown>>,
  ): AsyncIterableIterator<
    ECSqlQueryExecutor extends { createQueryReader(...args: any[]): infer R }
      ? Awaited<R> extends AsyncIterable<infer T>
        ? T
        : never
      : never
  > {
    return (async function* () {
      for (const payload of payloads) {
        yield payload;
      }
    })();
  }

  function wrapRulesetInRow(ruleset: object): Record<string, unknown> {
    return { jsonProperties: JSON.stringify(ruleset) };
  }

  const createQueryReaderMock = vi.fn<ECSqlQueryExecutor["createQueryReader"]>();
  const classDerivesFromMock = vi.fn<(derived: string, base: string) => Promise<boolean>>();
  let schemaProvider: ReturnType<typeof createECSchemaProviderStub>;
  const imodelAccess = {
    createQueryReader: createQueryReaderMock,
    classDerivesFrom: classDerivesFromMock,
    getSchema: async (schemaName: string) => schemaProvider.getSchema(schemaName),
  };
  const defaultClauseFactory: IInstanceLabelSelectClauseFactory = {
    async createSelectClause() {
      return "default selector";
    },
  };

  beforeEach(() => {
    createQueryReaderMock.mockReset();
    classDerivesFromMock.mockReset();
    classDerivesFromMock.mockResolvedValue(false);
    schemaProvider = createECSchemaProviderStub();
  });

  function makeRuleset(rules: object[]) {
    return { rules };
  }

  describe("ruleset loading", () => {
    it("returns default clause when no rulesets are loaded (empty query result)", async () => {
      createQueryReaderMock.mockReturnValue(mockQueryRows([]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(result).toBe("default selector");
    });

    it("returns default clause when ruleset has no InstanceLabelOverride rules", async () => {
      const ruleset = makeRuleset([{ ruleType: "ContentRule" }]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(result).toBe("default selector");
    });

    it("falls back to default when query throws schema-absence error", async () => {
      createQueryReaderMock.mockReturnValue(
        (async function* () {
          throw new Error("Schema 'PresentationRules.Ruleset' does not exist");
        })() as ReturnType<ECSqlQueryExecutor["createQueryReader"]>,
      );
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      // Should NOT throw — should fall back to default
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(result).toBe("default selector");
    });

    it("re-throws non-schema-absence query errors", async () => {
      const queryError = new Error("Some unrelated query failure");
      createQueryReaderMock.mockReturnValue(
        (async function* () {
          throw queryError;
        })() as ReturnType<ECSqlQueryExecutor["createQueryReader"]>,
      );
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      await expect(factory.createSelectClause({ classAlias: "test" })).rejects.toThrow(queryError);
    });

    it("ignores malformed JSON rows without failing", async () => {
      createQueryReaderMock.mockReturnValue(mockQueryRows([{ jsonProperties: "not valid {json" }]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(result).toBe("default selector");
    });

    it("ignores null-payload rows", async () => {
      createQueryReaderMock.mockReturnValue(mockQueryRows([{ jsonProperties: null }]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(result).toBe("default selector");
    });

    it("skips rules with empty values array", async () => {
      const ruleset = makeRuleset([
        { ruleType: "InstanceLabelOverride", class: { schemaName: "Schema", className: "A" }, values: [] },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(result).toBe("default selector");
    });

    it("ignores rows where parsed JSON is not an object", async () => {
      createQueryReaderMock.mockReturnValue(mockQueryRows([{ jsonProperties: "42" }]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(result).toBe("default selector");
    });

    it("treats ruleset without rules array as having no rules", async () => {
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow({ notRules: "something" })]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(result).toBe("default selector");
    });

    it("falls back to default when query throws a non-Error value", async () => {
      createQueryReaderMock.mockReturnValue(
        (async function* () {
          // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal
          throw "string error";
        })() as ReturnType<ECSqlQueryExecutor["createQueryReader"]>,
      );
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      await expect(factory.createSelectClause({ classAlias: "test" })).rejects.toBe("string error");
    });
  });

  describe("Property spec", () => {
    it("compiles Property spec into raw property selector", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          priority: 1000,
          values: [{ specType: "Property", propertyName: "UserLabel" }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF([test].[ECClassId] IS (Schema.A), [test].[UserLabel], NULL),
            default selector
          )
        `),
      );
    });

    describe("with propertySource", () => {
      it("compiles Property spec with single-step forward propertySource into correlated subquery", async () => {
        const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
        const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
        schemaProvider.stubRelationshipClass({
          schemaName: "S",
          className: "Rel",
          source: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classA),
          },
          target: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classB),
          },
        });

        const ruleset = makeRuleset([
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "S", className: "A" },
            values: [
              {
                specType: "Property",
                propertyName: "PropB",
                propertySource: {
                  relationship: { schemaName: "S", className: "Rel" },
                  direction: "Forward",
                  targetClass: { schemaName: "S", className: "B" },
                },
              },
            ],
          },
        ]);
        createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
        const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
        const result = await factory.createSelectClause({ classAlias: "test" });
        expect(trimWhitespace(result)).toBe(
          trimWhitespace(`
            COALESCE(
              IIF(
                [test].[ECClassId] IS (S.A),
                (
                  SELECT [pres_pst0].[PropB]
                  FROM [S].[A] [pres_src0]
                  INNER JOIN [S].[Rel] [pres_r0_0] ON [pres_r0_0].[SourceECInstanceId] = [pres_src0].[ECInstanceId]
                  INNER JOIN [S].[B] [pres_pst0] ON [pres_pst0].[ECInstanceId] = [pres_r0_0].[TargetECInstanceId]
                  WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                  LIMIT 1
                ),
                NULL
              ),
              default selector
            )
          `),
        );
      });

      it("compiles Property spec with single-step backward propertySource into correlated subquery", async () => {
        const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
        const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
        schemaProvider.stubRelationshipClass({
          schemaName: "S",
          className: "Rel",
          source: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classA),
          },
          target: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classB),
          },
        });

        const ruleset = makeRuleset([
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "S", className: "B" },
            values: [
              {
                specType: "Property",
                propertyName: "PropA",
                propertySource: {
                  relationship: { schemaName: "S", className: "Rel" },
                  direction: "Backward",
                  targetClass: { schemaName: "S", className: "A" },
                },
              },
            ],
          },
        ]);
        createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
        const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
        const result = await factory.createSelectClause({ classAlias: "test" });
        expect(trimWhitespace(result)).toBe(
          trimWhitespace(`
            COALESCE(
              IIF(
                [test].[ECClassId] IS (S.B),
                (
                  SELECT [pres_pst0].[PropA]
                  FROM [S].[B] [pres_src0]
                  INNER JOIN [S].[Rel] [pres_r0_0] ON [pres_r0_0].[TargetECInstanceId] = [pres_src0].[ECInstanceId]
                  INNER JOIN [S].[A] [pres_pst0] ON [pres_pst0].[ECInstanceId] = [pres_r0_0].[SourceECInstanceId]
                  WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                  LIMIT 1
                ),
                NULL
              ),
              default selector
            )
          `),
        );
      });

      it("compiles Property spec with multi-step propertySource (forward then backward)", async () => {
        const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
        const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
        const classC = schemaProvider.stubEntityClass({ schemaName: "S", className: "C" });
        schemaProvider.stubRelationshipClass({
          schemaName: "S",
          className: "Rel1",
          source: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classA),
          },
          target: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classB),
          },
        });
        schemaProvider.stubRelationshipClass({
          schemaName: "S",
          className: "Rel2",
          source: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classC),
          },
          target: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classB),
          },
        });

        const ruleset = makeRuleset([
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "S", className: "A" },
            values: [
              {
                specType: "Property",
                propertyName: "PropC",
                propertySource: [
                  {
                    relationship: { schemaName: "S", className: "Rel1" },
                    direction: "Forward",
                    targetClass: { schemaName: "S", className: "B" },
                  },
                  {
                    relationship: { schemaName: "S", className: "Rel2" },
                    direction: "Backward",
                    targetClass: { schemaName: "S", className: "C" },
                  },
                ],
              },
            ],
          },
        ]);
        createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
        const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
        const result = await factory.createSelectClause({ classAlias: "test" });
        expect(trimWhitespace(result)).toBe(
          trimWhitespace(`
            COALESCE(
              IIF(
                [test].[ECClassId] IS (S.A),
                (
                  SELECT [pres_pst0].[PropC]
                  FROM [S].[A] [pres_src0]
                  INNER JOIN [S].[Rel1] [pres_r0_0] ON [pres_r0_0].[SourceECInstanceId] = [pres_src0].[ECInstanceId]
                  INNER JOIN [S].[B] [pres_m0_0] ON [pres_m0_0].[ECInstanceId] = [pres_r0_0].[TargetECInstanceId]
                  INNER JOIN [S].[Rel2] [pres_r0_1] ON [pres_r0_1].[TargetECInstanceId] = [pres_m0_0].[ECInstanceId]
                  INNER JOIN [S].[C] [pres_pst0] ON [pres_pst0].[ECInstanceId] = [pres_r0_1].[SourceECInstanceId]
                  WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                  LIMIT 1
                ),
                NULL
              ),
              default selector
            )
          `),
        );
      });

      it("compiles Property spec with propertySource where targetClass is omitted, inferred from relationship", async () => {
        const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
        const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
        schemaProvider.stubRelationshipClass({
          schemaName: "S",
          className: "Rel",
          source: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classA),
          },
          target: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classB),
          },
        });

        const ruleset = makeRuleset([
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "S", className: "A" },
            values: [
              {
                specType: "Property",
                propertyName: "PropB",
                propertySource: { relationship: { schemaName: "S", className: "Rel" }, direction: "Forward" },
              },
            ],
          },
        ]);
        createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
        const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
        const result = await factory.createSelectClause({ classAlias: "test" });
        expect(trimWhitespace(result)).toBe(
          trimWhitespace(`
            COALESCE(
              IIF(
                [test].[ECClassId] IS (S.A),
                (
                  SELECT [pres_pst0].[PropB]
                  FROM [S].[A] [pres_src0]
                  INNER JOIN [S].[Rel] [pres_r0_0] ON [pres_r0_0].[SourceECInstanceId] = [pres_src0].[ECInstanceId]
                  INNER JOIN [S].[B] [pres_pst0] ON [pres_pst0].[ECInstanceId] = [pres_r0_0].[TargetECInstanceId]
                  WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                  LIMIT 1
                ),
                NULL
              ),
              default selector
            )
          `),
        );
      });

      it("compiles Property with propertySource inside Composite spec", async () => {
        const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
        const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
        schemaProvider.stubRelationshipClass({
          schemaName: "S",
          className: "Rel",
          source: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classA),
          },
          target: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(classB),
          },
        });

        const ruleset = makeRuleset([
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "S", className: "A" },
            values: [
              {
                specType: "Composite",
                parts: [
                  {
                    spec: {
                      specType: "Property",
                      propertyName: "PropB",
                      propertySource: {
                        relationship: { schemaName: "S", className: "Rel" },
                        direction: "Forward",
                        targetClass: { schemaName: "S", className: "B" },
                      },
                    },
                  },
                ],
              },
            ],
          },
        ]);
        createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
        const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
        const result = await factory.createSelectClause({ classAlias: "test" });
        expect(trimWhitespace(result)).toBe(
          trimWhitespace(`
            COALESCE(
              IIF(
                [test].[ECClassId] IS (S.A),
                json_array((
                  SELECT [pres_pst0].[PropB]
                  FROM [S].[A] [pres_src0]
                  INNER JOIN [S].[Rel] [pres_r0_0] ON [pres_r0_0].[SourceECInstanceId] = [pres_src0].[ECInstanceId]
                  INNER JOIN [S].[B] [pres_pst0] ON [pres_pst0].[ECInstanceId] = [pres_r0_0].[TargetECInstanceId]
                  WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                  LIMIT 1
                )),
                NULL
              ),
              default selector
            )
          `),
        );
      });
      it("returns NULL when propertySource is an empty array", async () => {
        const ruleset = makeRuleset([
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "S", className: "A" },
            values: [{ specType: "Property", propertyName: "Prop", propertySource: [] }],
          },
        ]);
        createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
        const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
        const result = await factory.createSelectClause({ classAlias: "test" });
        expect(trimWhitespace(result)).toBe(
          trimWhitespace(`
            COALESCE(
              IIF([test].[ECClassId] IS (S.A), NULL, NULL),
              default selector
            )
          `),
        );
      });

      it("throws when propertySource references a non-relationship class and targetClass is omitted", async () => {
        schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
        schemaProvider.stubEntityClass({ schemaName: "S", className: "NotARel" });
        const ruleset = makeRuleset([
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "S", className: "A" },
            values: [
              {
                specType: "Property",
                propertyName: "Prop",
                propertySource: { relationship: { schemaName: "S", className: "NotARel" }, direction: "Forward" },
              },
            ],
          },
        ]);
        createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
        const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
        await expect(factory.createSelectClause({ classAlias: "test" })).rejects.toThrow("is not a relationship class");
      });

      it("throws when propertySource relationship endpoint has no abstract constraint and targetClass is omitted", async () => {
        schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
        schemaProvider.stubRelationshipClass({
          schemaName: "S",
          className: "Rel",
          source: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(undefined),
          },
          target: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(undefined),
          },
        });
        const ruleset = makeRuleset([
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "S", className: "A" },
            values: [
              {
                specType: "Property",
                propertyName: "Prop",
                propertySource: { relationship: { schemaName: "S", className: "Rel" }, direction: "Forward" },
              },
            ],
          },
        ]);
        createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
        const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
        await expect(factory.createSelectClause({ classAlias: "test" })).rejects.toThrow(
          "does not have an abstract constraint",
        );
      });

      it("throws when backward propertySource relationship endpoint has no abstract constraint and targetClass is omitted", async () => {
        schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
        schemaProvider.stubRelationshipClass({
          schemaName: "S",
          className: "Rel",
          source: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(undefined),
          },
          target: {
            polymorphic: true,
            multiplicity: { lowerLimit: 0, upperLimit: 1 },
            abstractConstraint: Promise.resolve(undefined),
          },
        });
        const ruleset = makeRuleset([
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "S", className: "A" },
            values: [
              {
                specType: "Property",
                propertyName: "Prop",
                propertySource: { relationship: { schemaName: "S", className: "Rel" }, direction: "Backward" },
              },
            ],
          },
        ]);
        createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
        const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
        await expect(factory.createSelectClause({ classAlias: "test" })).rejects.toThrow(
          "does not have an abstract constraint",
        );
      });
    });
  });

  describe("String spec", () => {
    it("compiles String spec into typed value selector", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [{ specType: "String", value: "constant label" }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (Schema.A),
              ${createConcatenatedValueJsonSelector([{ value: "constant label", type: "String" }])},
              NULL
            ),
            default selector
          )
        `),
      );
    });
  });

  describe("ClassName spec", () => {
    it("compiles ClassName spec (not full) into class name subquery", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [{ specType: "ClassName", full: false }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (Schema.A),
              ec_classname(${createRawPropertyValueSelector("test", "ECClassId")}, 'c'),
              NULL
            ),
            default selector
          )
        `),
      );
    });

    it("compiles ClassName spec (full) into full class name subquery with schema join", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [{ specType: "ClassName", full: true }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (Schema.A),
              ec_classname(${createRawPropertyValueSelector("test", "ECClassId")}, 's.c'),
              NULL
            ),
            default selector
          )
        `),
      );
    });
  });

  describe("ClassLabel spec", () => {
    it("compiles ClassLabel spec into display label subquery", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [{ specType: "ClassLabel" }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (Schema.A),
              (
                SELECT COALESCE(
                  ${createRawPropertyValueSelector("c", "DisplayLabel")},
                  ${createRawPropertyValueSelector("c", "Name")}
                )
                FROM [meta].[ECClassDef] AS [c]
                WHERE [c].[ECInstanceId] = ${createRawPropertyValueSelector("test", "ECClassId")}
              ),
              NULL
            ),
            default selector
          )
        `),
      );
    });
  });

  describe("BriefcaseId spec", () => {
    it("compiles BriefcaseId spec into base36 expression", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [{ specType: "BriefcaseId" }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (Schema.A),
              CAST(base36([test].[ECInstanceId] >> 40) AS TEXT),
              NULL
            ),
            default selector
          )
        `),
      );
    });
  });

  describe("LocalId spec", () => {
    it("compiles LocalId spec into base36 expression", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [{ specType: "LocalId" }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (Schema.A),
              CAST(base36([test].[ECInstanceId] & ((1 << 40) - 1)) AS TEXT),
              NULL
            ),
            default selector
          )
        `),
      );
    });
  });

  describe("Composite spec", () => {
    it("compiles Composite spec with separator and required parts check", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [
            {
              specType: "Composite",
              separator: "-",
              parts: [
                { spec: { specType: "Property", propertyName: "FirstName" }, isRequired: true },
                { spec: { specType: "Property", propertyName: "LastName" } },
              ],
            },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (Schema.A),
              ${createConcatenatedValueJsonSelector(
                [
                  { selector: createRawPropertyValueSelector("test", "FirstName") },
                  { value: "-", type: "String" },
                  { selector: createRawPropertyValueSelector("test", "LastName") },
                ],
                `IFNULL(${createRawPropertyValueSelector("test", "FirstName")}, '') <> ''`,
              )},
              NULL
            ),
            default selector
          )
        `),
      );
    });
    it("compiles Composite spec with empty parts as empty string", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [{ specType: "Composite", parts: [] }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF([test].[ECClassId] IS (Schema.A), '', NULL),
            default selector
          )
        `),
      );
    });
  });

  describe("RelatedInstanceLabel spec", () => {
    it("compiles RelatedInstanceLabel spec with single-step forward path into correlated subquery", async () => {
      const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
      const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
      schemaProvider.stubRelationshipClass({
        schemaName: "S",
        className: "Rel",
        source: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classA),
        },
        target: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classB),
        },
      });

      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "S", className: "A" },
          values: [
            {
              specType: "RelatedInstanceLabel",
              pathToRelatedInstance: {
                relationship: { schemaName: "S", className: "Rel" },
                direction: "Forward",
                targetClass: { schemaName: "S", className: "B" },
              },
            },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (S.A),
              (
                SELECT default selector
                FROM [S].[A] [pres_src0]
                INNER JOIN [S].[Rel] [pres_r0_0] ON [pres_r0_0].[SourceECInstanceId] = [pres_src0].[ECInstanceId]
                INNER JOIN [S].[B] [pres_rilt0] ON [pres_rilt0].[ECInstanceId] = [pres_r0_0].[TargetECInstanceId]
                WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                LIMIT 1
              ),
              NULL
            ),
            default selector
          )
        `),
      );
    });

    it("compiles RelatedInstanceLabel spec with single-step backward path into correlated subquery", async () => {
      const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
      const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
      schemaProvider.stubRelationshipClass({
        schemaName: "S",
        className: "Rel",
        source: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classA),
        },
        target: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classB),
        },
      });

      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "S", className: "B" },
          values: [
            {
              specType: "RelatedInstanceLabel",
              pathToRelatedInstance: {
                relationship: { schemaName: "S", className: "Rel" },
                direction: "Backward",
                targetClass: { schemaName: "S", className: "A" },
              },
            },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (S.B),
              (
                SELECT default selector
                FROM [S].[B] [pres_src0]
                INNER JOIN [S].[Rel] [pres_r0_0] ON [pres_r0_0].[TargetECInstanceId] = [pres_src0].[ECInstanceId]
                INNER JOIN [S].[A] [pres_rilt0] ON [pres_rilt0].[ECInstanceId] = [pres_r0_0].[SourceECInstanceId]
                WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                LIMIT 1
              ),
              NULL
            ),
            default selector
          )
        `),
      );
    });

    it("compiles RelatedInstanceLabel spec where targetClass is omitted, inferred from relationship", async () => {
      const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
      const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
      schemaProvider.stubRelationshipClass({
        schemaName: "S",
        className: "Rel",
        source: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classA),
        },
        target: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classB),
        },
      });

      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "S", className: "A" },
          values: [
            {
              specType: "RelatedInstanceLabel",
              pathToRelatedInstance: { relationship: { schemaName: "S", className: "Rel" }, direction: "Forward" },
            },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (S.A),
              (
                SELECT default selector
                FROM [S].[A] [pres_src0]
                INNER JOIN [S].[Rel] [pres_r0_0] ON [pres_r0_0].[SourceECInstanceId] = [pres_src0].[ECInstanceId]
                INNER JOIN [S].[B] [pres_rilt0] ON [pres_rilt0].[ECInstanceId] = [pres_r0_0].[TargetECInstanceId]
                WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                LIMIT 1
              ),
              NULL
            ),
            default selector
          )
        `),
      );
    });

    it("compiles RelatedInstanceLabel inside Composite spec", async () => {
      const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
      const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
      schemaProvider.stubRelationshipClass({
        schemaName: "S",
        className: "Rel",
        source: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classA),
        },
        target: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classB),
        },
      });

      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "S", className: "A" },
          values: [
            {
              specType: "Composite",
              parts: [
                {
                  spec: {
                    specType: "RelatedInstanceLabel",
                    pathToRelatedInstance: {
                      relationship: { schemaName: "S", className: "Rel" },
                      direction: "Forward",
                      targetClass: { schemaName: "S", className: "B" },
                    },
                  },
                },
              ],
            },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (S.A),
              json_array((
                SELECT default selector
                FROM [S].[A] [pres_src0]
                INNER JOIN [S].[Rel] [pres_r0_0] ON [pres_r0_0].[SourceECInstanceId] = [pres_src0].[ECInstanceId]
                INNER JOIN [S].[B] [pres_rilt0] ON [pres_rilt0].[ECInstanceId] = [pres_r0_0].[TargetECInstanceId]
                WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                LIMIT 1
              )),
              NULL
            ),
            default selector
          )
        `),
      );
    });

    it("detects RelatedInstanceLabel cycle and breaks recursion by returning NULL", async () => {
      const classA = schemaProvider.stubEntityClass({ schemaName: "S", className: "A" });
      const classB = schemaProvider.stubEntityClass({ schemaName: "S", className: "B" });
      schemaProvider.stubRelationshipClass({
        schemaName: "S",
        className: "RelAB",
        source: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classA),
        },
        target: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classB),
        },
      });
      schemaProvider.stubRelationshipClass({
        schemaName: "S",
        className: "RelBA",
        source: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classB),
        },
        target: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(classA),
        },
      });

      classDerivesFromMock.mockImplementation(async (derived: string, base: string) => derived === base);

      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "S", className: "A" },
          values: [
            {
              specType: "RelatedInstanceLabel",
              pathToRelatedInstance: {
                relationship: { schemaName: "S", className: "RelAB" },
                direction: "Forward",
                targetClass: { schemaName: "S", className: "B" },
              },
            },
          ],
        },
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "S", className: "B" },
          values: [
            {
              specType: "RelatedInstanceLabel",
              pathToRelatedInstance: {
                relationship: { schemaName: "S", className: "RelBA" },
                direction: "Forward",
                targetClass: { schemaName: "S", className: "A" },
              },
            },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });

      // Should complete without infinite recursion
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (S.A),
              (
                SELECT COALESCE(
                    IIF(
                      [pres_rilt0].[ECClassId] IS (S.B),
                      (
                        SELECT COALESCE(
                            IIF(
                              [pres_rilt1].[ECClassId] IS (S.A),
                              NULL,
                              NULL
                            ),
                            default selector
                          )
                        FROM [S].[B] [pres_src1]
                        INNER JOIN [S].[RelBA] [pres_r1_0] ON [pres_r1_0].[SourceECInstanceId] = [pres_src1].[ECInstanceId]
                        INNER JOIN [S].[A] [pres_rilt1] ON [pres_rilt1].[ECInstanceId] = [pres_r1_0].[TargetECInstanceId]
                        WHERE [pres_src1].[ECInstanceId] = [pres_rilt0].[ECInstanceId]
                        LIMIT 1
                      ),
                      NULL
                    ),
                    default selector
                  )
                FROM [S].[A] [pres_src0]
                INNER JOIN [S].[RelAB] [pres_r0_0] ON [pres_r0_0].[SourceECInstanceId] = [pres_src0].[ECInstanceId]
                INNER JOIN [S].[B] [pres_rilt0] ON [pres_rilt0].[ECInstanceId] = [pres_r0_0].[TargetECInstanceId]
                WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                LIMIT 1
              ),
              NULL
            ),
            IIF(
              [test].[ECClassId] IS (S.B),
              (
                SELECT COALESCE(
                    IIF(
                      [pres_rilt0].[ECClassId] IS (S.A),
                      (
                        SELECT COALESCE(
                            IIF(
                              [pres_rilt1].[ECClassId] IS (S.B),
                              NULL,
                              NULL
                            ),
                            default selector
                          )
                        FROM [S].[A] [pres_src1]
                        INNER JOIN [S].[RelAB] [pres_r1_0] ON [pres_r1_0].[SourceECInstanceId] = [pres_src1].[ECInstanceId]
                        INNER JOIN [S].[B] [pres_rilt1] ON [pres_rilt1].[ECInstanceId] = [pres_r1_0].[TargetECInstanceId]
                        WHERE [pres_src1].[ECInstanceId] = [pres_rilt0].[ECInstanceId]
                        LIMIT 1
                      ),
                      NULL
                    ),
                    default selector
                  )
                FROM [S].[B] [pres_src0]
                INNER JOIN [S].[RelBA] [pres_r0_0] ON [pres_r0_0].[SourceECInstanceId] = [pres_src0].[ECInstanceId]
                INNER JOIN [S].[A] [pres_rilt0] ON [pres_rilt0].[ECInstanceId] = [pres_r0_0].[TargetECInstanceId]
                WHERE [pres_src0].[ECInstanceId] = [test].[ECInstanceId]
                LIMIT 1
              ),
              NULL
            ),
            default selector
          )
        `),
      );
    });
    it("returns NULL when pathToRelatedInstance is an empty array", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "S", className: "A" },
          values: [{ specType: "RelatedInstanceLabel", pathToRelatedInstance: [] }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF([test].[ECClassId] IS (S.A), NULL, NULL),
            default selector
          )
        `),
      );
    });

    it("returns empty string when relationship endpoint has no abstract constraint and targetClass is omitted", async () => {
      schemaProvider.stubRelationshipClass({
        schemaName: "S",
        className: "Rel",
        source: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(undefined),
        },
        target: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(undefined),
        },
      });
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "S", className: "A" },
          values: [
            {
              specType: "RelatedInstanceLabel",
              pathToRelatedInstance: { relationship: { schemaName: "S", className: "Rel" }, direction: "Forward" },
            },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF([test].[ECClassId] IS (S.A), '', NULL),
            default selector
          )
        `),
      );
    });

    it("returns empty string when backward relationship endpoint has no abstract constraint and targetClass is omitted", async () => {
      schemaProvider.stubRelationshipClass({
        schemaName: "S",
        className: "Rel",
        source: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(undefined),
        },
        target: {
          polymorphic: true,
          multiplicity: { lowerLimit: 0, upperLimit: 1 },
          abstractConstraint: Promise.resolve(undefined),
        },
      });
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "S", className: "A" },
          values: [
            {
              specType: "RelatedInstanceLabel",
              pathToRelatedInstance: { relationship: { schemaName: "S", className: "Rel" }, direction: "Backward" },
            },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF([test].[ECClassId] IS (S.A), '', NULL),
            default selector
          )
        `),
      );
    });
  });

  describe("rule compilation", () => {
    it("produces COALESCE for multiple value specs in one rule", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [
            { specType: "Property", propertyName: "UserLabel" },
            { specType: "Property", propertyName: "CodeValue" },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF(
              [test].[ECClassId] IS (Schema.A),
              COALESCE([test].[UserLabel], [test].[CodeValue]),
              NULL
            ),
            default selector
          )
        `),
      );
    });

    it("includes override rules for multiple classes from same ruleset", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [{ specType: "Property", propertyName: "NameA" }],
        },
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "B" },
          values: [{ specType: "Property", propertyName: "NameB" }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(trimWhitespace(result)).toBe(
        trimWhitespace(`
          COALESCE(
            IIF([test].[ECClassId] IS (Schema.A), [test].[NameA], NULL),
            IIF([test].[ECClassId] IS (Schema.B), [test].[NameB], NULL),
            default selector
          )
        `),
      );
    });

    it("places higher-priority rule before lower-priority rule in COALESCE chain", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          priority: 500,
          values: [{ specType: "Property", propertyName: "LowPriorityProp" }],
        },
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          priority: 1000,
          values: [{ specType: "Property", propertyName: "HighPriorityProp" }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      // HighPriorityProp appears first in the COALESCE chain
      const highPriorityIndex = result.indexOf("HighPriorityProp");
      const lowPriorityIndex = result.indexOf("LowPriorityProp");
      expect(highPriorityIndex).toBeLessThan(lowPriorityIndex);
    });

    it("preserves source order for rules with equal priority", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          priority: 1000,
          values: [{ specType: "Property", propertyName: "FirstProp" }],
        },
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          priority: 1000,
          values: [{ specType: "Property", propertyName: "SecondProp" }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({ classAlias: "test" });
      const firstIndex = result.indexOf("FirstProp");
      const secondIndex = result.indexOf("SecondProp");
      expect(firstIndex).toBeLessThan(secondIndex);
    });

    it("caches ruleset load: query reader is called only once for multiple `createSelectClause` calls", async () => {
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [{ specType: "Property", propertyName: "Name" }],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      await factory.createSelectClause({ classAlias: "test" });
      await factory.createSelectClause({ classAlias: "test2" });
      expect(createQueryReaderMock).toHaveBeenCalledTimes(1);
    });

    it("respects custom `selectorsConcatenator` for Composite parts", async () => {
      const customConcatenator = vi.fn().mockReturnValue("custom-concat-result");
      const ruleset = makeRuleset([
        {
          ruleType: "InstanceLabelOverride",
          class: { schemaName: "Schema", className: "A" },
          values: [
            {
              specType: "Composite",
              separator: "|",
              parts: [{ spec: { specType: "Property", propertyName: "Name" } }],
            },
          ],
        },
      ]);
      createQueryReaderMock.mockReturnValue(mockQueryRows([wrapRulesetInRow(ruleset)]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess, defaultClauseFactory });
      const result = await factory.createSelectClause({
        classAlias: "test",
        selectorsConcatenator: customConcatenator,
      });
      expect(result).toContain("custom-concat-result");
      expect(customConcatenator).toHaveBeenCalled();
    });

    it("uses BIS factory as default when defaultClauseFactory is not provided", async () => {
      createQueryReaderMock.mockReturnValue(mockQueryRows([]));
      const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess });
      const result = await factory.createSelectClause({ classAlias: "test" });
      expect(result).toBeTruthy();
    });
  });
});

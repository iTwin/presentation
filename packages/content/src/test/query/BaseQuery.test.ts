/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { ECSql, trimWhitespace } from "@itwin/presentation-shared";
import { ECSQL_PREFIX } from "../../content/InternalUtils.js";
import { serializeRelationshipPath } from "../../content/model/Utils.js";
import { buildBaseQuery } from "../../content/query/BaseQuery.js";

import type { EC, ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentValueFilter } from "../../content/Content.js";
import type { CardinalityHint, ContentSource, ContentTarget } from "../../content/ContentTarget.js";
import type { QueryFilterer } from "../../content/extensions/QueryFilterer.js";
import type { CalculatedField, PropertyField } from "../../content/model/Field.js";

// A schema provider whose classes expose no navigation properties, so the real
// `createRelationshipPathJoinClause` renders every relationship step as a link-table join. Classes
// named `Rel*` are relationship classes (used to classify value-filter property fields); a relationship
// whose name contains `Many` traverses to a 1:many constraint, everything else is 1:1.
const schemaProvider = {
  getSchema: async (schemaName: string) => ({
    getClass: async (className: string) => ({
      fullName: `${schemaName}.${className}`,
      getProperties: async () => [],
      isRelationshipClass: () => className.startsWith("Rel"),
      source: { multiplicity: { lowerLimit: 0, upperLimit: 1 } },
      target: { multiplicity: { lowerLimit: 0, upperLimit: className.includes("Many") ? 2 : 1 } },
    }),
  }),
} as unknown as ECSchemaProvider;
const primaryClass: EC.FullClassNameDotNotation = "TestSchema.Primary";

function makeStep(
  sourceClassName: EC.FullClassNameDotNotation,
  relationshipName: EC.FullClassNameDotNotation,
  targetClassName: EC.FullClassNameDotNotation,
  extra?: Partial<RelationshipPath[number]>,
): RelationshipPath[number] {
  return { sourceClassName, relationshipName, targetClassName, ...extra };
}

function makeSource(paths: RelationshipPath[], target: ContentTarget = { primaryClass }): ContentSource {
  return {
    target,
    resolvedPrimaryClasses: [primaryClass],
    resolvedDeclarations:
      paths.length > 0
        ? [
            {
              providerId: "provider_v1",
              declarationIndex: 0,
              paths: paths.map((path) => ({
                path,
                targetClassNames: [path.length > 0 ? path[path.length - 1].targetClassName : primaryClass],
              })),
            },
          ]
        : [],
  };
}

function makePropertyField(props: Partial<PropertyField> & Pick<PropertyField, "propertyName">): PropertyField {
  return {
    kind: "property",
    id: props.id ?? `field-${props.propertyName}`,
    label: props.propertyName,
    type: props.type ?? { kind: "primitive", type: "String" },
    propertyClassName: props.propertyClassName ?? primaryClass,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: props.valueClassNames ?? [primaryClass],
    selectorId: props.selectorId ?? `selector-${props.propertyName}`,
  };
}

describe("buildBaseQuery", () => {
  describe("FROM + related JOINs", () => {
    it("builds a direct-only query with no related joins", async () => {
      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), includeRelatedJoins: true });

      expect(result.additional).to.be.undefined;
      expect(result.anchor.paths).to.deep.equal([]);
      expect(result.anchor.parts.from).to.equal(`FROM [TestSchema].[Primary] [this]`);
      expect(result.anchor.parts.joins).to.equal("");
      expect(result.anchor.parts.where).to.be.undefined;
      expect(result.anchor.parts.bindings).to.be.undefined;
      expect(result.anchor.parts.primaryClassAlias).to.equal("this");
      expect(result.anchor.parts.relatedClassAliases.size).to.equal(0);
    });

    it("builds a single related-path join with prefixed outer-join aliases", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), includeRelatedJoins: true });

      const key = "TestSchema.Primary-[TestSchema.Rel]->TestSchema.Target";
      expect(result.anchor.parts.relatedClassAliases.get(key)).to.deep.equal({
        target: `${ECSQL_PREFIX}t0`,
        relationship: `${ECSQL_PREFIX}r0`,
      });
      expect(trimWhitespace(result.anchor.parts.joins)).to.equal(
        trimWhitespace(`
          OUTER JOIN (
            SELECT [${ECSQL_PREFIX}r0].*
            FROM [TestSchema].[Rel] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
          ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
          OUTER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        `),
      );
      expect(result.anchor.paths).to.have.length(1);
    });

    it("chains joins for a multi-step path with intermediate prefixes", async () => {
      const path = [
        makeStep(primaryClass, "TestSchema.Rel1", "TestSchema.Mid"),
        makeStep("TestSchema.Mid", "TestSchema.Rel2", "TestSchema.Target"),
      ];
      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), includeRelatedJoins: true });

      const midKey = "TestSchema.Primary-[TestSchema.Rel1]->TestSchema.Mid";
      const fullKey = `${midKey}-[TestSchema.Rel2]->TestSchema.Target`;
      // Aliases are assigned in sorted-key order: the shorter (prefix) key sorts first → index 0.
      expect(result.anchor.parts.relatedClassAliases.get(midKey)).to.deep.equal({
        target: `${ECSQL_PREFIX}t0`,
        relationship: `${ECSQL_PREFIX}r0`,
      });
      expect(result.anchor.parts.relatedClassAliases.get(fullKey)).to.deep.equal({
        target: `${ECSQL_PREFIX}t1`,
        relationship: `${ECSQL_PREFIX}r1`,
      });
      // Emitted parents-before-children; the second join sources from the first prefix's target alias.
      expect(trimWhitespace(result.anchor.parts.joins)).to.equal(
        trimWhitespace(`
          OUTER JOIN (
            SELECT [${ECSQL_PREFIX}r0].*
            FROM [TestSchema].[Rel1] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Mid] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
          ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
          OUTER JOIN [TestSchema].[Mid] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
          OUTER JOIN (
            SELECT [${ECSQL_PREFIX}r1].*
            FROM [TestSchema].[Rel2] [${ECSQL_PREFIX}r1]
            INNER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t1] ON [${ECSQL_PREFIX}t1].[ECInstanceId] = [${ECSQL_PREFIX}r1].[TargetECInstanceId]
          ) [${ECSQL_PREFIX}r1] ON [${ECSQL_PREFIX}r1].[SourceECInstanceId] = [${ECSQL_PREFIX}t0].[ECInstanceId]
          OUTER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t1] ON [${ECSQL_PREFIX}t1].[ECInstanceId] = [${ECSQL_PREFIX}r1].[TargetECInstanceId]
        `),
      );
    });

    it("emits a shared prefix step only once across paths", async () => {
      const shared = makeStep(primaryClass, "TestSchema.Rel1", "TestSchema.Mid");
      const pathB = [shared, makeStep("TestSchema.Mid", "TestSchema.Rel2", "TestSchema.TargetB")];
      const pathC = [shared, makeStep("TestSchema.Mid", "TestSchema.Rel3", "TestSchema.TargetC")];
      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([pathB, pathC]),
        includeRelatedJoins: true,
      });

      // The shared prefix step (joining to `Mid`) is emitted exactly once, even though two paths use it.
      const sharedJoinCount =
        trimWhitespace(result.anchor.parts.joins).split(`OUTER JOIN ${ECSql.createClassSelector("TestSchema.Mid")}`)
          .length - 1;
      expect(sharedJoinCount).to.equal(1);
    });

    it("keeps paths that differ only by a step instance filter as distinct joins", async () => {
      const base = makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target");
      const pathA = [
        { ...base, instanceFilter: { expression: "this.A > 0", bindings: { fa: { type: "int" as const, value: 1 } } } },
      ];
      const pathB = [
        { ...base, instanceFilter: { expression: "this.B > 0", bindings: { fb: { type: "int" as const, value: 2 } } } },
      ];
      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([pathA, pathB]),
        includeRelatedJoins: true,
      });

      // Same classes but different filters => two distinct paths, aliases, and joins (not merged).
      expect(result.anchor.paths).to.have.length(2);
      expect(result.anchor.parts.relatedClassAliases.size).to.equal(2);
      expect(result.anchor.parts.bindings).to.deep.equal({
        fa: { type: "int", value: 1 },
        fb: { type: "int", value: 2 },
      });
    });

    it("de-duplicates identical paths across declaration groups", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const source: ContentSource = {
        target: { primaryClass },
        resolvedPrimaryClasses: [primaryClass],
        resolvedDeclarations: [
          { providerId: "a_v1", declarationIndex: 0, paths: [{ path, targetClassNames: ["TestSchema.Target"] }] },
          { providerId: "b_v1", declarationIndex: 0, paths: [{ path, targetClassNames: ["TestSchema.Target"] }] },
        ],
      };
      const result = await buildBaseQuery({ schemaProvider, source, includeRelatedJoins: true });

      expect(result.anchor.paths).to.have.length(1);
      expect(result.anchor.parts.relatedClassAliases.size).to.equal(1);
    });

    it("ignores zero-step resolved paths", async () => {
      const result = await buildBaseQuery({ schemaProvider, source: makeSource([[]]), includeRelatedJoins: true });

      expect(result.anchor.parts.joins).to.equal("");
      expect(result.anchor.parts.relatedClassAliases.size).to.equal(0);
    });

    it("collects instance-filter bindings from joined steps", async () => {
      const path = [
        makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target", {
          instanceFilter: { expression: "this.Prop > 0", bindings: { stepBinding: { type: "int", value: 1 } } },
        }),
      ];
      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), includeRelatedJoins: true });

      expect(result.anchor.parts.bindings).to.deep.equal({ stepBinding: { type: "int", value: 1 } });
    });

    it("collects a shared-prefix instance-filter binding only once", async () => {
      const shared = makeStep(primaryClass, "TestSchema.Rel1", "TestSchema.Mid", {
        instanceFilter: { expression: "this.X > 0", bindings: { sharedBinding: { type: "int", value: 1 } } },
      });
      const pathB = [shared, makeStep("TestSchema.Mid", "TestSchema.Rel2", "TestSchema.TargetB")];
      const pathC = [shared, makeStep("TestSchema.Mid", "TestSchema.Rel3", "TestSchema.TargetC")];

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([pathB, pathC]),
        includeRelatedJoins: true,
      });

      // Both paths carry the same shared step (and its binding); the merged joins keep it once.
      expect(result.anchor.parts.bindings).to.deep.equal({ sharedBinding: { type: "int", value: 1 } });
      // The shared step is joined exactly once — both paths reference it under the same alias, so it is
      // not duplicated (two aliases would produce two `Mid` joins).
      expect(
        trimWhitespace(result.anchor.parts.joins).split(`OUTER JOIN ${ECSql.createClassSelector("TestSchema.Mid")}`)
          .length - 1,
      ).to.equal(1);
    });
  });

  describe("target filter", () => {
    it("adds an IdSet join and binding for instanceIds", async () => {
      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([], { primaryClass, instanceIds: ["0x1", "0x2"] }),
      });

      expect(result.anchor.parts.joins).to.include(`IdSet(:${ECSQL_PREFIX}TargetInstanceIds)`);
      expect(result.anchor.parts.bindings).to.deep.equal({
        [`${ECSQL_PREFIX}TargetInstanceIds`]: { type: "idset", value: ["0x1", "0x2"] },
      });
      expect(result.anchor.parts.where).to.be.undefined;
    });

    it("adds a substituted WHERE for instanceFilter", async () => {
      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([], {
          primaryClass,
          instanceFilter: {
            expression: "alias.Area > :minArea",
            primaryClassAlias: "alias",
            bindings: { minArea: { type: "double", value: 5 } },
          },
        }),
      });

      expect(result.anchor.parts.where).to.equal("[this].Area > :minArea");
      expect(result.anchor.parts.bindings).to.deep.equal({ minArea: { type: "double", value: 5 } });
    });

    it("combines instanceIds and instanceFilter", async () => {
      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([], { primaryClass, instanceIds: ["0x1"], instanceFilter: { expression: "this.Area > 5" } }),
      });

      expect(result.anchor.parts.joins).to.include(`IdSet(:${ECSQL_PREFIX}TargetInstanceIds)`);
      expect(result.anchor.parts.where).to.equal("[this].Area > 5");
    });
  });

  describe("query filterers", () => {
    it("injects joins, where, and bindings with the primary alias", async () => {
      const getFilterClauses = vi.fn(() => ({
        joins: ["JOIN filterer_table ft ON ft.id = this.ECInstanceId"],
        where: ["ft.flag = 1"],
        bindings: { fb: { type: "int" as const, value: 7 } },
      }));
      const filterer: QueryFilterer = { getFilterClauses };

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), queryFilterers: [filterer] });

      expect(getFilterClauses).toHaveBeenCalledWith({ targetAlias: "this" });
      expect(result.anchor.parts.joins).to.include("JOIN filterer_table ft");
      expect(result.anchor.parts.where).to.equal("ft.flag = 1");
      expect(result.anchor.parts.bindings).to.deep.equal({ fb: { type: "int", value: 7 } });
    });

    it("combines multiple filterers and ANDs their conditions", async () => {
      const filtererA: QueryFilterer = { getFilterClauses: () => ({ where: ["a = 1"] }) };
      const filtererB: QueryFilterer = { getFilterClauses: () => ({ where: ["b = 2"] }) };

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([]),
        queryFilterers: [filtererA, filtererB],
      });

      expect(result.anchor.parts.where).to.equal("(a = 1) AND (b = 2)");
    });

    it("handles a filterer contributing no clauses", async () => {
      const filterer: QueryFilterer = { getFilterClauses: () => ({}) };
      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), queryFilterers: [filterer] });

      expect(result.anchor.parts.joins).to.equal("");
      expect(result.anchor.parts.where).to.be.undefined;
      expect(result.anchor.parts.bindings).to.be.undefined;
    });
  });

  describe("value filters", () => {
    it("resolves a direct property column against the primary alias", async () => {
      const field = makePropertyField({ propertyName: "Length", type: { kind: "primitive", type: "Double" } });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: 1 }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(`[this].[Length] = :${ECSQL_PREFIX}vf0`);
      expect(result.anchor.parts.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "double", value: 1 } });
    });

    it("resolves a related property column against the target alias", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const field = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.Target",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.Target"],
      });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: "abc" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), filters });

      expect(result.anchor.parts.where).to.equal(`[${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0`);
    });

    it("resolves a relationship-class property against the relationship alias", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const field = makePropertyField({
        propertyName: "RelProp",
        propertyClassName: "TestSchema.Rel",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.Rel"],
      });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: "abc" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), filters });

      expect(result.anchor.parts.where).to.equal(`[${ECSQL_PREFIX}r0].[RelProp] = :${ECSQL_PREFIX}vf0`);
    });

    it("binds a struct member using the member's declared type", async () => {
      const field = makePropertyField({
        propertyName: "Address",
        type: {
          kind: "struct",
          members: [{ name: "Street", label: "Street", type: { kind: "primitive", type: "String" } }],
        },
      });
      const filters: ContentValueFilter[] = [{ field, member: "Street", operator: "is-equal", value: "Main" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(`[this].[Address].[Street] = :${ECSQL_PREFIX}vf0`);
      expect(result.anchor.parts.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "Main" } });
    });

    it("throws for an unknown struct member", async () => {
      const field = makePropertyField({ propertyName: "Address", type: { kind: "struct", members: [] } });
      const filters: ContentValueFilter[] = [{ field, member: "Nope", operator: "is-equal", value: "x" }];

      await expect(buildBaseQuery({ schemaProvider, source: makeSource([]), filters })).rejects.toThrow(
        'member "Nope" that is not a member of the struct field',
      );
    });

    it("throws for a struct field filtered without a member", async () => {
      const field = makePropertyField({ propertyName: "Address", type: { kind: "struct", members: [] } });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: "x" }];

      await expect(buildBaseQuery({ schemaProvider, source: makeSource([]), filters })).rejects.toThrow(
        "Value filters directly on struct fields are not supported",
      );
    });

    it("throws for a value filter on an array field", async () => {
      const field = makePropertyField({
        propertyName: "Tags",
        type: { kind: "array", elementType: { kind: "primitive", type: "String" } },
      });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: "x" }];

      await expect(buildBaseQuery({ schemaProvider, source: makeSource([]), filters })).rejects.toThrow(
        "Value filters on array fields are not supported",
      );
    });

    it("binds point coordinate members as doubles", async () => {
      const point2dField = makePropertyField({ propertyName: "Origin", type: { kind: "primitive", type: "Point2d" } });
      const point3dField = makePropertyField({
        propertyName: "Location",
        type: { kind: "primitive", type: "Point3d" },
      });
      const filters: ContentValueFilter[] = [
        { field: point2dField, member: "x", operator: "is-equal", value: 1 },
        { field: point2dField, member: "y", operator: "is-equal", value: 2 },
        { field: point3dField, member: "x", operator: "is-equal", value: 3 },
        { field: point3dField, member: "y", operator: "is-equal", value: 4 },
        { field: point3dField, member: "z", operator: "is-equal", value: 5 },
      ];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(
        [
          `([this].[Origin].[x] = :${ECSQL_PREFIX}vf0)`,
          `([this].[Origin].[y] = :${ECSQL_PREFIX}vf1)`,
          `([this].[Location].[x] = :${ECSQL_PREFIX}vf2)`,
          `([this].[Location].[y] = :${ECSQL_PREFIX}vf3)`,
          `([this].[Location].[z] = :${ECSQL_PREFIX}vf4)`,
        ].join(" AND "),
      );
      expect(result.anchor.parts.bindings).to.deep.equal({
        [`${ECSQL_PREFIX}vf0`]: { type: "double", value: 1 },
        [`${ECSQL_PREFIX}vf1`]: { type: "double", value: 2 },
        [`${ECSQL_PREFIX}vf2`]: { type: "double", value: 3 },
        [`${ECSQL_PREFIX}vf3`]: { type: "double", value: 4 },
        [`${ECSQL_PREFIX}vf4`]: { type: "double", value: 5 },
      });
    });

    it("emits the canonical coordinate spelling for a case-insensitive point member", async () => {
      const point3dField = makePropertyField({
        propertyName: "Location",
        type: { kind: "primitive", type: "Point3d" },
      });
      const filters: ContentValueFilter[] = [{ field: point3dField, member: "Z", operator: "is-equal", value: 1 }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(`[this].[Location].[z] = :${ECSQL_PREFIX}vf0`);
    });

    it("validates the coordinate member of a related point property", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const field = makePropertyField({
        propertyName: "Location",
        propertyClassName: "TestSchema.Target",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.Target"],
        type: { kind: "primitive", type: "Point3d" },
      });

      const validFilters: ContentValueFilter[] = [{ field, member: "y", operator: "is-equal", value: 1 }];
      const validResult = await buildBaseQuery({ schemaProvider, source: makeSource([path]), filters: validFilters });
      expect(validResult.anchor.parts.where).to.equal(`[${ECSQL_PREFIX}t0].[Location].[y] = :${ECSQL_PREFIX}vf0`);

      const invalidFilters: ContentValueFilter[] = [{ field, member: "w", operator: "is-equal", value: 1 }];
      await expect(
        buildBaseQuery({ schemaProvider, source: makeSource([path]), filters: invalidFilters }),
      ).rejects.toThrow(`Value filters on Point3d fields require member "x", "y", or "z", but got "w".`);
    });

    it("throws for a value filter on a Point2d field without a member", async () => {
      const field = makePropertyField({ propertyName: "Origin", type: { kind: "primitive", type: "Point2d" } });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: 1 }];

      await expect(buildBaseQuery({ schemaProvider, source: makeSource([]), filters })).rejects.toThrow(
        `Value filters directly on Point2d fields are not supported. Provide coordinate member "x" or "y".`,
      );
    });

    it("throws for a value filter on a Point3d field without a member", async () => {
      const field = makePropertyField({ propertyName: "Location", type: { kind: "primitive", type: "Point3d" } });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: 1 }];

      await expect(buildBaseQuery({ schemaProvider, source: makeSource([]), filters })).rejects.toThrow(
        `Value filters directly on Point3d fields are not supported. Provide coordinate member "x", "y", or "z".`,
      );
    });

    it("throws for a Point2d value filter that references the z coordinate", async () => {
      const field = makePropertyField({ propertyName: "Origin", type: { kind: "primitive", type: "Point2d" } });
      const filters: ContentValueFilter[] = [{ field, member: "z", operator: "is-equal", value: 1 }];

      await expect(buildBaseQuery({ schemaProvider, source: makeSource([]), filters })).rejects.toThrow(
        `Value filters on Point2d fields require member "x" or "y", but got "z".`,
      );
    });

    it("throws for a point value filter that references an unknown member", async () => {
      const field = makePropertyField({ propertyName: "Location", type: { kind: "primitive", type: "Point3d" } });
      const filters: ContentValueFilter[] = [{ field, member: "foo", operator: "is-equal", value: 1 }];

      await expect(buildBaseQuery({ schemaProvider, source: makeSource([]), filters })).rejects.toThrow(
        `Value filters on Point3d fields require member "x", "y", or "z", but got "foo".`,
      );
    });

    it("appends the navigation Id member and binds as an id", async () => {
      const field = makePropertyField({
        propertyName: "Parent",
        type: { kind: "navigation", targetClassName: "TestSchema.Other" },
      });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: "0x1" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(`[this].[Parent].[Id] = :${ECSQL_PREFIX}vf0`);
      expect(result.anchor.parts.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "id", value: "0x1" } });
    });

    it("substitutes a calculated field's default target alias", async () => {
      const field: CalculatedField = {
        kind: "calculated",
        id: "calc",
        label: "Calc",
        type: { kind: "primitive", type: "String" },
        expression: "this.CodeValue || this.UserLabel",
        selectorId: "calc",
      };
      const filters: ContentValueFilter[] = [{ field, operator: "like", value: "A%" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(`[this].CodeValue || [this].UserLabel LIKE :${ECSQL_PREFIX}vf0`);
    });

    it("substitutes a calculated field's custom target alias", async () => {
      const field: CalculatedField = {
        kind: "calculated",
        id: "calc",
        label: "Calc",
        type: { kind: "primitive", type: "String" },
        expression: "e.CodeValue",
        targetAlias: "e",
        selectorId: "calc",
      };
      const filters: ContentValueFilter[] = [{ field, operator: "like", value: "A%" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(`[this].CodeValue LIKE :${ECSQL_PREFIX}vf0`);
    });
  });

  describe("WHERE assembly", () => {
    it("ANDs target-filter, query-filterer, and value-filter conditions", async () => {
      const field = makePropertyField({ propertyName: "Length", type: { kind: "primitive", type: "Double" } });
      const filterer: QueryFilterer = { getFilterClauses: () => ({ where: ["ft.flag = 1"] }) };

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([], { primaryClass, instanceFilter: { expression: "this.Area > 5" } }),
        queryFilterers: [filterer],
        filters: [{ field, operator: "is-equal", value: 1 }],
      });

      expect(result.anchor.parts.where).to.equal(
        `([this].Area > 5) AND (ft.flag = 1) AND ([this].[Length] = :${ECSQL_PREFIX}vf0)`,
      );
    });
  });

  describe("binding conflicts", () => {
    it("throws when two sources contribute the same binding name", async () => {
      const filtererA: QueryFilterer = {
        getFilterClauses: () => ({ where: ["a = :dup"], bindings: { dup: { type: "int", value: 1 } } }),
      };
      const filtererB: QueryFilterer = {
        getFilterClauses: () => ({ where: ["b = :dup"], bindings: { dup: { type: "int", value: 2 } } }),
      };

      await expect(
        buildBaseQuery({ schemaProvider, source: makeSource([]), queryFilterers: [filtererA, filtererB] }),
      ).rejects.toThrow('Duplicate ECSQL binding name "dup"');
    });
  });

  describe("primaries-only mode", () => {
    it("returns only the anchor and skips related joins", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), includeRelatedJoins: false });

      expect(result).to.not.have.property("additional");
      expect(result.anchor.paths).to.deep.equal([]);
      expect(result.anchor.parts.joins).to.equal("");
      expect(result.anchor.parts.relatedClassAliases.size).to.equal(0);
    });

    it("outer-joins the paths referenced by value filters", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const field = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.Target",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.Target"],
      });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: "abc" }];

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: false,
        filters,
      });

      // Filter-evaluation joins are OUTER so an `is-null` filter still matches primaries with no related
      // instance; for every other operator a NULL related column fails the predicate, matching an inner join.
      expect(trimWhitespace(result.anchor.parts.joins)).to.equal(
        trimWhitespace(`
          OUTER JOIN (
            SELECT [${ECSQL_PREFIX}r0].*
            FROM [TestSchema].[Rel] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
          ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
          OUTER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        `),
      );
      expect(result.anchor.parts.where).to.equal(`[${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0`);
    });

    it("de-duplicates filter-referenced paths and ignores direct fields", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const relatedField = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.Target",
        pathFromTarget: path,
      });
      const directField = makePropertyField({ propertyName: "Direct" });
      const filters: ContentValueFilter[] = [
        { field: relatedField, operator: "is-equal", value: "a" },
        { field: relatedField, operator: "is-not-equal", value: "b" },
        { field: directField, operator: "is-null" },
      ];

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: false,
        filters,
      });

      // Both related filters reference the same path → one join; the direct field adds none.
      expect(result.anchor.parts.relatedClassAliases.size).to.equal(1);
    });
  });

  describe("split groups", () => {
    it("keeps all 1:1 paths in the anchor when they fit the join budget", async () => {
      const pathB = [makeStep(primaryClass, "TestSchema.RelB", "TestSchema.B")];
      const pathC = [makeStep(primaryClass, "TestSchema.RelC", "TestSchema.C")];

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([pathB, pathC]),
        includeRelatedJoins: true,
      });

      expect(result.additional).to.be.undefined;
      expect(result.anchor.paths).to.have.length(2);
      // Both related steps are OUTER-joined (each link-table path renders two `OUTER JOIN`s), so a
      // primary missing one related instance keeps the other's columns.
      expect(result.anchor.parts.joins).to.not.include("INNER JOIN [TestSchema].[RelB]");
      expect(trimWhitespace(result.anchor.parts.joins).split("OUTER JOIN").length - 1).to.equal(4);
    });

    it("splits 1:1 paths across groups when they exceed the join budget", async () => {
      const paths = Array.from({ length: 40 }, (_, i) => [
        makeStep(primaryClass, `TestSchema.Rel${i}`, `TestSchema.Target${i}`),
      ]);

      const result = await buildBaseQuery({ schemaProvider, source: makeSource(paths), includeRelatedJoins: true });

      expect(result.additional).to.have.length(1);
      const anchorCount = result.anchor.paths.length;
      const additionalCount = result.additional![0].paths.length;
      // Disjoint partition of all 40 paths, each group within the 64-table budget (1 reserved for FROM;
      // 3 tables per single-step outer link-table path).
      expect(anchorCount + additionalCount).to.equal(40);
      expect(1 + anchorCount * 3).to.be.at.most(64);
      expect(additionalCount * 3).to.be.at.most(64);
      const relationshipName = (group: (typeof result.anchor.paths)[number]) => group.path[0].relationshipName;
      const anchorKeys = new Set(result.anchor.paths.map(relationshipName));
      expect(result.additional![0].paths.some((p) => anchorKeys.has(relationshipName(p)))).to.equal(false);
      // Both groups join more than one path → outer-joined, and share the same FROM.
      expect(result.additional![0].parts.from).to.equal(result.anchor.parts.from);
      expect(result.additional![0].parts.joins).to.include("OUTER JOIN");
    });

    it("shares the target filter and query-filterer joins on the anchor", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const joiningFilterer: QueryFilterer = {
        getFilterClauses: () => ({
          joins: ["JOIN filterer_table ft ON ft.id = this.ECInstanceId"],
          where: ["ft.flag = 1"],
        }),
      };
      const whereOnlyFilterer: QueryFilterer = { getFilterClauses: () => ({ where: ["this.Flag = 1"] }) };

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path], { primaryClass, instanceIds: ["0x1"] }),
        includeRelatedJoins: true,
        queryFilterers: [joiningFilterer, whereOnlyFilterer],
      });

      expect(result.anchor.parts.joins).to.include(`IdSet(:${ECSQL_PREFIX}TargetInstanceIds)`);
      expect(result.anchor.parts.joins).to.include("JOIN filterer_table ft");
      expect(result.anchor.parts.joins).to.include("OUTER JOIN [TestSchema].[Target]");
      expect(result.anchor.parts.where).to.equal("(ft.flag = 1) AND (this.Flag = 1)");
    });

    it("isolates a 1:many path (by schema multiplicity) into its own inner-joined group", async () => {
      const oneToOne = [makeStep(primaryClass, "TestSchema.RelOne", "TestSchema.One")];
      const oneToMany = [makeStep(primaryClass, "TestSchema.RelMany", "TestSchema.Many")];

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([oneToOne, oneToMany]),
        includeRelatedJoins: true,
      });

      expect(result.anchor.paths).to.deep.equal([{ path: oneToOne, targetClassNames: ["TestSchema.One"] }]);
      expect(result.additional).to.have.length(1);
      expect(result.additional![0].paths).to.deep.equal([{ path: oneToMany, targetClassNames: ["TestSchema.Many"] }]);
      // A lone 1:many path is INNER-joined — after key-stitching, absent related instances drop out.
      expect(result.additional![0].parts.joins).to.include("INNER JOIN");
      expect(result.additional![0].parts.joins).to.not.include("OUTER JOIN");
    });

    it("isolates a 1:many path forced by a `many` cardinality hint", async () => {
      const path = [makeStep(primaryClass, "TestSchema.RelOne", "TestSchema.One")];
      const cardinalityHints = new Map<string, CardinalityHint>([[serializeRelationshipPath({ path }), "many"]]);

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        cardinalityHints,
      });

      // The only path is forced 1:many, so the anchor joins nothing and the path splits off.
      expect(result.anchor.paths).to.deep.equal([]);
      expect(result.additional).to.have.length(1);
      expect(result.additional![0].paths.map((p) => p.path)).to.deep.equal([path]);
    });

    it("keeps a schema-`many` path in the anchor when a `one` hint overrides it", async () => {
      const path = [makeStep(primaryClass, "TestSchema.RelMany", "TestSchema.Many")];
      const cardinalityHints = new Map<string, CardinalityHint>([[serializeRelationshipPath({ path }), "one"]]);

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        cardinalityHints,
      });

      expect(result.additional).to.be.undefined;
      expect(result.anchor.paths.map((p) => p.path)).to.deep.equal([path]);
    });
  });

  describe("value filters on split paths", () => {
    it("joins a schema-`many` filtered path onto the anchor to evaluate a target-property filter", async () => {
      const path = [makeStep(primaryClass, "TestSchema.RelMany", "TestSchema.Many")];
      const field = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.Many",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.Many"],
      });

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        filters: [{ field, operator: "is-equal", value: "A" }],
      });

      // The 1:many path's selected columns are owned by an additional group, but the anchor still joins
      // it (outer) so the value filter can be evaluated against its target alias.
      expect(result.anchor.paths).to.deep.equal([]);
      const key = "TestSchema.Primary-[TestSchema.RelMany]->TestSchema.Many";
      expect(result.anchor.parts.relatedClassAliases.get(key)).to.deep.equal({
        target: `${ECSQL_PREFIX}t0`,
        relationship: `${ECSQL_PREFIX}r0`,
      });
      expect(result.anchor.parts.joins).to.include("OUTER JOIN");
      expect(result.anchor.parts.joins).to.include("[TestSchema].[RelMany]");
      expect(result.anchor.parts.where).to.equal(`[${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0`);
      expect(result.anchor.parts.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "A" } });
      expect(result.additional).to.have.length(1);
      expect(result.additional![0].paths.map((p) => p.path)).to.deep.equal([path]);
    });

    it("joins a schema-`many` filtered path onto the anchor to evaluate a relationship-property filter", async () => {
      const path = [makeStep(primaryClass, "TestSchema.RelMany", "TestSchema.Many")];
      const field = makePropertyField({
        propertyName: "RelProp",
        propertyClassName: "TestSchema.RelMany",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.RelMany"],
      });

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        filters: [{ field, operator: "is-equal", value: "A" }],
      });

      expect(result.anchor.paths).to.deep.equal([]);
      // A relationship-class property resolves against the step's relationship alias, not the target.
      expect(result.anchor.parts.where).to.equal(`[${ECSQL_PREFIX}r0].[RelProp] = :${ECSQL_PREFIX}vf0`);
      expect(result.additional).to.have.length(1);
    });

    it("joins a path forced 1:many by a `many` hint onto the anchor for filtering", async () => {
      const path = [makeStep(primaryClass, "TestSchema.RelOne", "TestSchema.One")];
      const cardinalityHints = new Map<string, CardinalityHint>([[serializeRelationshipPath({ path }), "many"]]);
      const field = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.One",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.One"],
      });

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        cardinalityHints,
        filters: [{ field, operator: "is-equal", value: "A" }],
      });

      // The hint splits the path off for column ownership, yet the anchor still joins it to filter.
      expect(result.anchor.paths).to.deep.equal([]);
      expect(result.anchor.parts.where).to.equal(`[${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0`);
      expect(result.additional).to.have.length(1);
      expect(result.additional![0].paths.map((p) => p.path)).to.deep.equal([path]);
    });

    it("joins a filtered path from an overflow 1:1 partition onto the anchor", async () => {
      const paths = Array.from({ length: 40 }, (_, i) => [
        makeStep(primaryClass, `TestSchema.Rel${i}`, `TestSchema.Target${i}`),
      ]);
      // Paths are packed in source order, so the last path lands in an overflow partition.
      const filteredPath = paths[paths.length - 1];
      const field = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.Target39",
        pathFromTarget: filteredPath,
        valueClassNames: ["TestSchema.Target39"],
      });

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource(paths),
        includeRelatedJoins: true,
        filters: [{ field, operator: "is-equal", value: "A" }],
      });

      // The filtered path's columns are owned by an overflow additional group, not the anchor...
      const relationshipName = (p: { path: RelationshipPath }) => p.path[0].relationshipName;
      expect(result.anchor.paths.some((p) => relationshipName(p) === "TestSchema.Rel39")).to.equal(false);
      expect(result.additional!.some((g) => g.paths.some((p) => relationshipName(p) === "TestSchema.Rel39"))).to.equal(
        true,
      );
      // ...yet the anchor joins it (under its globally-assigned alias) and evaluates the filter.
      const key = "TestSchema.Primary-[TestSchema.Rel39]->TestSchema.Target39";
      const aliases = result.anchor.parts.relatedClassAliases.get(key);
      expect(aliases).to.not.be.undefined;
      expect(result.anchor.parts.where).to.equal(`[${aliases!.target}].[Name] = :${ECSQL_PREFIX}vf0`);
    });

    it("outer-joins a split path so an `is-null` filter matches primaries with no related instance", async () => {
      const path = [makeStep(primaryClass, "TestSchema.RelMany", "TestSchema.Many")];
      const field = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.Many",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.Many"],
      });

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        filters: [{ field, operator: "is-null" }],
      });

      expect(result.anchor.parts.joins).to.include("OUTER JOIN");
      expect(result.anchor.parts.joins).to.not.include("INNER JOIN [TestSchema].[RelMany]");
      expect(result.anchor.parts.where).to.equal(`[${ECSQL_PREFIX}t0].[Name] IS NULL`);
    });

    it("joins an anchor-owned 1:1 filtered path only once", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const field = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.Target",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.Target"],
      });

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        filters: [{ field, operator: "is-equal", value: "A" }],
      });

      // The 1:1 path fits the join budget, so the anchor both selects its columns and evaluates the
      // filter — `unionPaths` merges the selected and filter-referenced path so it is joined only once.
      expect(result.anchor.paths.map((p) => p.path)).to.deep.equal([path]);
      expect(result.additional).to.be.undefined;
      expect(result.anchor.parts.relatedClassAliases.size).to.equal(1);
      expect(result.anchor.parts.where).to.equal(`[${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0`);
      // A single link-table path renders exactly two `OUTER JOIN`s; a duplicated join would double that.
      expect(trimWhitespace(result.anchor.parts.joins).split("OUTER JOIN").length - 1).to.equal(2);
    });
  });
});

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
    getClass: (className: string) => ({
      fullName: `${schemaName}.${className}`,
      getProperties: () => [],
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
    primaryClassNames: props.primaryClassNames ?? [primaryClass],
    selectorId: props.selectorId ?? `selector-${props.propertyName}`,
  };
}

// Shared 1:1 and 1:many related paths + a `Name` field on each, reused by the value-filter tests below
// (which only vary the filter operator/expected clause) to avoid repeating the same path/field setup.
function makeOneToOnePath(): RelationshipPath {
  return [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
}
function makeOneToOneNameField(path: RelationshipPath = makeOneToOnePath()): PropertyField {
  return makePropertyField({
    propertyName: "Name",
    propertyClassName: "TestSchema.Target",
    pathFromTarget: path,
    valueClassNames: ["TestSchema.Target"],
    primaryClassNames: [primaryClass],
  });
}
function makeOneToManyPath(): RelationshipPath {
  return [makeStep(primaryClass, "TestSchema.RelMany", "TestSchema.Many")];
}
function makeOneToManyNameField(path: RelationshipPath = makeOneToManyPath()): PropertyField {
  return makePropertyField({
    propertyName: "Name",
    propertyClassName: "TestSchema.Many",
    pathFromTarget: path,
    valueClassNames: ["TestSchema.Many"],
    primaryClassNames: [primaryClass],
  });
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
          LEFT OUTER JOIN (
            SELECT [${ECSQL_PREFIX}r0].*
            FROM [TestSchema].[Rel] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
          ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
          LEFT OUTER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
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
          LEFT OUTER JOIN (
            SELECT [${ECSQL_PREFIX}r0].*
            FROM [TestSchema].[Rel1] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Mid] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
          ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
          LEFT OUTER JOIN [TestSchema].[Mid] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
          LEFT OUTER JOIN (
            SELECT [${ECSQL_PREFIX}r1].*
            FROM [TestSchema].[Rel2] [${ECSQL_PREFIX}r1]
            INNER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t1] ON [${ECSQL_PREFIX}t1].[ECInstanceId] = [${ECSQL_PREFIX}r1].[TargetECInstanceId]
          ) [${ECSQL_PREFIX}r1] ON [${ECSQL_PREFIX}r1].[SourceECInstanceId] = [${ECSQL_PREFIX}t0].[ECInstanceId]
          LEFT OUTER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t1] ON [${ECSQL_PREFIX}t1].[ECInstanceId] = [${ECSQL_PREFIX}r1].[TargetECInstanceId]
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

    it("throws when identical paths across declaration groups uses same bindings with different values", async () => {
      const step = makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target");
      const source: ContentSource = {
        target: { primaryClass },
        resolvedPrimaryClasses: [primaryClass],
        resolvedDeclarations: [
          {
            providerId: "a_v1",
            declarationIndex: 0,
            paths: [
              {
                path: [
                  {
                    ...step,
                    instanceFilter: { expression: "this.X > :p", bindings: { p: { type: "int", value: 1 } } },
                  },
                ],
                targetClassNames: ["TestSchema.Target"],
              },
            ],
          },
          {
            providerId: "b_v1",
            declarationIndex: 0,
            paths: [
              {
                path: [
                  {
                    ...step,
                    instanceFilter: { expression: "this.X > :p", bindings: { p: { type: "int", value: 2 } } },
                  },
                ],
                targetClassNames: ["TestSchema.Target"],
              },
            ],
          },
        ],
      };
      await expect(buildBaseQuery({ schemaProvider, source, includeRelatedJoins: true })).rejects.toThrow(
        `Duplicate ECSQL binding name "p" with different values.`,
      );
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

      expect(result.anchor.parts.where).to.equal("WHERE [this].Area > :minArea");
      expect(result.anchor.parts.bindings).to.deep.equal({ minArea: { type: "double", value: 5 } });
    });

    it("combines instanceIds and instanceFilter", async () => {
      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([], { primaryClass, instanceIds: ["0x1"], instanceFilter: { expression: "this.Area > 5" } }),
      });

      expect(result.anchor.parts.joins).to.include(`IdSet(:${ECSQL_PREFIX}TargetInstanceIds)`);
      expect(result.anchor.parts.where).to.equal("WHERE [this].Area > 5");
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
      expect(result.anchor.parts.where).to.equal("WHERE ft.flag = 1");
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

      expect(result.anchor.parts.where).to.equal("WHERE (a = 1) AND (b = 2)");
    });

    it("handles a filterer contributing no clauses", async () => {
      const filterer: QueryFilterer = { getFilterClauses: () => ({}) };
      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), queryFilterers: [filterer] });

      expect(result.anchor.parts.joins).to.equal("");
      expect(result.anchor.parts.where).to.be.undefined;
      expect(result.anchor.parts.bindings).to.be.undefined;
    });
  });

  describe("sorting", () => {
    it("ignores direct and duplicate sort fields when collecting anchor paths", async () => {
      const path = makeOneToOnePath();
      const relatedField = makeOneToOneNameField(path);
      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        sortFields: [makePropertyField({ propertyName: "Code" }), relatedField, relatedField],
      });

      expect(result.anchor.parts.relatedClassAliases).to.have.length(1);
    });

    it("rejects sort paths that exceed the SQLite JOIN-table limit", async () => {
      const paths = Array.from({ length: 33 }, (_, index) => [
        makeStep(primaryClass, `TestSchema.Rel${index}`, `TestSchema.Target${index}`),
      ]);
      await expect(
        buildBaseQuery({
          schemaProvider,
          source: makeSource(paths),
          includeRelatedJoins: true,
          sortFields: paths.map((path) =>
            makePropertyField({
              propertyName: "Name",
              propertyClassName: path[0].targetClassName,
              pathFromTarget: path,
              valueClassNames: [path[0].targetClassName],
            }),
          ),
        }),
      ).rejects.toThrow("Related sort paths exceed the SQLite JOIN-table limit.");
    });

    it("keeps an otherwise-overflowed 1:1 sort path on the anchor", async () => {
      const paths = Array.from({ length: 33 }, (_, index) => [
        makeStep(primaryClass, `TestSchema.Rel${index}`, `TestSchema.Target${index}`),
      ]);
      const sortPath = paths[paths.length - 1];
      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource(paths),
        includeRelatedJoins: true,
        sortFields: [
          makePropertyField({
            propertyName: "Name",
            propertyClassName: sortPath[0].targetClassName,
            pathFromTarget: sortPath,
            valueClassNames: [sortPath[0].targetClassName],
          }),
        ],
      });

      expect(result.additional).not.to.be.undefined;
      expect(result.anchor.parts.relatedClassAliases.has(serializeRelationshipPath({ path: sortPath }))).to.be.true;
    });

    it("rejects a sort field on a 1:many related path", async () => {
      await expect(
        buildBaseQuery({
          schemaProvider,
          source: makeSource([makeOneToManyPath()]),
          includeRelatedJoins: true,
          sortFields: [makeOneToManyNameField()],
        }),
      ).rejects.toThrow("Cannot sort by a 1:many related path");
    });
  });

  describe("value filters", () => {
    it("resolves a direct property column against the primary alias", async () => {
      const field = makePropertyField({ propertyName: "Length", type: { kind: "primitive", type: "Double" } });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: 1 }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(`WHERE [this].[Length] = :${ECSQL_PREFIX}vf0`);
      expect(result.anchor.parts.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "double", value: 1 } });
    });

    it("resolves a related property column against the target alias", async () => {
      const path = makeOneToOnePath();
      const field = makeOneToOneNameField(path);
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: "abc" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), filters });

      expect(result.anchor.parts.where).to.equal(`WHERE [${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0`);
    });

    it("resolves a relationship-class property against the relationship alias", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const field = makePropertyField({
        propertyName: "RelProp",
        propertyClassName: "TestSchema.Rel",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.Rel"],
        primaryClassNames: [primaryClass],
      });
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: "abc" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), filters });

      expect(result.anchor.parts.where).to.equal(`WHERE [${ECSQL_PREFIX}r0].[RelProp] = :${ECSQL_PREFIX}vf0`);
    });

    it("resolves an `is-null` filter on a 1:1 related property as a plain join", async () => {
      const path = makeOneToOnePath();
      const field = makeOneToOneNameField(path);
      const filters: ContentValueFilter[] = [{ field, operator: "is-null" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), filters });

      // A 1:1 path has at most one related row, so the outer join alone (no EXISTS) is enough.
      expect(result.anchor.parts.where).to.equal(`WHERE [${ECSQL_PREFIX}t0].[Name] IS NULL`);
    });

    it("resolves an `is-not-null` filter on a 1:1 related property as a plain join", async () => {
      const path = makeOneToOnePath();
      const field = makeOneToOneNameField(path);
      const filters: ContentValueFilter[] = [{ field, operator: "is-not-null" }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([path]), filters });

      expect(result.anchor.parts.where).to.equal(`WHERE [${ECSQL_PREFIX}t0].[Name] IS NOT NULL`);
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

      expect(result.anchor.parts.where).to.equal(`WHERE [this].[Address].[Street] = :${ECSQL_PREFIX}vf0`);
      expect(result.anchor.parts.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "Main" } });
    });

    it("throws for an unknown struct member", async () => {
      const field = makePropertyField({ propertyName: "Address", type: { kind: "struct", members: [] } });
      const filters: ContentValueFilter[] = [{ field, member: "Nope", operator: "is-equal", value: "x" }];

      await expect(buildBaseQuery({ schemaProvider, source: makeSource([]), filters })).rejects.toThrow(
        'member "Nope" that is not a member of the struct field',
      );
    });

    it("throws for a struct member with different casing", async () => {
      const field = makePropertyField({
        propertyName: "Address",
        type: {
          kind: "struct",
          members: [{ name: "Street", label: "Street", type: { kind: "primitive", type: "String" } }],
        },
      });
      const filters: ContentValueFilter[] = [{ field, member: "street", operator: "is-equal", value: "Main" }];

      await expect(buildBaseQuery({ schemaProvider, source: makeSource([]), filters })).rejects.toThrow(
        'member "street" that is not a member of the struct field',
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
        `WHERE ${[
          `([this].[Origin].[x] = :${ECSQL_PREFIX}vf0)`,
          `([this].[Origin].[y] = :${ECSQL_PREFIX}vf1)`,
          `([this].[Location].[x] = :${ECSQL_PREFIX}vf2)`,
          `([this].[Location].[y] = :${ECSQL_PREFIX}vf3)`,
          `([this].[Location].[z] = :${ECSQL_PREFIX}vf4)`,
        ].join(" AND ")}`,
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

      expect(result.anchor.parts.where).to.equal(`WHERE [this].[Location].[z] = :${ECSQL_PREFIX}vf0`);
    });

    it("validates the coordinate member of a related point property", async () => {
      const path = [makeStep(primaryClass, "TestSchema.Rel", "TestSchema.Target")];
      const field = makePropertyField({
        propertyName: "Location",
        propertyClassName: "TestSchema.Target",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.Target"],
        primaryClassNames: [primaryClass],
        type: { kind: "primitive", type: "Point3d" },
      });

      const validFilters: ContentValueFilter[] = [{ field, member: "y", operator: "is-equal", value: 1 }];
      const validResult = await buildBaseQuery({ schemaProvider, source: makeSource([path]), filters: validFilters });
      expect(validResult.anchor.parts.where).to.equal(`WHERE [${ECSQL_PREFIX}t0].[Location].[y] = :${ECSQL_PREFIX}vf0`);

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

      expect(result.anchor.parts.where).to.equal(`WHERE [this].[Parent].[Id] = :${ECSQL_PREFIX}vf0`);
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

      expect(result.anchor.parts.where).to.equal(
        `WHERE ([this].CodeValue || [this].UserLabel) LIKE :${ECSQL_PREFIX}vf0`,
      );
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

      expect(result.anchor.parts.where).to.equal(`WHERE ([this].CodeValue) LIKE :${ECSQL_PREFIX}vf0`);
    });

    it("parenthesizes a compound calculated expression before applying the operator", async () => {
      const field: CalculatedField = {
        kind: "calculated",
        id: "calc",
        label: "Calc",
        type: { kind: "primitive", type: "Boolean" },
        expression: "this.FlagA OR this.FlagB",
        selectorId: "calc",
      };
      const filters: ContentValueFilter[] = [{ field, operator: "is-equal", value: true }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(`WHERE ([this].FlagA OR [this].FlagB) = :${ECSQL_PREFIX}vf0`);
    });

    it("carries a calculated field's own bindings into the base query", async () => {
      const field: CalculatedField = {
        kind: "calculated",
        id: "calc",
        label: "Calc",
        type: { kind: "primitive", type: "Double" },
        expression: "this.Length * :scale",
        bindings: { scale: { type: "double", value: 2 } },
        selectorId: "calc",
      };
      const filters: ContentValueFilter[] = [{ field, operator: "greater-than", value: 10 }];

      const result = await buildBaseQuery({ schemaProvider, source: makeSource([]), filters });

      expect(result.anchor.parts.where).to.equal(`WHERE ([this].Length * :scale) > :${ECSQL_PREFIX}vf0`);
      expect(result.anchor.parts.bindings).to.deep.equal({
        scale: { type: "double", value: 2 },
        [`${ECSQL_PREFIX}vf0`]: { type: "double", value: 10 },
      });
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
        `WHERE ([this].Area > 5) AND (ft.flag = 1) AND ([this].[Length] = :${ECSQL_PREFIX}vf0)`,
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
        primaryClassNames: [primaryClass],
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
          LEFT OUTER JOIN (
            SELECT [${ECSQL_PREFIX}r0].*
            FROM [TestSchema].[Rel] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
          ) [${ECSQL_PREFIX}r0] ON [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
          LEFT OUTER JOIN [TestSchema].[Target] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
        `),
      );
      expect(result.anchor.parts.where).to.equal(`WHERE [${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0`);
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
      expect(result.anchor.parts.where).to.equal("WHERE (ft.flag = 1) AND (this.Flag = 1)");
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
    function makeIndexedOneToOnePath(index: number): RelationshipPath {
      return [makeStep(primaryClass, `TestSchema.Rel${index}`, `TestSchema.Target${index}`)];
    }

    function makeIndexedOneToOneFilter(path: RelationshipPath, index: number): ContentValueFilter {
      return {
        field: makePropertyField({
          propertyName: "Name",
          propertyClassName: `TestSchema.Target${index}`,
          pathFromTarget: path,
          valueClassNames: [`TestSchema.Target${index}`],
          primaryClassNames: [primaryClass],
        }),
        operator: "is-equal",
        value: `value-${index}`,
      };
    }

    it("keeps fitting 1:1 filters joined and spills overflow filters to existential subqueries", async () => {
      const paths = Array.from({ length: 22 }, (_, index) => makeIndexedOneToOnePath(index));
      const oneToOneFilters = paths.map((path, index) => makeIndexedOneToOneFilter(path, index));
      const oneToManyPath = makeOneToManyPath();
      const filters: ContentValueFilter[] = [
        ...oneToOneFilters,
        { field: makeOneToManyNameField(oneToManyPath), operator: "is-equal", value: "many" },
      ];

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([paths[21]]),
        includeRelatedJoins: true,
        filters,
      });

      // FROM consumes one table, leaving room for 21 three-table outer link paths. The 22nd 1:1
      // filter and the 1:many filter use independent EXISTS scopes.
      expect(trimWhitespace(result.anchor.parts.joins).split("OUTER JOIN").length - 1).to.equal(42);
      expect(result.anchor.parts.joins).to.not.include("[TestSchema].[Rel21]");
      expect(result.anchor.parts.joins).to.not.include("[TestSchema].[RelMany]");
      expect(result.anchor.parts.where).to.include("EXISTS (SELECT 1 FROM [TestSchema].[Rel21]");
      expect(result.anchor.parts.where).to.include("EXISTS (SELECT 1 FROM [TestSchema].[RelMany]");

      // Selected overflow path is owned by an additional group instead of being pulled back onto anchor.
      expect(result.anchor.paths).to.deep.equal([]);
      expect(result.additional).to.have.length(1);
      expect(result.additional![0].paths.map((entry) => entry.path)).to.deep.equal([[...paths[21]]]);

      // 21 joined + overflow 1:1 + 1:many filters each own a distinct binding index.
      expect(Object.keys(result.anchor.parts.bindings!)).to.have.length(23);
      for (let index = 0; index < 23; ++index) {
        expect(result.anchor.parts.bindings).to.have.property(`${ECSQL_PREFIX}vf${index}`);
      }
    });

    it("spills overflowing 1:1 filters in primaries-only mode", async () => {
      const paths = Array.from({ length: 22 }, (_, index) => makeIndexedOneToOnePath(index));
      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([]),
        includeRelatedJoins: false,
        filters: paths.map((path, index) => makeIndexedOneToOneFilter(path, index)),
      });

      expect(trimWhitespace(result.anchor.parts.joins).split("OUTER JOIN").length - 1).to.equal(42);
      expect(result.anchor.parts.joins).to.not.include("[TestSchema].[Rel21]");
      expect(result.anchor.parts.where).to.include("EXISTS (SELECT 1 FROM [TestSchema].[Rel21]");
    });

    it("evaluates an overflowing 1:1 is-null filter with the aggregate existential form", async () => {
      const fittingPaths = Array.from({ length: 21 }, (_, index) => makeIndexedOneToOnePath(index));
      const overflowPath = makeIndexedOneToOnePath(21);
      const filters = fittingPaths.map((path, index) => makeIndexedOneToOneFilter(path, index));
      filters.push({
        field: makePropertyField({
          propertyName: "Name",
          propertyClassName: "TestSchema.Target21",
          pathFromTarget: overflowPath,
          valueClassNames: ["TestSchema.Target21"],
          primaryClassNames: [primaryClass],
        }),
        operator: "is-null",
      });

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([]),
        includeRelatedJoins: true,
        filters,
      });

      expect(result.anchor.parts.joins).to.not.include("[TestSchema].[Rel21]");
      const allPaths = [...fittingPaths, overflowPath];
      const sortedPathKeys = allPaths.map((path) => serializeRelationshipPath({ path })).sort();
      const targetAlias = (path: RelationshipPath) =>
        `${ECSQL_PREFIX}t${sortedPathKeys.indexOf(serializeRelationshipPath({ path }))}`;
      const relationshipAlias = (path: RelationshipPath) =>
        `${ECSQL_PREFIX}r${sortedPathKeys.indexOf(serializeRelationshipPath({ path }))}`;
      const joinedPredicates = fittingPaths
        .map((path, index) => `([${targetAlias(path)}].[Name] = :${ECSQL_PREFIX}vf${index})`)
        .join(" AND ");

      expect(trimWhitespace(result.anchor.parts.where!)).to.equal(
        trimWhitespace(`
          WHERE (${joinedPredicates}) AND (
            (
              SELECT COUNT(*) = 0 OR COUNT([${targetAlias(overflowPath)}].[Name]) < COUNT(*)
              FROM [TestSchema].[Rel21] [${relationshipAlias(overflowPath)}]
              INNER JOIN [TestSchema].[Target21] [${targetAlias(overflowPath)}] ON [${targetAlias(overflowPath)}].[ECInstanceId] = [${relationshipAlias(overflowPath)}].[TargetECInstanceId]
              WHERE [${relationshipAlias(overflowPath)}].[SourceECInstanceId] = [this].[ECInstanceId]
            )
          )
        `),
      );
    });

    // A value filter on a 1:many path must not be evaluated by a top-level OUTER JOIN of that path onto the anchor.
    // Such a join duplicates the anchor row once per matching related instance (e.g. a Primary related to two
    // `Many` rows both named "A" yields the anchor id twice). The filter must instead be expressed as an
    // existential subquery correlated on the primary, so the anchor stays one row per primary.
    it.each([
      {
        operator: "is-equal",
        filterProps: { operator: "is-equal" as const, value: "A" },
        expectedPredicate: `[${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0`,
        expectedBindings: { [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "A" } },
      },
      {
        operator: "is-not-null",
        filterProps: { operator: "is-not-null" as const },
        expectedPredicate: `[${ECSQL_PREFIX}t0].[Name] IS NOT NULL`,
        expectedBindings: undefined,
      },
    ])(
      "evaluates a schema-`many` filtered path's $operator filter with a single EXISTS, not a top-level join",
      async ({ filterProps, expectedPredicate, expectedBindings }) => {
        const path = makeOneToManyPath();
        const field = makeOneToManyNameField(path);

        const result = await buildBaseQuery({
          schemaProvider,
          source: makeSource([path]),
          includeRelatedJoins: true,
          filters: [{ field, ...filterProps }],
        });

        // The 1:many path's selected columns are owned by an additional group, and the anchor evaluates
        // the value filter as an EXISTS subquery rather than joining the path onto itself.
        expect(result.anchor.paths).to.deep.equal([]);
        expect(result.anchor.parts.joins).to.equal("");
        expect(trimWhitespace(result.anchor.parts.where!)).to.equal(
          trimWhitespace(`
            WHERE EXISTS (
              SELECT 1
              FROM [TestSchema].[RelMany] [${ECSQL_PREFIX}r0]
              INNER JOIN [TestSchema].[Many] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
              WHERE [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId] AND (${expectedPredicate})
            )
          `),
        );
        expect(result.anchor.parts.bindings).to.deep.equal(expectedBindings);
        expect(result.additional).to.have.length(1);
        expect(result.additional![0].paths.map((p) => p.path)).to.deep.equal([path]);
      },
    );

    it.each([
      {
        operator: "is-in",
        filterProps: { operator: "is-in" as const, value: ["A", "B"] },
        expectedPredicate: `[${ECSQL_PREFIX}t0].[Name] IN (:${ECSQL_PREFIX}vf0_0, :${ECSQL_PREFIX}vf0_1)`,
        expectedBindings: {
          [`${ECSQL_PREFIX}vf0_0`]: { type: "string", value: "A" },
          [`${ECSQL_PREFIX}vf0_1`]: { type: "string", value: "B" },
        },
      },
      {
        operator: "is-not-in",
        filterProps: { operator: "is-not-in" as const, value: ["A", "B"] },
        expectedPredicate: `[${ECSQL_PREFIX}t0].[Name] NOT IN (:${ECSQL_PREFIX}vf0_0, :${ECSQL_PREFIX}vf0_1)`,
        expectedBindings: {
          [`${ECSQL_PREFIX}vf0_0`]: { type: "string", value: "A" },
          [`${ECSQL_PREFIX}vf0_1`]: { type: "string", value: "B" },
        },
      },
    ])(
      "evaluates a schema-`many` filtered path's $operator list filter inside EXISTS",
      async ({ filterProps, expectedPredicate, expectedBindings }) => {
        const path = makeOneToManyPath();
        const field = makeOneToManyNameField(path);

        const result = await buildBaseQuery({
          schemaProvider,
          source: makeSource([path]),
          includeRelatedJoins: true,
          filters: [{ field, ...filterProps }],
        });

        expect(result.anchor.parts.joins).to.equal("");
        expect(trimWhitespace(result.anchor.parts.where!)).to.equal(
          trimWhitespace(`
          WHERE EXISTS (
            SELECT 1
            FROM [TestSchema].[RelMany] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Many] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
            WHERE [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId] AND (${expectedPredicate})
          )
        `),
        );
        expect(result.anchor.parts.bindings).to.deep.equal(expectedBindings);
      },
    );

    it("uses disjoint binding indices for mixed 1:1 and 1:many filters", async () => {
      const oneToOnePath = makeOneToOnePath();
      const oneToManyPath = makeOneToManyPath();
      const oneToOneField = makeOneToOneNameField(oneToOnePath);
      const oneToManyField = makeOneToManyNameField(oneToManyPath);

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([oneToOnePath, oneToManyPath]),
        includeRelatedJoins: true,
        // Put the 1:many filter first to verify binding spaces are partitioned by cardinality,
        // not by input order.
        filters: [
          { field: oneToManyField, operator: "is-in", value: ["A", "B"] },
          { field: oneToOneField, operator: "is-equal", value: "X" },
        ],
      });

      const oneToOneKey = "TestSchema.Primary-[TestSchema.Rel]->TestSchema.Target";
      const oneToOneAliases = result.anchor.parts.relatedClassAliases.get(oneToOneKey);
      expect(oneToOneAliases).to.not.be.undefined;
      // Aliases are assigned by sorted prefix keys; `RelMany` sorts before `Rel`, so the one-to-many
      // existential path uses `r0/t0`, while the one-to-one joined path uses `t1`.
      expect(oneToOneAliases!.target).to.equal(`${ECSQL_PREFIX}t1`);

      expect(trimWhitespace(result.anchor.parts.where!)).to.equal(
        trimWhitespace(`
          WHERE ([${ECSQL_PREFIX}t1].[Name] = :${ECSQL_PREFIX}vf0) AND (
            EXISTS (
              SELECT 1
              FROM [TestSchema].[RelMany] [${ECSQL_PREFIX}r0]
              INNER JOIN [TestSchema].[Many] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
              WHERE [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId] AND ([${ECSQL_PREFIX}t0].[Name] IN (:${ECSQL_PREFIX}vf1_0, :${ECSQL_PREFIX}vf1_1))
            )
          )
        `),
      );
      expect(result.anchor.parts.bindings).to.deep.equal({
        [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "X" },
        [`${ECSQL_PREFIX}vf1_0`]: { type: "string", value: "A" },
        [`${ECSQL_PREFIX}vf1_1`]: { type: "string", value: "B" },
      });
    });

    it("evaluates a 1:many navigation-property filter with a subquery correlated on the nav column", async () => {
      // The target holds a backward navigation property pointing at the primary, so the step joins via
      // the nav column (`[target].[Owner].[Id]`) instead of a link table — the existential subquery has
      // no relationship table and correlates directly on that column.
      const navClasses = new Map<string, object>([
        ["Primary", { fullName: "TestSchema.Primary", isRelationshipClass: () => false, getProperties: () => [] }],
        [
          "RelManyNav",
          {
            fullName: "TestSchema.RelManyNav",
            isRelationshipClass: () => true,
            source: { multiplicity: { lowerLimit: 0, upperLimit: 1 } },
            target: { multiplicity: { lowerLimit: 0, upperLimit: 2 } },
            getProperties: () => [],
          },
        ],
        [
          "ManyNav",
          {
            fullName: "TestSchema.ManyNav",
            isRelationshipClass: () => false,
            getProperties: () => [
              {
                isNavigation: () => true,
                direction: "Backward",
                name: "Owner",
                relationshipClass: { fullName: "TestSchema.RelManyNav" },
              },
            ],
          },
        ],
      ]);
      const navSchemaProvider = {
        getSchema: async () => ({ getClass: (className: string) => navClasses.get(className) }),
      } as unknown as ECSchemaProvider;

      const path = [makeStep(primaryClass, "TestSchema.RelManyNav", "TestSchema.ManyNav")];
      const field = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.ManyNav",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.ManyNav"],
        primaryClassNames: [primaryClass],
      });

      const result = await buildBaseQuery({
        schemaProvider: navSchemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        filters: [{ field, operator: "is-equal", value: "A" }],
      });

      expect(result.anchor.parts.joins).to.equal("");
      expect(trimWhitespace(result.anchor.parts.where!)).to.equal(
        trimWhitespace(`
          WHERE EXISTS (
            SELECT 1
            FROM [TestSchema].[ManyNav] [${ECSQL_PREFIX}t0]
            WHERE [${ECSQL_PREFIX}t0].[Owner].[Id] = [this].[ECInstanceId] AND ([${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0)
          )
        `),
      );
      expect(result.anchor.parts.bindings).to.deep.equal({ [`${ECSQL_PREFIX}vf0`]: { type: "string", value: "A" } });
    });

    it("evaluates a schema-`many` filtered path's relationship-property predicate against the relationship alias inside the subquery", async () => {
      const path = makeOneToManyPath();
      const field = makePropertyField({
        propertyName: "RelProp",
        propertyClassName: "TestSchema.RelMany",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.RelMany"],
        primaryClassNames: [primaryClass],
      });

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        filters: [{ field, operator: "is-equal", value: "A" }],
      });

      expect(result.anchor.paths).to.deep.equal([]);
      // A relationship-class property resolves against the step's relationship alias, not the target.
      expect(trimWhitespace(result.anchor.parts.where!)).to.equal(
        trimWhitespace(`
          WHERE EXISTS (
            SELECT 1
            FROM [TestSchema].[RelMany] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Many] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
            WHERE [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId] AND ([${ECSQL_PREFIX}r0].[RelProp] = :${ECSQL_PREFIX}vf0)
          )
        `),
      );
      expect(result.additional).to.have.length(1);
    });

    it("evaluates a path forced 1:many by a `many` hint with an existential subquery for filtering", async () => {
      const path = [makeStep(primaryClass, "TestSchema.RelOne", "TestSchema.One")];
      const cardinalityHints = new Map<string, CardinalityHint>([[serializeRelationshipPath({ path }), "many"]]);
      const field = makePropertyField({
        propertyName: "Name",
        propertyClassName: "TestSchema.One",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.One"],
        primaryClassNames: [primaryClass],
      });

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        cardinalityHints,
        filters: [{ field, operator: "is-equal", value: "A" }],
      });

      // The hint splits the path off for column ownership, and the anchor evaluates the filter via EXISTS.
      expect(result.anchor.paths).to.deep.equal([]);
      expect(trimWhitespace(result.anchor.parts.where!)).to.equal(
        trimWhitespace(`
          WHERE EXISTS (
            SELECT 1
            FROM [TestSchema].[RelOne] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[One] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
            WHERE [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId] AND ([${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0)
          )
        `),
      );
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
        primaryClassNames: [filteredPath[0].sourceClassName],
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
      expect(result.anchor.parts.where).to.equal(`WHERE [${aliases!.target}].[Name] = :${ECSQL_PREFIX}vf0`);
    });

    it("evaluates an `is-null` filter on a 1:many path as no-related-instance-or-null-value, via a single aggregate scan", async () => {
      const path = makeOneToManyPath();
      const field = makeOneToManyNameField(path);

      const result = await buildBaseQuery({
        schemaProvider,
        source: makeSource([path]),
        includeRelatedJoins: true,
        filters: [{ field, operator: "is-null" }],
      });

      // `is-null` matches a primary with no related instance at all, or one whose related instance has
      // a null value. Both facts are read off one aggregate scan (`COUNT(*)` = 0, or `COUNT(Name)` <
      // `COUNT(*)` since `COUNT(column)` skips nulls), so the correlated join runs once rather than
      // twice (as a `NOT EXISTS (...) OR EXISTS (...)` would).
      expect(result.anchor.parts.joins).to.equal("");
      expect(trimWhitespace(result.anchor.parts.where!)).to.equal(
        trimWhitespace(`
          WHERE (
            SELECT COUNT(*) = 0 OR COUNT([${ECSQL_PREFIX}t0].[Name]) < COUNT(*)
            FROM [TestSchema].[RelMany] [${ECSQL_PREFIX}r0]
            INNER JOIN [TestSchema].[Many] [${ECSQL_PREFIX}t0] ON [${ECSQL_PREFIX}t0].[ECInstanceId] = [${ECSQL_PREFIX}r0].[TargetECInstanceId]
            WHERE [${ECSQL_PREFIX}r0].[SourceECInstanceId] = [this].[ECInstanceId]
          )
        `),
      );
    });

    it("joins an anchor-owned 1:1 filtered path only once", async () => {
      const path = makeOneToOnePath();
      const field = makeOneToOneNameField(path);

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
      expect(result.anchor.parts.where).to.equal(`WHERE [${ECSQL_PREFIX}t0].[Name] = :${ECSQL_PREFIX}vf0`);
      // A single link-table path renders exactly two `OUTER JOIN`s; a duplicated join would double that.
      expect(trimWhitespace(result.anchor.parts.joins).split("OUTER JOIN").length - 1).to.equal(2);
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { computePropertySelectorId } from "../../../content/definition-building/ValueSelector.js";
import { PropertyField } from "../../../content/model/Field.js";
import { PAGE_SIZE } from "../../../content/query/QueryLimits.js";
import { getItems } from "../../../content/query/value-loading/GetItems.js";
import { createPropertyValueDecoder } from "../../../content/query/value-loading/RowDecoder.js";
import {
  createEntityClass,
  createPrimitiveProperty,
  createRelationshipClass,
  createSchemaAccess,
} from "../../MetadataStubs.js";

import type { Id64String } from "@itwin/core-bentley";
import type { EC, ECSqlQueryDef, ECSqlQueryRow, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../../../content/ContentTarget.js";
import type { ContentDefinition } from "../../../content/definition-building/BuildContentDefinition.js";
import type { PropertyValueSelector } from "../../../content/definition-building/ValueSelector.js";
import type { ContentDescriptor } from "../../../content/model/ContentDescriptor.js";
import type { ContentQuerySort } from "../../../content/query/SelectBuilder.js";

function createTestDefinition(contentDescriptor: ContentDescriptor): ContentDefinition {
  const selectors: ContentDefinition["selectors"] = {};
  const fieldSelectorIds: ContentDefinition["fieldSelectorIds"] = {};
  const propertyReaders: ContentDefinition["propertyReaders"] = {};
  for (const field of Object.values(contentDescriptor.fields)) {
    if (field.kind !== "property") {
      continue;
    }
    const selector: PropertyValueSelector = {
      kind: "property",
      id: computePropertySelectorId({
        propertyClassName: field.propertyClassName,
        propertyName: field.propertyName,
        pathFromTarget: field.pathFromTarget,
      }),
      propertyClassName: field.propertyClassName,
      propertyName: field.propertyName,
      pathFromTarget: field.pathFromTarget,
    };
    selectors[selector.id] = selector;
    fieldSelectorIds[field.id] = selector.id;
    const decode = createPropertyValueDecoder(field.type);
    const applicableClasses = new Set(field.valueClassNames.map((name) => name.toLowerCase()));
    propertyReaders[selector.id] = (className, value) =>
      applicableClasses.has(className.toLowerCase()) ? decode(value) : undefined;
  }
  return { descriptor: contentDescriptor, selectors, propertyReaders, fieldSelectorIds, externalInputs: [] };
}

const codeField: PropertyField = {
  kind: "property",
  id: "Schema.A.Code",
  label: "Code",
  type: { kind: "primitive", type: "String" },
  propertyClassName: "Schema.A",
  propertyName: "Code",
  pathFromTarget: [],
  pathCardinality: "one",
  valueClassNames: ["Schema.A", "Schema.B"],
  primaryClassNames: ["Schema.A"],
};

const descriptor = {
  sources: [],
  categories: {},
  fields: { "Schema.A.Code": codeField },
} as unknown as ContentDescriptor;

const manyPath: RelationshipPath = [
  { sourceClassName: "TestSchema.Primary", relationshipName: "TestSchema.RelMany", targetClassName: "TestSchema.Many" },
];

const relCodeField: PropertyField = {
  kind: "property",
  id: "code",
  label: "Code",
  type: { kind: "primitive", type: "String" },
  propertyClassName: "TestSchema.Primary",
  propertyName: "Code",
  pathFromTarget: [],
  pathCardinality: "one",
  valueClassNames: ["TestSchema.Primary"],
  primaryClassNames: ["TestSchema.Primary"],
};

const relNameField: PropertyField = {
  kind: "property",
  id: "name",
  label: "Name",
  type: { kind: "primitive", type: "String" },
  propertyClassName: "TestSchema.Many",
  propertyName: "Name",
  pathFromTarget: manyPath,
  pathCardinality: "many",
  valueClassNames: ["TestSchema.Many"],
  primaryClassNames: ["TestSchema.Primary"],
};

const relDescriptor = {
  sources: [],
  categories: {},
  fields: { code: relCodeField, name: relNameField },
} as unknown as ContentDescriptor;

const filteredManyPathA: RelationshipPath = [{ ...manyPath[0], instanceFilter: { expression: "this.Kind = 1" } }];
const filteredManyPathB: RelationshipPath = [{ ...manyPath[0], instanceFilter: { expression: "this.Kind = 2" } }];
const filteredNameFieldA: PropertyField = {
  ...relNameField,
  id: PropertyField.computeId({
    propertyClassName: "TestSchema.Many",
    propertyName: "Name",
    pathFromTarget: filteredManyPathA,
  }),
  pathFromTarget: filteredManyPathA,
};
const filteredNameFieldB: PropertyField = {
  ...relNameField,
  id: PropertyField.computeId({
    propertyClassName: "TestSchema.Many",
    propertyName: "Name",
    pathFromTarget: filteredManyPathB,
  }),
  pathFromTarget: filteredManyPathB,
};
const filteredPathsDescriptor = {
  sources: [],
  categories: {},
  fields: { code: relCodeField, filteredNameA: filteredNameFieldA, filteredNameB: filteredNameFieldB },
} as unknown as ContentDescriptor;

function createRelationalSource(primaryClass: EC.FullClassNameDotNotation, related: boolean): ContentSource {
  return {
    target: { primaryClass },
    resolvedPrimaryClasses: [primaryClass],
    resolvedDeclarations: related
      ? [
          {
            providerId: "provider_v1",
            declarationIndex: 0,
            paths: [{ path: manyPath, targetClassNames: ["TestSchema.Many"] }],
          },
        ]
      : [],
  } as unknown as ContentSource;
}

function createFilteredPathsSource(primaryClass: EC.FullClassNameDotNotation): ContentSource {
  return {
    target: { primaryClass },
    resolvedPrimaryClasses: [primaryClass],
    resolvedDeclarations: [
      {
        providerId: "provider_v1",
        declarationIndex: 0,
        paths: [
          { path: filteredManyPathA, targetClassNames: ["TestSchema.Many"] },
          { path: filteredManyPathB, targetClassNames: ["TestSchema.Many"] },
        ],
      },
    ],
  } as unknown as ContentSource;
}

function createRelationalIModelAccess(handler: (query: ECSqlQueryDef) => ECSqlQueryRow[]) {
  const relationalSchemaProvider = createSchemaAccess([
    createEntityClass({
      fullName: "TestSchema.Primary",
      properties: [createPrimitiveProperty({ name: "Code", declaringClass: "TestSchema.Primary" })],
    }),
    createEntityClass({
      fullName: "TestSchema.Many",
      properties: [createPrimitiveProperty({ name: "Name", declaringClass: "TestSchema.Many" })],
    }),
    createEntityClass({
      fullName: "TestSchema.Sort",
      properties: [createPrimitiveProperty({ name: "Name", declaringClass: "TestSchema.Sort" })],
    }),
    createEntityClass({ fullName: "TestSchema.Other" }),
    createRelationshipClass({ fullName: "TestSchema.RelMany", cardinality: "many" }),
    createRelationshipClass({ fullName: "TestSchema.RelSort" }),
  ]);
  const queries: ECSqlQueryDef[] = [];
  const createQueryReader = vi.fn((query: ECSqlQueryDef) => {
    queries.push(query);
    const rows = handler(query);
    return (async function* () {
      for (const row of rows) {
        yield row;
      }
    })();
  });
  const imodelAccess = { ...relationalSchemaProvider, createQueryReader };
  return { imodelAccess, queries };
}

function createSource(primaryClass: ContentSource["target"]["primaryClass"]): ContentSource {
  return { target: { primaryClass }, resolvedPrimaryClasses: [primaryClass], resolvedDeclarations: [] };
}

function valueRow(className: EC.FullClassNameDotNotation, id: Id64String, code: string, sort?: string): ECSqlQueryRow {
  const row: ECSqlQueryRow = {
    ["pres_primary_class"]: className,
    ["pres_primary_id"]: id,
    ["this"]: JSON.stringify({ ["Code"]: code }),
  };
  if (sort !== undefined) {
    row.pres_sort_0 = sort;
  }
  return row;
}

function keyRow(className: EC.FullClassNameDotNotation, id: Id64String, sort: string): ECSqlQueryRow {
  return { ["pres_primary_class"]: className, ["pres_primary_id"]: id, ["pres_sort_0"]: sort };
}

function createIModelAccess(handler: (query: ECSqlQueryDef) => ECSqlQueryRow[]) {
  const queries: ECSqlQueryDef[] = [];
  let openReaders = 0;
  let closedReaders = 0;
  const createQueryReader = vi.fn((query: ECSqlQueryDef) => {
    queries.push(query);
    ++openReaders;
    const rows = handler(query);
    const iterator = (async function* () {
      for (const row of rows) {
        yield row;
      }
    })();
    const originalReturn = iterator.return.bind(iterator);
    iterator.return = async (value?: void) => {
      ++closedReaders;
      return originalReturn(value);
    };
    return iterator;
  });
  const codeProperty = createPrimitiveProperty({ name: "Code", declaringClass: "Schema.A" });
  const classB = createEntityClass({
    fullName: "Schema.B",
    properties: [codeProperty, createPrimitiveProperty({ name: "Label", declaringClass: "Schema.B" })],
  });
  const classA = createEntityClass({ fullName: "Schema.A", properties: [codeProperty], derivedClasses: [classB] });
  classB.baseClass = classA;
  const imodelAccess = { ...createSchemaAccess([classA, classB]), createQueryReader };
  return {
    imodelAccess,
    queries,
    createQueryReader,
    getOpenReaders: () => openReaders,
    getClosedReaders: () => closedReaders,
  };
}

describe("getItems", () => {
  it("loads a single source page and decodes property values", async () => {
    const { imodelAccess, queries } = createIModelAccess(() => [
      valueRow("Schema.A", "0x1", "A1"),
      valueRow("Schema.A", "0x2", "A2"),
    ]);
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A")],
      }),
    );

    expect(items.map((item) => item.primaryKey.id)).to.deep.equal(["0x1", "0x2"]);
    expect(items.map((item) => item.getValue(codeField))).to.deep.equal(["A1", "A2"]);
    // A single sub-PAGE_SIZE page needs one query and no additional-group stitching.
    expect(queries).to.have.lengthOf(1);
  });

  it("advances to the next page with a keyset cursor built from the last row", async () => {
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, index) =>
      valueRow("Schema.A", `0x${index + 1}`, `C${index}`),
    );
    const { imodelAccess, queries } = createIModelAccess((query) =>
      query.ecsql.includes("WHERE") ? [valueRow("Schema.A", "0xffff", "last")] : firstPage,
    );
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A")],
      }),
    );

    expect(items).to.have.lengthOf(PAGE_SIZE + 1);
    // The second page carries a keyset WHERE seeded with the previous page's final primary key.
    expect(queries).to.have.lengthOf(2);
    expect(queries[1].ecsql).to.contain("WHERE");
    expect(queries[1].bindings).to.deep.include({ ["pres_keyset_1"]: { type: "id", value: `0x${PAGE_SIZE}` } });
  });

  it("enumerates multiple unsorted sources with a per-source query", async () => {
    const { imodelAccess, queries } = createIModelAccess((query) =>
      query.ecsql.includes("[Schema].[A]") ? [valueRow("Schema.A", "0x1", "A1")] : [valueRow("Schema.B", "0x2", "B1")],
    );
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A"), createSource("Schema.B")],
      }),
    );

    expect(items.map((item) => item.primaryKey.id)).to.deep.equal(["0x1", "0x2"]);
    expect(queries).to.have.lengthOf(2);
    expect(queries.every((query) => !query.ecsql.includes("UNION ALL"))).to.equal(true);
  });

  it("orders multiple sorted sources with a two-phase key stream and value fetch", async () => {
    const { imodelAccess, queries } = createIModelAccess((query) => {
      if (query.ecsql.includes("UNION ALL")) {
        // Key stream: globally ordered keys interleaving both sources.
        return [keyRow("Schema.A", "0x1", "A"), keyRow("Schema.B", "0x2", "B"), keyRow("Schema.A", "0x3", "C")];
      }
      // Value fetch: each source's values fetched by IdSet.
      return query.ecsql.includes("[Schema].[A]")
        ? [valueRow("Schema.A", "0x1", "A"), valueRow("Schema.A", "0x3", "C")]
        : [valueRow("Schema.B", "0x2", "B")];
    });
    const sorting: ContentQuerySort[] = [{ field: codeField, direction: "asc" }];
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A"), createSource("Schema.B")],
        sorting,
      }),
    );
    expect(items.map((item) => item.primaryKey.id)).to.deep.equal(["0x1", "0x2", "0x3"]);
    expect(items.map((item) => item.getValue(codeField))).to.deep.equal(["A", "B", "C"]);
    // One key-stream query plus one value query per source.
    expect(queries[0].ecsql).to.contain("UNION ALL");
    expect(queries.filter((query) => query.ecsql.includes("IdSet"))).to.have.lengthOf(2);
  });

  it("closes every query reader it opens", async () => {
    const helper = createIModelAccess(() => [valueRow("Schema.A", "0x1", "A1")]);
    await collect(
      getItems({
        imodelAccess: helper.imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A")],
      }),
    );

    expect(helper.getClosedReaders()).to.equal(helper.getOpenReaders());
    expect(helper.getOpenReaders()).to.be.greaterThan(0);
  });

  it("throws when a page row carries malformed instance JSON", async () => {
    const { imodelAccess } = createIModelAccess(() => [
      { ["pres_primary_class"]: "Schema.A", ["pres_primary_id"]: "0x1", ["this"]: "{broken" },
    ]);
    await expect(
      collect(
        getItems({
          imodelAccess,
          getContentDefinition: async () => createTestDefinition(descriptor),
          sources: [createSource("Schema.A")],
        }),
      ),
    ).rejects.toThrow(/column "this"/);
  });

  it("throws when the anchor page query returns a duplicated primary row", async () => {
    // A "one"-hinted path that really reaches several instances multiplies anchor rows per primary; the
    // anchor's cardinality is always "one", so `decodeGroupRows` must catch this instead of silently
    // corrupting paging.
    const { imodelAccess } = createIModelAccess(() => [
      valueRow("Schema.A", "0x1", "A1"),
      valueRow("Schema.A", "0x1", "A1-duplicate"),
    ]);
    await expect(
      collect(
        getItems({
          imodelAccess,
          getContentDefinition: async () => createTestDefinition(descriptor),
          sources: [createSource("Schema.A")],
        }),
      ),
    ).rejects.toThrow(/"Schema.A:0x1"/);
  });

  it("yields nothing when the source page is empty", async () => {
    const { imodelAccess, queries } = createIModelAccess(() => []);
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A")],
      }),
    );
    expect(items).to.have.lengthOf(0);
    expect(queries).to.have.lengthOf(1);
  });

  it("yields nothing when the sorted key stream is empty", async () => {
    const sorting: ContentQuerySort[] = [{ field: codeField, direction: "asc" }];
    const { imodelAccess } = createIModelAccess(() => []);
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A"), createSource("Schema.B")],
        sorting,
      }),
    );
    expect(items).to.have.lengthOf(0);
  });

  it("yields a keyed instance even when no source supplies its values", async () => {
    const sorting: ContentQuerySort[] = [{ field: codeField, direction: "asc" }];
    const { imodelAccess } = createIModelAccess((query) =>
      query.ecsql.includes("UNION ALL") ? [keyRow("Schema.A", "0x1", "A")] : [],
    );
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A"), createSource("Schema.B")],
        sorting,
      }),
    );
    expect(items.map((item) => item.primaryKey.id)).to.deep.equal(["0x1"]);
    expect(items[0].getValue(codeField)).to.equal(undefined);
  });

  it("advances the sorted key stream to the next page via a cursor", async () => {
    const sorting: ContentQuerySort[] = [{ field: codeField, direction: "asc" }];
    const firstKeys = Array.from({ length: PAGE_SIZE }, (_, index) =>
      keyRow("Schema.A", `0x${index + 1}`, `C${index}`),
    );
    const { imodelAccess, queries } = createIModelAccess((query) => {
      if (query.ecsql.includes("UNION ALL")) {
        return query.ecsql.includes("WHERE") ? [keyRow("Schema.A", "0xffff", "Z")] : firstKeys;
      }
      return [];
    });
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A"), createSource("Schema.B")],
        sorting,
      }),
    );
    expect(items).to.have.lengthOf(PAGE_SIZE + 1);
    const keyStreamQueries = queries.filter((query) => query.ecsql.includes("UNION ALL"));
    expect(keyStreamQueries).to.have.lengthOf(2);
    expect(keyStreamQueries[1].ecsql).to.contain("WHERE");
  });

  it("treats a null sort column as an undefined sort value in the next-page cursor", async () => {
    const sorting: ContentQuerySort[] = [{ field: codeField, direction: "asc" }];
    // A full first page whose final row (the cursor seed) carries a null sort value.
    const firstKeys = Array.from({ length: PAGE_SIZE }, (_, index) =>
      index < PAGE_SIZE - 1
        ? keyRow("Schema.A", `0x${index + 1}`, `C${index}`)
        : { ["pres_primary_class"]: "Schema.A", ["pres_primary_id"]: "0xffff", ["pres_sort_0"]: null },
    );
    const { imodelAccess, queries } = createIModelAccess((query) => {
      if (query.ecsql.includes("UNION ALL")) {
        return query.ecsql.includes("WHERE") ? [] : firstKeys;
      }
      return [];
    });
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(descriptor),
        sources: [createSource("Schema.A"), createSource("Schema.B")],
        sorting,
      }),
    );
    expect(items).to.have.lengthOf(PAGE_SIZE);
    expect(items[items.length - 1].primaryKey.id).to.equal("0xffff");
    // The cursor built from the null-sorted last row pages with an `IS NULL` keyset predicate.
    const keyStreamQueries = queries.filter((query) => query.ecsql.includes("UNION ALL"));
    expect(keyStreamQueries[1].ecsql).to.contain("IS NULL");
  });

  it("keeps values separate for an id shared by two different-class sorted sources", async () => {
    // A `bis.Model` and its modeled `bis.Element` can share an `ECInstanceId`; stitching must key by
    // class+id, not id alone, or one class's values would leak into the other's item.
    const labelField: PropertyField = {
      ...codeField,
      id: "Schema.B.Label",
      label: "Label",
      propertyClassName: "Schema.B",
      propertyName: "Label",
      valueClassNames: ["Schema.B"],
    };
    const twoFieldDescriptor = {
      sources: [],
      categories: {},
      fields: { "Schema.A.Code": { ...codeField, valueClassNames: ["Schema.A"] }, "Schema.B.Label": labelField },
    } as unknown as ContentDescriptor;
    const sorting: ContentQuerySort[] = [{ field: codeField, direction: "asc" }];
    const { imodelAccess } = createIModelAccess((query) => {
      if (query.ecsql.includes("UNION ALL")) {
        return [keyRow("Schema.A", "0x1", "A"), keyRow("Schema.B", "0x1", "B")];
      }
      if (query.ecsql.includes("[Schema].[A]")) {
        return [
          {
            ["pres_primary_class"]: "Schema.A",
            ["pres_primary_id"]: "0x1",
            ["this"]: JSON.stringify({ ["Code"]: "code-1" }),
          },
        ];
      }
      if (query.ecsql.includes("[Schema].[B]")) {
        return [
          {
            ["pres_primary_class"]: "Schema.B",
            ["pres_primary_id"]: "0x1",
            ["this"]: JSON.stringify({ ["Label"]: "label-1" }),
          },
        ];
      }
      return [];
    });
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(twoFieldDescriptor),
        sources: [createSource("Schema.A"), createSource("Schema.B")],
        sorting,
      }),
    );
    expect(items).to.have.lengthOf(2);
    const aItem = items.find((item) => item.primaryKey.className === "Schema.A")!;
    const bItem = items.find((item) => item.primaryKey.className === "Schema.B")!;
    expect(aItem.getValue(codeField)).to.equal("code-1");
    expect(aItem.getValue(labelField)).to.equal(undefined);
    expect(bItem.getValue(labelField)).to.equal("label-1");
    expect(bItem.getValue(codeField)).to.equal(undefined);
  });

  it("stitches a 1:many related group's values into the anchor page item", async () => {
    const { imodelAccess } = createRelationalIModelAccess((query) => {
      if (query.ecsql.includes("pres_t0")) {
        // Additional (1:many) group value query — carries only the related `Name` blob.
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t0"]: JSON.stringify({ ["ECInstanceId"]: "0x2", ["Name"]: "name-1" }),
            ["pres_t0_cls"]: "TestSchema.Many",
          },
        ];
      }
      // Anchor page query — carries only the primary `Code` blob.
      return [
        {
          ["pres_primary_class"]: "TestSchema.Primary",
          ["pres_primary_id"]: "0x1",
          ["this"]: JSON.stringify({ ["Code"]: "code-1" }),
        },
      ];
    });
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(relDescriptor),
        sources: [createRelationalSource("TestSchema.Primary", true)],
      }),
    );
    expect(items).to.have.lengthOf(1);
    expect(items[0].getValue(relCodeField)).to.equal("code-1");
    expect(items[0].getValue(relNameField)).to.deep.equal(["name-1"]);
  });

  it("loads the same related property separately through differently filtered paths", async () => {
    const { imodelAccess, queries } = createRelationalIModelAccess((query) => {
      if (query.ecsql.includes("Kind = 1")) {
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t0"]: JSON.stringify({ ["ECInstanceId"]: "0x2", ["Name"]: "first" }),
            ["pres_t0_cls"]: "TestSchema.Many",
          },
        ];
      }
      if (query.ecsql.includes("Kind = 2")) {
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t1"]: JSON.stringify({ ["ECInstanceId"]: "0x3", ["Name"]: "second" }),
            ["pres_t1_cls"]: "TestSchema.Many",
          },
        ];
      }
      return [
        {
          ["pres_primary_class"]: "TestSchema.Primary",
          ["pres_primary_id"]: "0x1",
          ["this"]: JSON.stringify({ ["Code"]: "code-1" }),
        },
      ];
    });
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(filteredPathsDescriptor),
        sources: [createFilteredPathsSource("TestSchema.Primary")],
      }),
    );

    expect(filteredNameFieldA.id).to.not.equal(filteredNameFieldB.id);
    expect(items).to.have.lengthOf(1);
    expect(items[0].getValue(filteredNameFieldA)).to.deep.equal(["first"]);
    expect(items[0].getValue(filteredNameFieldB)).to.deep.equal(["second"]);
    expect(queries.filter((query) => query.ecsql.includes("Kind"))).to.have.lengthOf(2);
  });

  it("aligns index-i field values with index-i related instances across multiple rows of a 1:many group", async () => {
    const { imodelAccess } = createRelationalIModelAccess((query) => {
      if (query.ecsql.includes("pres_t0")) {
        // Additional (1:many) group value query — two rows for the same primary, one missing `Name`.
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t0"]: JSON.stringify({ ["ECInstanceId"]: "0x2", ["Name"]: "name-1" }),
            ["pres_t0_cls"]: "TestSchema.Many",
          },
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t0"]: JSON.stringify({ ["ECInstanceId"]: "0x3" }),
            ["pres_t0_cls"]: "TestSchema.Many",
          },
        ];
      }
      return [
        {
          ["pres_primary_class"]: "TestSchema.Primary",
          ["pres_primary_id"]: "0x1",
          ["this"]: JSON.stringify({ ["Code"]: "code-1" }),
        },
      ];
    });
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(relDescriptor),
        sources: [createRelationalSource("TestSchema.Primary", true)],
      }),
    );
    expect(items).to.have.lengthOf(1);
    expect(items[0].getValue(relNameField)).to.deep.equal(["name-1", undefined]);

    const relatedInstances = items[0].getRelatedInstances({ pathFromTarget: manyPath });
    expect(relatedInstances.map((entry) => entry.key.id)).to.deep.equal(["0x2", "0x3"]);
    // Index alignment holds end to end: each related instance's own `getValue` sees only its row's hole.
    expect(relatedInstances[0].getValue(relNameField)).to.equal("name-1");
    expect(relatedInstances[1].getValue(relNameField)).to.equal(undefined);
  });

  it("merges anchor and additional group values fetched for a sorted key", async () => {
    const sorting: ContentQuerySort[] = [{ field: relCodeField, direction: "asc" }];
    const { imodelAccess } = createRelationalIModelAccess((query) => {
      if (query.ecsql.includes("UNION ALL")) {
        return [{ ["pres_primary_class"]: "TestSchema.Primary", ["pres_primary_id"]: "0x1", ["pres_sort_0"]: "A" }];
      }
      if (query.ecsql.includes("pres_t0")) {
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t0"]: JSON.stringify({ ["ECInstanceId"]: "0x2", ["Name"]: "name-1" }),
            ["pres_t0_cls"]: "TestSchema.Many",
          },
        ];
      }
      if (query.ecsql.includes("[TestSchema].[Primary]")) {
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["this"]: JSON.stringify({ ["Code"]: "code-1" }),
          },
        ];
      }
      return [];
    });
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(relDescriptor),
        sources: [
          createRelationalSource("TestSchema.Primary", true),
          createRelationalSource("TestSchema.Other", false),
        ],
        sorting,
      }),
    );
    expect(items).to.have.lengthOf(1);
    expect(items[0].getValue(relCodeField)).to.equal("code-1");
    expect(items[0].getValue(relNameField)).to.deep.equal(["name-1"]);
  });

  it("owns a sort-only related path on the anchor even though it is not any group's leaf path", async () => {
    // Joined solely to evaluate ORDER BY — no field/selector reads it, so it can never be a leaf path of
    // any group and must fall to `assignPathOwnership`'s second pass (first-resolvable-group tie-break).
    const sortOnlyPath = [
      {
        sourceClassName: "TestSchema.Primary",
        relationshipName: "TestSchema.RelSort",
        targetClassName: "TestSchema.Sort",
      },
    ];
    const sortField: PropertyField = {
      kind: "property",
      id: "sortOnly",
      label: "SortOnly",
      type: { kind: "primitive", type: "String" },
      propertyClassName: "TestSchema.Sort",
      propertyName: "Name",
      pathFromTarget: sortOnlyPath as PropertyField["pathFromTarget"],
      pathCardinality: "one",
      valueClassNames: ["TestSchema.Sort"],
      primaryClassNames: ["TestSchema.Primary"],
    };
    const { imodelAccess } = createRelationalIModelAccess((query) => {
      if (query.ecsql.includes("pres_t0")) {
        // Additional (1:many) group value query — carries only the related `Name` blob.
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t0"]: JSON.stringify({ ["ECInstanceId"]: "0x2", ["Name"]: "name-1" }),
            ["pres_t0_cls"]: "TestSchema.Many",
          },
        ];
      }
      // Anchor page query — carries the primary `Code` blob and the sort-only path's ORDER BY column.
      return [
        {
          ["pres_primary_class"]: "TestSchema.Primary",
          ["pres_primary_id"]: "0x1",
          ["this"]: JSON.stringify({ ["Code"]: "code-1" }),
          ["pres_sort_0"]: "sort-value",
        },
      ];
    });
    const items = await collect(
      getItems({
        imodelAccess,
        getContentDefinition: async () => createTestDefinition(relDescriptor),
        sources: [createRelationalSource("TestSchema.Primary", true)],
        sorting: [{ field: sortField, direction: "asc" }],
      }),
    );
    expect(items).to.have.lengthOf(1);
    expect(items[0].getValue(relCodeField)).to.equal("code-1");
    expect(items[0].getValue(relNameField)).to.deep.equal(["name-1"]);
  });
});

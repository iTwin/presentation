/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { computePropertySelectorId } from "../../../content/model/ValueSelector.js";
import { PAGE_SIZE } from "../../../content/query/QueryLimits.js";
import { getItems } from "../../../content/query/value-loading/GetItems.js";
import { createEntityClass, createSchemaAccess } from "../../MetadataStubs.js";

import type { Id64String } from "@itwin/core-bentley";
import type {
  EC,
  ECSchemaProvider,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryRow,
} from "@itwin/presentation-shared";
import type { ContentSource } from "../../../content/ContentTarget.js";
import type { ExternalFieldsProvider } from "../../../content/extensions/ExternalFieldsProvider.js";
import type { ContentDescriptor } from "../../../content/model/ContentDescriptor.js";
import type { PropertyField } from "../../../content/model/Field.js";
import type { ContentQuerySort } from "../../../content/query/SelectBuilder.js";

const codeField: PropertyField = {
  kind: "property",
  id: "Schema.A.Code",
  label: "Code",
  type: { kind: "primitive", type: "String" },
  propertyClassName: "Schema.A",
  propertyName: "Code",
  pathFromTarget: [],
  pathCardinality: "one",
  valueClassNames: ["Schema.A"],
  primaryClassNames: ["Schema.A"],
  selectorId: "Schema.A.Code",
};

const descriptor = {
  sources: [],
  categories: {},
  fields: { "Schema.A.Code": codeField },
  selectors: {
    "Schema.A.Code": {
      kind: "property",
      id: "Schema.A.Code",
      propertyClassName: "Schema.A",
      propertyName: "Code",
      pathFromTarget: [],
    },
  },
} as unknown as ContentDescriptor;

const externalDescriptor = {
  sources: [],
  categories: {},
  fields: {
    "Schema.A.Code": codeField,
    "ext_v1:status": {
      kind: "external",
      id: "ext_v1:status",
      label: "Status",
      type: { kind: "primitive", type: "String" },
      providerId: "ext_v1",
    },
  },
  selectors: descriptor.selectors,
} as unknown as ContentDescriptor;

function createExternalStatusProvider(getValues: ExternalFieldsProvider["getValues"]): ExternalFieldsProvider {
  return {
    id: "ext_v1",
    fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
    inputs: { code: { propertyClassName: "Schema.A", propertyName: "Code" } },
    getValues,
  } as unknown as ExternalFieldsProvider;
}

const manyPath = [
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
  selectorId: "code",
};

const relNameField: PropertyField = {
  kind: "property",
  id: "name",
  label: "Name",
  type: { kind: "primitive", type: "String" },
  propertyClassName: "TestSchema.Many",
  propertyName: "Name",
  pathFromTarget: manyPath as PropertyField["pathFromTarget"],
  pathCardinality: "many",
  valueClassNames: ["TestSchema.Many"],
  primaryClassNames: ["TestSchema.Primary"],
  selectorId: "name",
};

const relDescriptor = {
  sources: [],
  categories: {},
  fields: { code: relCodeField, name: relNameField },
  selectors: {
    code: {
      kind: "property",
      id: "code",
      propertyClassName: "TestSchema.Primary",
      propertyName: "Code",
      pathFromTarget: [],
    },
    name: {
      kind: "property",
      id: "name",
      propertyClassName: "TestSchema.Many",
      propertyName: "Name",
      pathFromTarget: manyPath,
    },
  },
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
    externalInputPaths: [],
  } as unknown as ContentSource;
}

function createRelationalIModelAccess(handler: (query: ECSqlQueryDef) => ECSqlQueryRow[]) {
  // A schema provider modelled after `BaseQuery.test.ts`: a relationship class whose name contains `Many`
  // traverses a 1:many constraint (so it splits into an `additional` group), everything else is 1:1.
  const relationalSchemaProvider = {
    getSchema: async (schemaName: string) => ({
      getClass: (className: string) => ({
        fullName: `${schemaName}.${className}`,
        getProperties: () => [],
        isRelationshipClass: () => className.startsWith("Rel"),
        source: { multiplicity: { lowerLimit: 0, upperLimit: 1 } },
        target: { multiplicity: { lowerLimit: 0, upperLimit: className.includes("Many") ? 2 : 1 } },
      }),
    }),
  };
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
  const imodelAccess = { ...relationalSchemaProvider, createQueryReader } as unknown as ECSchemaProvider &
    ECSqlQueryExecutor;
  return { imodelAccess, queries };
}

function createSource(primaryClass: ContentSource["target"]["primaryClass"]): ContentSource {
  return {
    target: { primaryClass },
    resolvedPrimaryClasses: [primaryClass],
    resolvedDeclarations: [],
    externalInputPaths: [],
  };
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
  const imodelAccess = {
    ...createSchemaAccess([createEntityClass({ fullName: "Schema.A" }), createEntityClass({ fullName: "Schema.B" })]),
    createQueryReader,
  } as ECSchemaProvider & ECSqlQueryExecutor;
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
      getItems({ imodelAccess, getDescriptor: async () => descriptor, sources: [createSource("Schema.A")] }),
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
      getItems({ imodelAccess, getDescriptor: async () => descriptor, sources: [createSource("Schema.A")] }),
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
        getDescriptor: async () => descriptor,
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
        getDescriptor: async () => descriptor,
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
        getDescriptor: async () => descriptor,
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
      collect(getItems({ imodelAccess, getDescriptor: async () => descriptor, sources: [createSource("Schema.A")] })),
    ).rejects.toThrow(/column "this"/);
  });

  it("yields nothing when the source page is empty", async () => {
    const { imodelAccess, queries } = createIModelAccess(() => []);
    const items = await collect(
      getItems({ imodelAccess, getDescriptor: async () => descriptor, sources: [createSource("Schema.A")] }),
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
        getDescriptor: async () => descriptor,
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
        getDescriptor: async () => descriptor,
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
        getDescriptor: async () => descriptor,
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
        getDescriptor: async () => descriptor,
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

  it("merges values for a primary key supplied by more than one sorted source", async () => {
    const labelField: PropertyField = {
      ...codeField,
      id: "Schema.A.Label",
      label: "Label",
      propertyName: "Label",
      selectorId: "Schema.A.Label",
    };
    const twoFieldDescriptor = {
      sources: [],
      categories: {},
      fields: { "Schema.A.Code": codeField, "Schema.A.Label": labelField },
      selectors: {
        "Schema.A.Code": {
          kind: "property",
          id: "Schema.A.Code",
          propertyClassName: "Schema.A",
          propertyName: "Code",
          pathFromTarget: [],
        },
        "Schema.A.Label": {
          kind: "property",
          id: "Schema.A.Label",
          propertyClassName: "Schema.A",
          propertyName: "Label",
          pathFromTarget: [],
        },
      },
    } as unknown as ContentDescriptor;
    const sorting: ContentQuerySort[] = [{ field: codeField, direction: "asc" }];
    const { imodelAccess } = createIModelAccess((query) => {
      if (query.ecsql.includes("UNION ALL")) {
        return [keyRow("Schema.A", "0x1", "A")];
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
        getDescriptor: async () => twoFieldDescriptor,
        sources: [createSource("Schema.A"), createSource("Schema.B")],
        sorting,
      }),
    );
    expect(items).to.have.lengthOf(1);
    expect(items[0].getValue(codeField)).to.equal("code-1");
    expect(items[0].getValue(labelField)).to.equal("label-1");
  });

  it("stitches a 1:many related group's values into the anchor page item", async () => {
    const { imodelAccess } = createRelationalIModelAccess((query) => {
      if (query.ecsql.includes("pres_t0")) {
        // Additional (1:many) group value query — carries only the related `Name` blob.
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t0"]: JSON.stringify({ ["Name"]: "name-1" }),
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
        getDescriptor: async () => relDescriptor,
        sources: [createRelationalSource("TestSchema.Primary", true)],
      }),
    );
    expect(items).to.have.lengthOf(1);
    expect(items[0].getValue(relCodeField)).to.equal("code-1");
    expect(items[0].getValue(relNameField)).to.equal("name-1");
  });

  it("populates an external field whose inputs span the anchor query and an additional related group", async () => {
    // Input-only selectors (no backing field) for an external field whose inputs span the anchor's direct
    // `Code` and the 1:many related group's `Name` — mirrors what `collectSelectors` adds for provider inputs.
    const combinedInputCodeSelectorId = computePropertySelectorId({
      propertyClassName: "TestSchema.Primary",
      propertyName: "Code",
    });
    const combinedInputNameSelectorId = computePropertySelectorId({
      propertyClassName: "TestSchema.Many",
      propertyName: "Name",
      pathFromTarget: manyPath as PropertyField["pathFromTarget"],
    });
    const relExternalDescriptor = {
      sources: [],
      categories: {},
      fields: {
        ...relDescriptor.fields,
        "ext_v1:combined": {
          kind: "external",
          id: "ext_v1:combined",
          label: "Combined",
          type: { kind: "primitive", type: "String" },
          providerId: "ext_v1",
        },
      },
      selectors: {
        ...relDescriptor.selectors,
        [combinedInputCodeSelectorId]: {
          kind: "property",
          id: combinedInputCodeSelectorId,
          propertyClassName: "TestSchema.Primary",
          propertyName: "Code",
          pathFromTarget: [],
        },
        [combinedInputNameSelectorId]: {
          kind: "property",
          id: combinedInputNameSelectorId,
          propertyClassName: "TestSchema.Many",
          propertyName: "Name",
          pathFromTarget: manyPath,
        },
      },
    } as unknown as ContentDescriptor;
    function createCombinedFieldsProvider(fetchValues: ExternalFieldsProvider["getValues"]): ExternalFieldsProvider {
      return {
        id: "ext_v1",
        fields: [{ id: "combined", label: "Combined", type: { kind: "primitive", type: "String" } }],
        inputs: {
          code: { propertyClassName: "TestSchema.Primary", propertyName: "Code" },
          name: { propertyClassName: "TestSchema.Many", propertyName: "Name", path: manyPath },
        },
        getValues: fetchValues,
      } as unknown as ExternalFieldsProvider;
    }
    const getValues = vi.fn(
      async ({ items: batch }: { items: Array<{ inputValues: { code: string; name: string } }> }) =>
        batch.map((item) => ({ combined: `${item.inputValues.code}+${item.inputValues.name}` })),
    );
    const { imodelAccess } = createRelationalIModelAccess((query) => {
      if (query.ecsql.includes("pres_t0")) {
        // Additional (1:many) group value query — the provider's "name" input is read from here.
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t0"]: JSON.stringify({ ["Name"]: "name-1" }),
          },
        ];
      }
      // Anchor page query — the provider's "code" input is read from here.
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
        getDescriptor: async () => relExternalDescriptor,
        sources: [createRelationalSource("TestSchema.Primary", true)],
        externalFieldsProviders: [createCombinedFieldsProvider(getValues)],
      }),
    );

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { code: "code-1", name: "name-1" } }] });
    expect(items[0].getValue(relExternalDescriptor.fields["ext_v1:combined"])).to.equal("code-1+name-1");
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
            ["pres_t0"]: JSON.stringify({ ["Name"]: "name-1" }),
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
        getDescriptor: async () => relDescriptor,
        sources: [
          createRelationalSource("TestSchema.Primary", true),
          createRelationalSource("TestSchema.Other", false),
        ],
        sorting,
      }),
    );
    expect(items).to.have.lengthOf(1);
    expect(items[0].getValue(relCodeField)).to.equal("code-1");
    expect(items[0].getValue(relNameField)).to.equal("name-1");
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
      selectorId: "sortOnly",
    };
    const { imodelAccess } = createRelationalIModelAccess((query) => {
      if (query.ecsql.includes("pres_t0")) {
        // Additional (1:many) group value query — carries only the related `Name` blob.
        return [
          {
            ["pres_primary_class"]: "TestSchema.Primary",
            ["pres_primary_id"]: "0x1",
            ["pres_t0"]: JSON.stringify({ ["Name"]: "name-1" }),
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
        getDescriptor: async () => relDescriptor,
        sources: [createRelationalSource("TestSchema.Primary", true)],
        sorting: [{ field: sortField, direction: "asc" }],
      }),
    );
    expect(items).to.have.lengthOf(1);
    expect(items[0].getValue(relCodeField)).to.equal("code-1");
    expect(items[0].getValue(relNameField)).to.equal("name-1");
  });

  it("populates external field values from the page's decoded input selectors", async () => {
    const getValues = vi.fn(async ({ items: batch }: { items: Array<{ inputValues: { code: string } }> }) =>
      batch.map((item) => ({ status: `${item.inputValues.code}!` })),
    );
    const { imodelAccess } = createIModelAccess(() => [
      valueRow("Schema.A", "0x1", "A1"),
      valueRow("Schema.A", "0x2", "A2"),
    ]);
    const items = await collect(
      getItems({
        imodelAccess,
        getDescriptor: async () => externalDescriptor,
        sources: [createSource("Schema.A")],
        externalFieldsProviders: [createExternalStatusProvider(getValues)],
      }),
    );

    expect(getValues).toHaveBeenCalledTimes(1);
    expect(items.map((item) => item.getValue(externalDescriptor.fields["ext_v1:status"]))).to.deep.equal([
      "A1!",
      "A2!",
    ]);
  });

  it("calls an external fields provider once per loaded page", async () => {
    const getValues = vi.fn(async ({ items: batch }: { items: Array<unknown> }) => batch.map(() => ({ status: "ok" })));
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, index) =>
      valueRow("Schema.A", `0x${index + 1}`, `C${index}`),
    );
    const { imodelAccess } = createIModelAccess((query) =>
      query.ecsql.includes("WHERE") ? [valueRow("Schema.A", "0xffff", "last")] : firstPage,
    );
    await collect(
      getItems({
        imodelAccess,
        getDescriptor: async () => externalDescriptor,
        sources: [createSource("Schema.A")],
        externalFieldsProviders: [createExternalStatusProvider(getValues)],
      }),
    );

    expect(getValues).toHaveBeenCalledTimes(2);
  });

  it("propagates a rejection from an external fields provider", async () => {
    const provider = createExternalStatusProvider(async () => Promise.reject(new Error("external service down")));
    const { imodelAccess } = createIModelAccess(() => [valueRow("Schema.A", "0x1", "A1")]);

    await expect(
      collect(
        getItems({
          imodelAccess,
          getDescriptor: async () => externalDescriptor,
          sources: [createSource("Schema.A")],
          externalFieldsProviders: [provider],
        }),
      ),
    ).rejects.toThrow(/external service down/);
  });
});

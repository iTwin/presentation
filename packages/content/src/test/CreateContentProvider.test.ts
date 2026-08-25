/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { createContentProvider, resolveContentSources } from "../content/Content.js";
import { createEntityClass, createPrimitiveProperty, createSchemaAccess } from "./MetadataStubs.js";

import type { EC, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import type { ContentSource } from "../content/ContentTarget.js";
import type { PropertyField } from "../content/model/Field.js";

const imodelAccess = { ...createSchemaAccess([createEntityClass({ fullName: "Schema.A" })]) } as ReturnType<
  typeof createSchemaAccess
> &
  ECSqlQueryExecutor;

function createSource(primaryClass: ContentSource["target"]["primaryClass"]): ContentSource {
  return { target: { primaryClass }, resolvedPrimaryClasses: [primaryClass], resolvedDeclarations: [] };
}

function createSizeIModelAccess(props: { schemaClasses?: EC.Class[]; counts: Array<number | undefined> }) {
  const counts = [...props.counts];
  const createQueryReader = vi.fn(() =>
    (async function* () {
      const count = counts.shift();
      if (count !== undefined) {
        yield { 0: count };
      }
    })(),
  );
  return {
    ...createSchemaAccess(props.schemaClasses ?? [createEntityClass({ fullName: "Schema.A" })]),
    createQueryReader,
  };
}

function createInstanceKeysIModelAccess(props: {
  schemaClasses?: EC.Class[];
  keyBatches: Array<Array<{ id: string; className: string }>>;
}) {
  const keyBatches = props.keyBatches.map((batch) => [...batch]);
  const createQueryReader = vi.fn(() => {
    const sourceKeys = keyBatches.shift() ?? [];
    return (async function* () {
      for (const key of sourceKeys) {
        yield { 0: key.id, 1: key.className };
      }
    })();
  });
  return {
    ...createSchemaAccess(props.schemaClasses ?? [createEntityClass({ fullName: "Schema.A" })]),
    createQueryReader,
  };
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) {
    result.push(value);
  }
  return result;
}

describe("createContentProvider", () => {
  describe("getContentDescriptor", () => {
    it("builds the descriptor from the configured sources", async () => {
      const sources = [createSource("Schema.A")];
      const provider = createContentProvider({ imodelAccess, sources });
      const descriptor = await provider.getContentDescriptor();
      expect(descriptor.sources).to.equal(sources);
    });

    it("builds the descriptor lazily and caches it across calls", async () => {
      const provider = createContentProvider({ imodelAccess, sources: [createSource("Schema.A")] });
      const first = await provider.getContentDescriptor();
      const second = await provider.getContentDescriptor();
      expect(first).to.equal(second);
    });

    it("includes subclass fields for a provider-free polymorphic target", async () => {
      const derivedClasses: EC.Class[] = [];
      const element = createEntityClass({ fullName: "Schema.Element", derivedClasses });
      const pump = createEntityClass({
        fullName: "Schema.Pump",
        baseClass: element,
        ownProperties: [createPrimitiveProperty({ name: "FlowRate", declaringClass: "Schema.Pump" })],
      });
      derivedClasses.push(pump);
      const polymorphicIModelAccess = {
        ...createSchemaAccess([element, pump]),
        createQueryReader: () =>
          (async function* () {
            yield { 0: "Schema.Pump" };
          })(),
      };

      const sources = await resolveContentSources({
        imodelAccess: polymorphicIModelAccess,
        targets: [{ primaryClass: element.fullName }],
      });
      const descriptor = await createContentProvider({
        imodelAccess: polymorphicIModelAccess,
        sources,
      }).getContentDescriptor();

      expect(sources[0].resolvedPrimaryClasses).to.deep.equal(["Schema.Pump"]);
      expect((descriptor.fields["Schema.Pump.FlowRate"] as PropertyField).valueClassNames).to.deep.equal([
        "Schema.Pump",
      ]);
    });
  });

  describe("getSize", () => {
    it("counts a source without building its descriptor", async () => {
      const sizeIModelAccess = createSizeIModelAccess({ counts: [3] });
      const provider = createContentProvider({ imodelAccess: sizeIModelAccess, sources: [createSource("Schema.A")] });

      await expect(provider.getSize()).resolves.to.equal(3);
      expect(sizeIModelAccess.createQueryReader).toHaveBeenCalledOnce();
      expect(sizeIModelAccess.createQueryReader).toHaveBeenCalledWith(
        { ecsql: "SELECT COUNT(*) FROM [Schema].[A] [this]", bindings: undefined },
        { rowFormat: "Indexes" },
      );
    });

    it("includes value filters in a count query", async () => {
      const length: PropertyField = {
        kind: "property",
        id: "Schema.A.Length",
        label: "Length",
        type: { kind: "primitive", type: "Double" },
        propertyClassName: "Schema.A",
        propertyName: "Length",
        pathFromTarget: [],
        valueClassNames: ["Schema.A"],
        primaryClassNames: ["Schema.A"],
        selectorId: "Schema.A.Length",
      };
      const sizeIModelAccess = createSizeIModelAccess({ counts: [2] });
      const provider = createContentProvider({ imodelAccess: sizeIModelAccess, sources: [createSource("Schema.A")] });

      await expect(
        provider.getSize({ filters: [{ field: length, operator: "is-equal", value: 10 }] }),
      ).resolves.to.equal(2);
      expect(sizeIModelAccess.createQueryReader).toHaveBeenCalledWith(
        {
          ecsql: "SELECT COUNT(*) FROM [Schema].[A] [this] WHERE [this].[Length] = :pres_vf0",
          bindings: { ["pres_vf0"]: { type: "double", value: 10 } },
        },
        { rowFormat: "Indexes" },
      );
    });

    it("sums counts from separate source queries", async () => {
      const sizeIModelAccess = createSizeIModelAccess({ counts: [2, 3] });
      const provider = createContentProvider({
        imodelAccess: sizeIModelAccess,
        sources: [createSource("Schema.A"), createSource("Schema.B")],
      });

      await expect(provider.getSize()).resolves.to.equal(5);
      expect(sizeIModelAccess.createQueryReader).toHaveBeenCalledTimes(2);
    });

    it("runs at most 10 source queries in parallel", async () => {
      const gates = Array.from({ length: 10 }, () => new ResolvablePromise<void>());
      let queryIndex = 0;
      const createQueryReader = vi.fn(() => {
        const index = queryIndex++;
        return (async function* () {
          if (index < gates.length) {
            await gates[index];
          }
          yield { 0: 1 };
        })();
      });
      const sizeIModelAccess = {
        ...createSchemaAccess([createEntityClass({ fullName: "Schema.A" })]),
        createQueryReader,
      };
      const provider = createContentProvider({
        imodelAccess: sizeIModelAccess,
        sources: Array.from({ length: 11 }, () => createSource("Schema.A")),
      });

      const sizePromise = provider.getSize();
      await vi.waitFor(() => expect(createQueryReader).toHaveBeenCalledTimes(10));
      for (const gate of gates) {
        await gate.resolve();
      }
      await expect(sizePromise).resolves.to.equal(11);
    });

    it("returns zero without querying when there are no sources", async () => {
      const sizeIModelAccess = createSizeIModelAccess({ counts: [] });
      const provider = createContentProvider({ imodelAccess: sizeIModelAccess, sources: [] });

      await expect(provider.getSize()).resolves.to.equal(0);
      expect(sizeIModelAccess.createQueryReader).not.toHaveBeenCalled();
    });

    it("returns zero when a count query has no result row", async () => {
      const sizeIModelAccess = createSizeIModelAccess({ counts: [undefined] });
      const provider = createContentProvider({ imodelAccess: sizeIModelAccess, sources: [createSource("Schema.A")] });

      await expect(provider.getSize()).resolves.to.equal(0);
    });
  });

  describe("getInstanceKeys", () => {
    it("queries a source without building its descriptor", async () => {
      const keysIModelAccess = createInstanceKeysIModelAccess({
        keyBatches: [[{ id: "0x1", className: "Schema.A" }]],
      });
      const provider = createContentProvider({ imodelAccess: keysIModelAccess, sources: [createSource("Schema.A")] });

      await expect(collect(provider.getInstanceKeys())).resolves.to.deep.equal([{ id: "0x1", className: "Schema.A" }]);
      expect(keysIModelAccess.createQueryReader).toHaveBeenCalledOnce();
      expect(keysIModelAccess.createQueryReader).toHaveBeenCalledWith(
        {
          ecsql: "SELECT [this].[ECInstanceId], ec_classname([this].[ECClassId], 's.c') FROM [Schema].[A] [this]",
          bindings: undefined,
        },
        { rowFormat: "Indexes" },
      );
    });

    it("includes value filters in an instance-key query", async () => {
      const length: PropertyField = {
        kind: "property",
        id: "Schema.A.Length",
        label: "Length",
        type: { kind: "primitive", type: "Double" },
        propertyClassName: "Schema.A",
        propertyName: "Length",
        pathFromTarget: [],
        valueClassNames: ["Schema.A"],
        primaryClassNames: ["Schema.A"],
        selectorId: "Schema.A.Length",
      };
      const keysIModelAccess = createInstanceKeysIModelAccess({
        keyBatches: [[{ id: "0x2", className: "Schema.A" }]],
      });
      const provider = createContentProvider({ imodelAccess: keysIModelAccess, sources: [createSource("Schema.A")] });

      await expect(
        collect(provider.getInstanceKeys({ filters: [{ field: length, operator: "is-equal", value: 10 }] })),
      ).resolves.to.deep.equal([{ id: "0x2", className: "Schema.A" }]);
      expect(keysIModelAccess.createQueryReader).toHaveBeenCalledWith(
        {
          ecsql:
            "SELECT [this].[ECInstanceId], ec_classname([this].[ECClassId], 's.c') FROM [Schema].[A] [this] WHERE [this].[Length] = :pres_vf0",
          bindings: { ["pres_vf0"]: { type: "double", value: 10 } },
        },
        { rowFormat: "Indexes" },
      );
    });

    it("yields keys from separate source queries", async () => {
      const keysIModelAccess = createInstanceKeysIModelAccess({
        keyBatches: [
          [{ id: "0x1", className: "Schema.A" }],
          [{ id: "0x2", className: "Schema.B" }],
        ],
      });
      const provider = createContentProvider({
        imodelAccess: keysIModelAccess,
        sources: [createSource("Schema.A"), createSource("Schema.B")],
      });

      const keys = await collect(provider.getInstanceKeys());
      expect(keys).toHaveLength(2);
      expect(keys).toEqual(expect.arrayContaining([
        { id: "0x1", className: "Schema.A" },
        { id: "0x2", className: "Schema.B" },
      ]));
      expect(keysIModelAccess.createQueryReader).toHaveBeenCalledTimes(2);
    });

    it("does not query when there are no sources", async () => {
      const keysIModelAccess = createInstanceKeysIModelAccess({ keyBatches: [] });
      const provider = createContentProvider({ imodelAccess: keysIModelAccess, sources: [] });

      await expect(collect(provider.getInstanceKeys())).resolves.to.deep.equal([]);
      expect(keysIModelAccess.createQueryReader).not.toHaveBeenCalled();
    });
  });
});

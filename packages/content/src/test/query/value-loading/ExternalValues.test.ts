/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { computePropertySelectorId } from "../../../content/definition-building/ValueSelector.js";
import { serializeRelationshipPath } from "../../../content/model/Utils.js";
import { createExternalValuePopulator } from "../../../content/query/value-loading/ExternalValues.js";

import type { Value } from "@itwin/presentation-shared";
import type { ExternalProviderPlan } from "../../../content/definition-building/ExternalProviders.js";
import type { ExternalFieldsProvider } from "../../../content/extensions/ExternalFieldsProvider.js";
import type { ContentDescriptor } from "../../../content/model/ContentDescriptor.js";
import type { RelatedInstanceEntry } from "../../../content/model/ContentItem.js";
import type { GroupValues } from "../../../content/query/value-loading/RowDecoder.js";

const codeSelectorId = computePropertySelectorId({ propertyClassName: "Schema.A", propertyName: "Code" });
const namePath = [
  { sourceClassName: "Schema.A", relationshipName: "Schema.RelToB", targetClassName: "Schema.B" },
] as const;
const nameSelectorId = computePropertySelectorId({
  propertyClassName: "Schema.B",
  propertyName: "Name",
  pathFromTarget: [...namePath],
});
const namePathKey = serializeRelationshipPath({ path: [...namePath] });
const codeInput: ExternalProviderPlan["inputs"][number] = {
  key: "code",
  cardinality: "one",
  selectors: [{ selectorId: codeSelectorId }],
};
const nameInput: ExternalProviderPlan["inputs"][number] = {
  key: "name",
  cardinality: "one",
  selectors: [{ selectorId: nameSelectorId, pathKey: namePathKey }],
};

function createStatusPlan(
  provider: ExternalFieldsProvider,
  inputs: ExternalProviderPlan["inputs"] = [],
): ExternalProviderPlan {
  return { provider, inputs, outputs: [{ localId: "status", fieldId: "ext_v1:status" }] };
}

function createRow(values: Array<[string, Value]> = []): GroupValues {
  return { selectorValues: new Map(values.map(([key, value]) => [key, [value]])), relatedInstances: new Map() };
}

function createRelatedRow(props: { code: Value; names: Value[] }): GroupValues {
  return {
    selectorValues: new Map([
      [codeSelectorId, [props.code]],
      [nameSelectorId, props.names],
    ]),
    relatedInstances: new Map([
      [namePathKey, props.names.map((_, index) => ({ key: { className: "Schema.B", id: `0x${index + 1}` } }))],
    ]),
  };
}

function createDescriptor(fieldIds: string[]): ContentDescriptor {
  return {
    fields: Object.fromEntries(fieldIds.map((id) => [id, { kind: "external", id, providerId: "ext_v1" }])),
  } as unknown as ContentDescriptor;
}

function createProvider(props: {
  id?: ExternalFieldsProvider["id"];
  localFieldIds: string[];
  getValues: ExternalFieldsProvider["getValues"];
}): ExternalFieldsProvider {
  return {
    id: props.id ?? "ext_v1",
    fields: props.localFieldIds.map((id) => ({ id, label: id, type: { kind: "primitive", type: "String" } })),
    getValues: props.getValues,
  };
}

describe("createExternalValuePopulator", () => {
  it("returns undefined when no providers are configured and the descriptor has no external fields", () => {
    expect(createExternalValuePopulator({ descriptor: createDescriptor([]), plans: [] })).to.equal(undefined);
  });

  it("throws when the descriptor declares an external field with no registered provider", () => {
    expect(() => createExternalValuePopulator({ descriptor: createDescriptor(["ext_v1:status"]), plans: [] })).toThrow(
      /No external fields provider is registered to populate field\(s\): "ext_v1:status"/,
    );
  });

  it("throws when a registered provider does not cover all of the descriptor's external fields", () => {
    const provider = createProvider({ localFieldIds: ["status"], getValues: async () => [{ status: "ok" }] });
    expect(() =>
      createExternalValuePopulator({
        descriptor: createDescriptor(["ext_v1:status", "ext_v1:missing"]),
        plans: [createStatusPlan(provider)],
      }),
    ).toThrow(/"ext_v1:missing"/);
  });

  it("does not throw when no single provider covers all fields but the registered providers together do", () => {
    const first = createProvider({ id: "first_v1", localFieldIds: ["a"], getValues: async () => [] });
    const second = createProvider({ id: "second_v1", localFieldIds: ["b"], getValues: async () => [] });
    expect(() =>
      createExternalValuePopulator({
        descriptor: createDescriptor(["first_v1:a", "second_v1:b"]),
        plans: [
          { provider: first, inputs: [], outputs: [{ localId: "a", fieldId: "first_v1:a" }] },
          { provider: second, inputs: [], outputs: [{ localId: "b", fieldId: "second_v1:b" }] },
        ],
      }),
    ).to.not.throw();
  });

  it("extracts declared input values from the row's selectors and maps local ids back to global field ids", async () => {
    const getValues = vi.fn(async (args: { items: Array<{ inputValues: { code: string; name: string } }> }) =>
      args.items.map((item) => ({ status: `${item.inputValues.code}/${item.inputValues.name}` })),
    );
    const provider = createProvider({ localFieldIds: ["status"], getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [createStatusPlan(provider, [codeInput, nameInput])],
    });
    expect(populate).to.not.equal(undefined);

    const rows = [createRelatedRow({ code: "A1", names: ["B1"] })];
    const result = await firstValueFrom(populate!(rows));

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { code: "A1", name: "B1" } }] });
    expect(result).to.deep.equal([{ "ext_v1:status": "A1/B1" }]);
  });

  it("passes undefined for an input whose selector produced no value", async () => {
    const getValues = vi.fn(async (args: { items: Array<{ inputValues: Record<string, Value> }> }) =>
      args.items.map(() => ({ status: "ok" })),
    );
    const provider = createProvider({ localFieldIds: ["status"], getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [createStatusPlan(provider, [codeInput, nameInput])],
    });

    await firstValueFrom(populate!([createRow()]));

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { code: undefined, name: undefined } }] });
  });

  it.each([
    { description: "undefined", value: undefined },
    { description: "a scalar", value: "A1" },
    { description: "an empty EC array", value: [] },
    { description: "an EC array", value: ["A1", "A2"] },
  ])("passes a direct input's $description value through unchanged", async ({ value }) => {
    const getValues = vi.fn(async () => [{ status: "ok" }]);
    const provider = createProvider({ localFieldIds: ["status"], getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [createStatusPlan(provider, [codeInput])],
    })!;

    await firstValueFrom(populate([createRow([[codeSelectorId, value]])]));

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { code: value } }] });
  });

  it("passes one value per related instance to a many-valued input", async () => {
    const getValues = vi.fn(async (args: { items: Array<{ inputValues: { code: string; name: string[] } }> }) =>
      args.items.map((item) => ({ status: item.inputValues.name.join(",") })),
    );
    const provider = createProvider({ localFieldIds: ["status"], getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [createStatusPlan(provider, [codeInput, { ...nameInput, cardinality: "many" }])],
    });

    const rows = [createRelatedRow({ code: "A1", names: ["B1", "B2"] })];
    const result = await firstValueFrom(populate!(rows));

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { code: "A1", name: ["B1", "B2"] } }] });
    expect(result).to.deep.equal([{ "ext_v1:status": "B1,B2" }]);
  });

  it("passes an empty array for a many-valued input whose selector produced no value", async () => {
    const getValues = vi.fn(async (args: { items: Array<{ inputValues: { code: string; name: string[] } }> }) =>
      args.items.map((item) => ({ status: item.inputValues.name.join(",") })),
    );
    const provider = createProvider({ localFieldIds: ["status"], getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [createStatusPlan(provider, [codeInput, { ...nameInput, cardinality: "many" }])],
    });

    const result = await firstValueFrom(populate!([createRow([[codeSelectorId, "A1"]])]));

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { code: "A1", name: [] } }] });
    expect(result).to.deep.equal([{ "ext_v1:status": "" }]);
  });

  it("combines values across related paths without flattening EC array properties or dropping nulls", async () => {
    const getValues = vi.fn(async ({ items }: { items: Array<{ inputValues: Record<string, Value> }> }) =>
      items.map(() => ({ status: "ok" })),
    );
    const provider = createProvider({ localFieldIds: ["status"], getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [
        {
          provider,
          inputs: [
            {
              key: "tags",
              cardinality: "many",
              selectors: [
                { selectorId: "first", pathKey: "firstPath" },
                { selectorId: "second", pathKey: "secondPath" },
              ],
            },
          ],
          outputs: [{ localId: "status", fieldId: "ext_v1:status" }],
        },
      ],
    })!;

    await firstValueFrom(
      populate([
        {
          selectorValues: new Map<string, Value[]>([
            ["first", [["a", "b"]]],
            ["second", [["c"], undefined]],
          ]),
          relatedInstances: new Map<string, RelatedInstanceEntry[]>([
            ["firstPath", [{ key: { className: "Schema.B1", id: "0x1" } }]],
            [
              "secondPath",
              [{ key: { className: "Schema.B2", id: "0x2" } }, { key: { className: "Schema.B2", id: "0x3" } }],
            ],
          ]),
        },
      ]),
    );

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { tags: [["a", "b"], ["c"], undefined] } }] });
  });

  it("rejects a one-valued input reaching two concrete variants even when both property values are null", () => {
    const getValues = vi.fn(async () => [{ status: "ok" }]);
    const provider = createProvider({ localFieldIds: ["status"], getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [
        {
          provider,
          inputs: [
            {
              key: "name",
              cardinality: "one",
              selectors: [
                { selectorId: "first", pathKey: "firstPath" },
                { selectorId: "second", pathKey: "secondPath" },
              ],
            },
          ],
          outputs: [{ localId: "status", fieldId: "ext_v1:status" }],
        },
      ],
    })!;

    expect(() =>
      populate([
        {
          selectorValues: new Map([
            ["first", [undefined]],
            ["second", [undefined]],
          ]),
          relatedInstances: new Map<string, RelatedInstanceEntry[]>([
            ["firstPath", [{ key: { className: "Schema.B1", id: "0x1" } }]],
            ["secondPath", [{ key: { className: "Schema.B2", id: "0x2" } }]],
          ]),
        },
      ]),
    ).toThrow(/"ext_v1" input "name".*more than one related instance/);
    expect(getValues).not.toHaveBeenCalled();
  });

  it.each([
    { description: "no instances", values: [] },
    { description: "an undefined property", values: [undefined] },
    { description: "a scalar property", values: ["first"] },
    { description: "an empty EC array property", values: [[]] },
    { description: "an EC array property", values: [["first", "second"]] },
  ])(
    "preserves separate providers' one and many inputs for a shared selector with $description",
    async ({ values }) => {
      const getOne = vi.fn(async () => [{ status: "one" }]);
      const getMany = vi.fn(async () => [{ status: "many" }]);
      const one = createProvider({ id: "one_v1", localFieldIds: ["status"], getValues: getOne });
      const many = createProvider({ id: "many_v1", localFieldIds: ["status"], getValues: getMany });
      const selectors = [{ selectorId: "shared", pathKey: "path" }];
      const populate = createExternalValuePopulator({
        descriptor: createDescriptor(["one_v1:status", "many_v1:status"]),
        plans: [
          {
            provider: one,
            inputs: [{ key: "name", selectors, cardinality: "one" }],
            outputs: [{ localId: "status", fieldId: "one_v1:status" }],
          },
          {
            provider: many,
            inputs: [{ key: "name", selectors, cardinality: "many" }],
            outputs: [{ localId: "status", fieldId: "many_v1:status" }],
          },
        ],
      })!;
      await firstValueFrom(
        populate([
          {
            selectorValues: new Map([["shared", values]]),
            relatedInstances: new Map([["path", values.map(() => ({ key: { className: "Schema.B", id: "0x1" } }))]]),
          },
        ]),
      );
      expect(getOne).toHaveBeenCalledWith({ items: [{ inputValues: { name: values[0] } }] });
      expect(getMany).toHaveBeenCalledWith({ items: [{ inputValues: { name: values } }] });
    },
  );

  it("rejects multiple null-valued instances for a one input loaded through a shared many selector", () => {
    const getValues = vi.fn(async () => [{ status: "ok" }]);
    const provider = createProvider({ localFieldIds: ["status"], getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [
        {
          provider,
          inputs: [{ key: "name", cardinality: "one", selectors: [{ selectorId: "name", pathKey: "path" }] }],
          outputs: [{ localId: "status", fieldId: "ext_v1:status" }],
        },
      ],
    })!;
    expect(() =>
      populate([
        {
          selectorValues: new Map([["name", [undefined, undefined]]]),
          relatedInstances: new Map([
            ["path", [{ key: { className: "Schema.B", id: "0x1" } }, { key: { className: "Schema.B", id: "0x2" } }]],
          ]),
        },
      ]),
    ).toThrow(/"ext_v1" input "name".*more than one related instance/);
    expect(getValues).not.toHaveBeenCalled();
  });

  it("throws when a provider returns a different number of records than the batch", async () => {
    const provider = createProvider({ localFieldIds: ["status"], getValues: async () => [] });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [createStatusPlan(provider)],
    })!;

    await expect(firstValueFrom(populate([createRow()]))).rejects.toThrow(
      /"ext_v1" returned 0 value records for a batch of 1/,
    );
  });

  it("ignores keys in the returned record that the provider does not own", async () => {
    const provider = createProvider({
      localFieldIds: ["status"],
      getValues: async () => [{ status: "ok", debug: "extra" }],
    });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [createStatusPlan(provider)],
    })!;

    const result = await firstValueFrom(populate([createRow()]));

    expect(result).to.deep.equal([{ "ext_v1:status": "ok" }]);
  });

  it("omits a field when the provider's record leaves it undefined", async () => {
    const provider = createProvider({ localFieldIds: ["status"], getValues: async () => [{}] });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [createStatusPlan(provider)],
    })!;

    const result = await firstValueFrom(populate([createRow()]));

    expect(result).to.deep.equal([{}]);
  });

  it("calls every configured provider and merges their values by row index", async () => {
    const first = createProvider({
      id: "first_v1",
      localFieldIds: ["a"],
      getValues: async ({ items }) => items.map(() => ({ a: 1 })),
    });
    const second = createProvider({
      id: "second_v1",
      localFieldIds: ["b"],
      getValues: async ({ items }) => items.map(() => ({ b: 2 })),
    });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["first_v1:a", "second_v1:b"]),
      plans: [
        { provider: first, inputs: [], outputs: [{ localId: "a", fieldId: "first_v1:a" }] },
        { provider: second, inputs: [], outputs: [{ localId: "b", fieldId: "second_v1:b" }] },
      ],
    })!;

    const result = await firstValueFrom(populate([createRow(), createRow()]));

    expect(result).to.deep.equal([
      { "first_v1:a": 1, "second_v1:b": 2 },
      { "first_v1:a": 1, "second_v1:b": 2 },
    ]);
  });

  it("propagates a rejection from any provider's getValues", async () => {
    const failing = createProvider({
      localFieldIds: ["status"],
      getValues: async () => Promise.reject(new Error("external service down")),
    });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      plans: [createStatusPlan(failing)],
    })!;

    await expect(firstValueFrom(populate([createRow()]))).rejects.toThrow(/external service down/);
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { computePropertySelectorId } from "../../../content/model/ValueSelector.js";
import { createExternalValuePopulator } from "../../../content/query/value-loading/ExternalValues.js";

import type { Value } from "@itwin/presentation-shared";
import type { ExternalFieldsProvider } from "../../../content/extensions/ExternalFieldsProvider.js";
import type { ContentDescriptor } from "../../../content/model/ContentDescriptor.js";

const codeSelectorId = computePropertySelectorId({ propertyClassName: "Schema.A", propertyName: "Code" });
const namePath = [
  { sourceClassName: "Schema.A", relationshipName: "Schema.RelToB", targetClassName: "Schema.B" },
] as const;
const nameSelectorId = computePropertySelectorId({
  propertyClassName: "Schema.B",
  propertyName: "Name",
  pathFromTarget: [...namePath],
});

function createDescriptor(fieldIds: string[]): ContentDescriptor {
  return {
    fields: Object.fromEntries(fieldIds.map((id) => [id, { kind: "external", id, providerId: "ext_v1" }])),
  } as unknown as ContentDescriptor;
}

function createProvider(props: {
  id?: string;
  localFieldIds: string[];
  withInputs?: boolean;
  getValues: ExternalFieldsProvider["getValues"];
}): ExternalFieldsProvider {
  return {
    id: props.id ?? "ext_v1",
    fields: props.localFieldIds.map((id) => ({ id, label: id, type: { kind: "primitive", type: "String" } })),
    ...(props.withInputs
      ? {
          inputs: {
            code: { propertyClassName: "Schema.A", propertyName: "Code" },
            name: { propertyClassName: "Schema.B", propertyName: "Name", path: [...namePath] },
          },
        }
      : undefined),
    getValues: props.getValues,
  } as unknown as ExternalFieldsProvider;
}

describe("createExternalValuePopulator", () => {
  it("returns undefined when no providers are configured and the descriptor has no external fields", () => {
    expect(createExternalValuePopulator({ descriptor: createDescriptor([]) })).to.equal(undefined);
  });

  it("returns undefined when every provider's declared fields were removed from the descriptor", () => {
    const provider = createProvider({ localFieldIds: ["status"], getValues: async () => [{ status: "ok" }] });
    expect(createExternalValuePopulator({ descriptor: createDescriptor([]), providers: [provider] })).to.equal(
      undefined,
    );
  });

  it("throws when the descriptor declares an external field with no registered provider", () => {
    expect(() => createExternalValuePopulator({ descriptor: createDescriptor(["ext_v1:status"]) })).toThrow(
      /No external fields provider is registered to populate field\(s\): "ext_v1:status"/,
    );
  });

  it("throws when a registered provider does not cover all of the descriptor's external fields", () => {
    const provider = createProvider({ localFieldIds: ["status"], getValues: async () => [{ status: "ok" }] });
    expect(() =>
      createExternalValuePopulator({
        descriptor: createDescriptor(["ext_v1:status", "ext_v1:missing"]),
        providers: [provider],
      }),
    ).toThrow(/"ext_v1:missing"/);
  });

  it("does not throw when no single provider covers all fields but the registered providers together do", () => {
    const first = createProvider({ id: "first_v1", localFieldIds: ["a"], getValues: async () => [] });
    const second = createProvider({ id: "second_v1", localFieldIds: ["b"], getValues: async () => [] });
    expect(() =>
      createExternalValuePopulator({
        descriptor: createDescriptor(["first_v1:a", "second_v1:b"]),
        providers: [first, second],
      }),
    ).to.not.throw();
  });

  it("extracts declared input values from the row's selectors and maps local ids back to global field ids", async () => {
    const getValues = vi.fn(async (args: { items: Array<{ inputValues: { code: string; name: string } }> }) =>
      args.items.map((item) => ({ status: `${item.inputValues.code}/${item.inputValues.name}` })),
    );
    const provider = createProvider({ localFieldIds: ["status"], withInputs: true, getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      providers: [provider],
    });
    expect(populate).to.not.equal(undefined);

    const rows = [
      {
        selectorValues: new Map<string, Value>([
          [codeSelectorId, "A1"],
          [nameSelectorId, "B1"],
        ]),
      },
    ];
    const result = await firstValueFrom(populate!(rows));

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { code: "A1", name: "B1" } }] });
    expect(result).to.deep.equal([{ "ext_v1:status": "A1/B1" }]);
  });

  it("passes undefined for an input whose selector produced no value", async () => {
    const getValues = vi.fn(async (args: { items: Array<{ inputValues: Record<string, Value> }> }) =>
      args.items.map(() => ({ status: "ok" })),
    );
    const provider = createProvider({ localFieldIds: ["status"], withInputs: true, getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      providers: [provider],
    });

    await firstValueFrom(populate!([{ selectorValues: new Map<string, Value>() }]));

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { code: undefined, name: undefined } }] });
  });

  it("passes a many-valued input's array through unchanged, one element per related instance", async () => {
    const getValues = vi.fn(async (args: { items: Array<{ inputValues: { code: string; name: string[] } }> }) =>
      args.items.map((item) => ({ status: item.inputValues.name.join(",") })),
    );
    const provider = createProvider({ localFieldIds: ["status"], withInputs: true, getValues });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      providers: [provider],
    });

    const rows = [
      {
        selectorValues: new Map<string, Value>([
          [codeSelectorId, "A1"],
          [nameSelectorId, ["B1", "B2"]],
        ]),
      },
    ];
    const result = await firstValueFrom(populate!(rows));

    expect(getValues).toHaveBeenCalledWith({ items: [{ inputValues: { code: "A1", name: ["B1", "B2"] } }] });
    expect(result).to.deep.equal([{ "ext_v1:status": "B1,B2" }]);
  });

  it("throws when a provider returns a different number of records than the batch", async () => {
    const provider = createProvider({ localFieldIds: ["status"], getValues: async () => [] });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      providers: [provider],
    })!;

    await expect(firstValueFrom(populate([{ selectorValues: new Map() }]))).rejects.toThrow(
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
      providers: [provider],
    })!;

    const result = await firstValueFrom(populate([{ selectorValues: new Map() }]));

    expect(result).to.deep.equal([{ "ext_v1:status": "ok" }]);
  });

  it("omits a field when the provider's record leaves it undefined", async () => {
    const provider = createProvider({ localFieldIds: ["status"], getValues: async () => [{}] });
    const populate = createExternalValuePopulator({
      descriptor: createDescriptor(["ext_v1:status"]),
      providers: [provider],
    })!;

    const result = await firstValueFrom(populate([{ selectorValues: new Map() }]));

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
      providers: [first, second],
    })!;

    const result = await firstValueFrom(populate([{ selectorValues: new Map() }, { selectorValues: new Map() }]));

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
      providers: [failing],
    })!;

    await expect(firstValueFrom(populate([{ selectorValues: new Map() }]))).rejects.toThrow(/external service down/);
  });
});

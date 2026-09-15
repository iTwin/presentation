/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { serializeRelationshipPath } from "../content/model/Utils.js";
import {
  classifyPathCardinality,
  collectPathCardinalities,
  createPathCardinalityClassifier,
} from "../content/PathCardinality.js";
import { createRelationshipClass, createSchemaAccess } from "./MetadataStubs.js";

import type { EC, ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { CardinalityHint } from "../content/ContentTarget.js";
import type { ContentDescriptor } from "../content/model/ContentDescriptor.js";
import type { ExternalField, Field, PropertyField } from "../content/model/Field.js";

describe("createPathCardinalityClassifier", () => {
  const aToB: RelationshipPath[number] = {
    sourceClassName: "TestSchema.A",
    targetClassName: "TestSchema.B",
    relationshipName: "TestSchema.AToB",
  };
  const bToC: RelationshipPath[number] = {
    sourceClassName: "TestSchema.B",
    targetClassName: "TestSchema.C",
    relationshipName: "TestSchema.BToC",
  };

  /** Schema where `AToB` is single-valued and `BToC` is many-valued. */
  const schemaProvider = createSchemaAccess([
    createRelationshipClass({ fullName: "TestSchema.AToB" }),
    createRelationshipClass({ fullName: "TestSchema.BToC", cardinality: "many" }),
  ]);

  it("falls back to schema multiplicity when the declaration gives no hint", async () => {
    const classifier = createPathCardinalityClassifier(schemaProvider);
    expect(await classifier.classify({ path: [aToB], declaredPath: [aToB] })).to.equal("one");
    expect(await classifier.classify({ path: [aToB, bToC], declaredPath: [aToB, bToC] })).to.equal("many");
  });

  it("lets the declaration's hint override schema multiplicity", async () => {
    const classifier = createPathCardinalityClassifier(schemaProvider);
    const path = [aToB, bToC];
    expect(await classifier.classify({ path, declaredPath: path, hint: "one" })).to.equal("one");
  });

  it("applies a `one` hint to a prefix of the declared path", async () => {
    // `one` for the whole traversal implies `one` for every prefix, so the schema's many-valued
    // `BToC` step doesn't resurface on the prefix.
    const classifier = createPathCardinalityClassifier(schemaProvider);
    expect(await classifier.classify({ path: [aToB, bToC], declaredPath: [aToB, bToC, bToC], hint: "one" })).to.equal(
      "one",
    );
  });

  it("does not apply a `many` hint to a prefix of the declared path", async () => {
    // `many` for the whole traversal says nothing about a prefix, so the prefix is classified from schema.
    const classifier = createPathCardinalityClassifier(schemaProvider);
    expect(await classifier.classify({ path: [aToB], declaredPath: [aToB, bToC], hint: "many" })).to.equal("one");
  });

  it("classifies a path per hint rather than letting the first verdict stick", async () => {
    const classifier = createPathCardinalityClassifier(schemaProvider);
    const path = [aToB, bToC];
    expect(await classifier.classify({ path, declaredPath: path })).to.equal("many");
    expect(await classifier.classify({ path, declaredPath: path, hint: "one" })).to.equal("one");
  });
});

describe("classifyPathCardinality", () => {
  type Limit = number | "unbounded";
  function createSchemaProvider(relationships: Record<string, { source: Limit; target: Limit }>): ECSchemaProvider {
    return {
      getSchema: async (schemaName: string) =>
        ({
          getClass: async (className: string) => {
            const fullName = `${schemaName}.${className}`;
            const limits = relationships[fullName];
            const constraint = (upperLimit: Limit): EC.RelationshipConstraint =>
              ({ multiplicity: { lowerLimit: 0, upperLimit } }) as unknown as EC.RelationshipConstraint;
            return {
              fullName,
              isRelationshipClass: () => true,
              source: constraint(limits.source),
              target: constraint(limits.target),
            } as unknown as EC.RelationshipClass;
          },
        }) as unknown as EC.Schema,
      classDerivesFrom: async () => false,
    };
  }

  function step(relationship: string, reverse?: boolean): RelationshipPath[number] {
    return {
      sourceClassName: "TestSchema.A",
      relationshipName: `TestSchema.${relationship}`,
      targetClassName: "TestSchema.B",
      ...(reverse ? { relationshipReverse: true } : undefined),
    };
  }

  const path: RelationshipPath = [step("AtoB")];

  it("returns the supplied hint without consulting the schema", async () => {
    const getSchema = vi.fn();
    const schemaProvider = { getSchema } as unknown as ECSchemaProvider;
    expect(await classifyPathCardinality({ schemaProvider, path, cardinalityHint: "one" })).to.equal("one");
    expect(await classifyPathCardinality({ schemaProvider, path, cardinalityHint: "many" })).to.equal("many");
    expect(getSchema).not.toHaveBeenCalled();
  });

  it("classifies as many when the target constraint allows multiple", async () => {
    const schemaProvider = createSchemaProvider({ "TestSchema.AtoB": { source: 1, target: 10 } });
    expect(await classifyPathCardinality({ schemaProvider, path })).to.equal("many");
  });

  it("classifies as many when the target constraint is unbounded", async () => {
    const schemaProvider = createSchemaProvider({ "TestSchema.AtoB": { source: 1, target: "unbounded" } });
    expect(await classifyPathCardinality({ schemaProvider, path })).to.equal("many");
  });

  it("classifies as one when every traversed constraint is single-valued", async () => {
    const schemaProvider = createSchemaProvider({
      "TestSchema.AtoB": { source: 10, target: 1 },
      "TestSchema.BtoC": { source: 10, target: 1 },
    });
    const twoStep: RelationshipPath = [
      step("AtoB"),
      { ...step("BtoC"), sourceClassName: "TestSchema.B", targetClassName: "TestSchema.C" },
    ];
    expect(await classifyPathCardinality({ schemaProvider, path: twoStep })).to.equal("one");
  });

  it("honors relationshipReverse when picking the landing constraint", async () => {
    // Forward traversal lands on the single-valued target => one; reverse lands on the many source.
    const schemaProvider = createSchemaProvider({ "TestSchema.AtoB": { source: 10, target: 1 } });
    expect(await classifyPathCardinality({ schemaProvider, path: [step("AtoB")] })).to.equal("one");
    expect(await classifyPathCardinality({ schemaProvider, path: [step("AtoB", true)] })).to.equal("many");
  });

  it("classifies as many when any step is multi-valued", async () => {
    const schemaProvider = createSchemaProvider({
      "TestSchema.AtoB": { source: 1, target: 1 },
      "TestSchema.BtoC": { source: 1, target: 5 },
    });
    const twoStep: RelationshipPath = [
      step("AtoB"),
      { ...step("BtoC"), sourceClassName: "TestSchema.B", targetClassName: "TestSchema.C" },
    ];
    expect(await classifyPathCardinality({ schemaProvider, path: twoStep })).to.equal("many");
  });

  it("throws when a step's relationship class is not a relationship", async () => {
    const schemaProvider = {
      getSchema: async (schemaName: string) => ({
        getClass: async (className: string) => ({
          fullName: `${schemaName}.${className}`,
          isRelationshipClass: () => false,
        }),
      }),
    } as unknown as ECSchemaProvider;
    await expect(classifyPathCardinality({ schemaProvider, path: [step("AtoB")] })).rejects.toThrow(
      "TestSchema.AtoB is not a relationship class",
    );
  });
});

describe("collectPathCardinalities", () => {
  const aToB: RelationshipPath[number] = {
    sourceClassName: "TestSchema.A",
    targetClassName: "TestSchema.B",
    relationshipName: "TestSchema.AToB",
  };
  const bToC: RelationshipPath[number] = {
    sourceClassName: "TestSchema.B",
    targetClassName: "TestSchema.C",
    relationshipName: "TestSchema.BToC",
  };

  function makeField(props: {
    id: string;
    pathFromTarget: RelationshipPath;
    pathCardinality: CardinalityHint;
  }): PropertyField {
    return {
      kind: "property",
      id: props.id,
      label: props.id,
      type: { kind: "primitive", type: "String" },
      propertyClassName: "TestSchema.B",
      propertyName: "Name",
      pathFromTarget: props.pathFromTarget,
      pathCardinality: props.pathCardinality,
      valueClassNames: ["TestSchema.B"],
      primaryClassNames: ["TestSchema.A"],
    };
  }

  function makeDescriptor(fields: Field[]): ContentDescriptor {
    return { fields: Object.fromEntries(fields.map((field) => [field.id, field])) } as unknown as ContentDescriptor;
  }

  it("ignores a direct field and a non-property field", () => {
    const directField = makeField({ id: "direct", pathFromTarget: [], pathCardinality: "one" });
    const externalField: ExternalField = {
      kind: "external",
      id: "ext",
      label: "Ext",
      type: { kind: "primitive", type: "String" },
      providerId: "provider_v1",
    };

    expect(collectPathCardinalities(makeDescriptor([directField, externalField])).size).to.equal(0);
  });

  it("keys a related field's own path with its cardinality", () => {
    const field = makeField({ id: "b", pathFromTarget: [aToB], pathCardinality: "many" });
    const hints = collectPathCardinalities(makeDescriptor([field]));

    expect(hints.get(serializeRelationshipPath({ path: [aToB] }))).to.equal("many");
  });

  it("keeps differently filtered paths isolated when only one path is hinted", () => {
    const filteredA: RelationshipPath = [
      { ...aToB, instanceFilter: { expression: "this.Kind = :kindA", bindings: { kindA: { type: "int", value: 1 } } } },
    ];
    const filteredB: RelationshipPath = [
      { ...aToB, instanceFilter: { expression: "this.Kind = :kindB", bindings: { kindB: { type: "int", value: 2 } } } },
    ];
    const fieldA = makeField({ id: "filtered-a", pathFromTarget: filteredA, pathCardinality: "one" });
    const hints = collectPathCardinalities(makeDescriptor([fieldA]));

    expect(hints.get(serializeRelationshipPath({ path: filteredA }))).to.equal("one");
    expect(hints.has(serializeRelationshipPath({ path: filteredB }))).to.be.false;
    expect(hints.has(serializeRelationshipPath({ path: filteredB.slice(0, 1) }))).to.be.false;
    expect(hints.has(serializeRelationshipPath({ path: [aToB] }))).to.be.false;
  });

  it("does not leak a `one` hint across filtered prefixes or into the unfiltered path", () => {
    const filteredA: RelationshipPath = [
      { ...aToB, instanceFilter: { expression: "this.Kind = :kindA", bindings: { kindA: { type: "int", value: 1 } } } },
      bToC,
    ];
    const filteredB: RelationshipPath = [
      { ...aToB, instanceFilter: { expression: "this.Kind = :kindB", bindings: { kindB: { type: "int", value: 2 } } } },
      bToC,
    ];
    const fieldA = makeField({ id: "a", pathFromTarget: filteredA, pathCardinality: "one" });
    const fieldB = makeField({ id: "b", pathFromTarget: filteredB, pathCardinality: "many" });
    const hints = collectPathCardinalities(makeDescriptor([fieldA, fieldB]));

    expect(hints.get(serializeRelationshipPath({ path: filteredA }))).to.equal("one");
    expect(hints.get(serializeRelationshipPath({ path: filteredB }))).to.equal("many");
    expect(hints.get(serializeRelationshipPath({ path: filteredA.slice(0, 1) }))).to.equal("one");
    expect(hints.has(serializeRelationshipPath({ path: filteredB.slice(0, 1) }))).to.be.false;
    expect(hints.has(serializeRelationshipPath({ path: [aToB] }))).to.be.false;
  });

  it("reuses the schema-cardinality cache for equivalent filtered lookups", async () => {
    const getClass = vi.fn(async () => ({
      fullName: "TestSchema.AToB",
      isRelationshipClass: () => true,
      source: { multiplicity: { upperLimit: 1 } },
      target: { multiplicity: { upperLimit: 1 } },
    }));
    const schemaProvider = {
      getSchema: vi.fn(async () => ({ getClass })),
      classDerivesFrom: async () => false,
    } as unknown as ECSchemaProvider;

    const classifier = createPathCardinalityClassifier(schemaProvider);
    const pathA: RelationshipPath = [
      { ...aToB, instanceFilter: { expression: "this.Kind = :kindA", bindings: { kindA: { type: "int", value: 1 } } } },
    ];
    const pathB: RelationshipPath = [
      { ...aToB, instanceFilter: { expression: "this.Kind = :kindB", bindings: { kindB: { type: "int", value: 2 } } } },
    ];

    await expect(classifier.classify({ path: pathA, declaredPath: pathA })).resolves.to.equal("one");
    await expect(classifier.classify({ path: pathB, declaredPath: pathB })).resolves.to.equal("one");
    expect(getClass).toHaveBeenCalledTimes(1);
  });

  it("seeds every unhinted prefix of a `one` path", () => {
    const field = makeField({ id: "c", pathFromTarget: [aToB, bToC], pathCardinality: "one" });
    const hints = collectPathCardinalities(makeDescriptor([field]));

    expect(hints.get(serializeRelationshipPath({ path: [aToB] }))).to.equal("one");
    expect(hints.get(serializeRelationshipPath({ path: [aToB, bToC] }))).to.equal("one");
  });

  it("does not seed a prefix of a `many` path", () => {
    const field = makeField({ id: "c", pathFromTarget: [aToB, bToC], pathCardinality: "many" });
    const hints = collectPathCardinalities(makeDescriptor([field]));

    expect(hints.has(serializeRelationshipPath({ path: [aToB] }))).to.be.false;
    expect(hints.get(serializeRelationshipPath({ path: [aToB, bToC] }))).to.equal("many");
  });

  it("does not overwrite a prefix's own directly-declared verdict", () => {
    const prefixField = makeField({ id: "b", pathFromTarget: [aToB], pathCardinality: "many" });
    const fullField = makeField({ id: "c", pathFromTarget: [aToB, bToC], pathCardinality: "one" });
    const hints = collectPathCardinalities(makeDescriptor([prefixField, fullField]));

    // The prefix has its own `many` declaration, so the full path's `one` prefix-seed must not override it.
    expect(hints.get(serializeRelationshipPath({ path: [aToB] }))).to.equal("many");
  });

  it("resolves disagreeing fields on the same path to `many`", () => {
    const oneField = makeField({ id: "one", pathFromTarget: [aToB], pathCardinality: "one" });
    const manyField = makeField({ id: "many", pathFromTarget: [aToB], pathCardinality: "many" });
    const hints = collectPathCardinalities(makeDescriptor([oneField, manyField]));

    expect(hints.get(serializeRelationshipPath({ path: [aToB] }))).to.equal("many");
  });

  it("folds in a hinted external input on a path with no field", () => {
    const hints = collectPathCardinalities(makeDescriptor([]), [
      { propertyClassName: "TestSchema.B", propertyName: "Name", pathFromTarget: [aToB], cardinalityHint: "many" },
    ]);

    expect(hints.get(serializeRelationshipPath({ path: [aToB] }))).to.equal("many");
  });

  it("ignores an unhinted external input", () => {
    const hints = collectPathCardinalities(makeDescriptor([]), [
      { propertyClassName: "TestSchema.B", propertyName: "Name", pathFromTarget: [aToB] },
    ]);

    expect(hints.size).to.equal(0);
  });

  it("seeds prefixes from a `one`-hinted external input the same way a field would", () => {
    const hints = collectPathCardinalities(makeDescriptor([]), [
      { propertyClassName: "TestSchema.C", propertyName: "Name", pathFromTarget: [aToB, bToC], cardinalityHint: "one" },
    ]);

    expect(hints.get(serializeRelationshipPath({ path: [aToB] }))).to.equal("one");
    expect(hints.get(serializeRelationshipPath({ path: [aToB, bToC] }))).to.equal("one");
  });

  it("resolves a field and an external input disagreeing on the same path to `many`", () => {
    const oneField = makeField({ id: "one", pathFromTarget: [aToB], pathCardinality: "one" });
    const hints = collectPathCardinalities(makeDescriptor([oneField]), [
      { propertyClassName: "TestSchema.B", propertyName: "Other", pathFromTarget: [aToB], cardinalityHint: "many" },
    ]);

    expect(hints.get(serializeRelationshipPath({ path: [aToB] }))).to.equal("many");
  });
});

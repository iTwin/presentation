/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { classifyPathCardinality, createPathCardinalityClassifier } from "../content/PathCardinality.js";
import { createRelationshipClass, createSchemaAccess } from "./MetadataStubs.js";

import type { EC, ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";

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

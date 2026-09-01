/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, beforeEach, describe, expect, it } from "vitest";
import {
  createRelationshipPathJoinClause,
  createRelationshipPathJoinInfo,
} from "../../shared/ecsql-snippets/ECSqlJoinSnippets.js";
import { trimWhitespace } from "../../shared/Utils.js";
import { createECSchemaProviderStub } from "../MetadataProviderStub.js";

import type { ECSqlBinding } from "../../shared/ECSqlCore.js";
import type { EC } from "../../shared/Metadata.js";

describe("createRelationshipPathJoinClause", () => {
  let schemaProvider: ReturnType<typeof createECSchemaProviderStub>;
  const schemaName = "x";

  beforeEach(() => {
    schemaProvider = createECSchemaProviderStub();
  });

  it("returns empty string if given empty relationship path", async () => {
    const result = await createRelationshipPathJoinClause({ schemaProvider, path: [] });
    expect(result.joins).toBe("");
    expect(result.bindings).toBeUndefined();
  });

  describe("using navigation properties", () => {
    it("creates a forward join on forward navigation property with forward relationship", async () => {
      const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
        navigationPropertyName: "PhysicalMaterial",
        source: "PhysicalElement",
        target: "PhysicalMaterial",
        relationship: { name: "PhysicalElementIsOfPhysicalMaterial", direction: "Forward" },
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(
          `INNER JOIN [${schemaName}].[PhysicalMaterial] [t] ON [t].[ECInstanceId] = [s].[PhysicalMaterial].[Id]`,
        ),
      );
    });

    it("creates a forward join on forward navigation property with backward relationship", async () => {
      const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
        navigationPropertyName: "ModeledElement",
        source: "Model",
        target: "Element",
        relationship: { name: "ModelModelsElement", direction: "Backward" },
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`INNER JOIN [${schemaName}].[Element] [t] ON [t].[ECInstanceId] = [s].[ModeledElement].[Id]`),
      );
    });

    it("creates a forward join on backward navigation property with forward relationship", async () => {
      const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
        navigationPropertyName: "Model",
        source: "Model",
        target: "Element",
        relationship: { name: "ModelContainsElements", direction: "Forward" },
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`INNER JOIN [${schemaName}].[Element] [t] ON [t].[Model].[Id] = [s].[ECInstanceId]`),
      );
    });

    it("creates a forward join on backward navigation property with backward relationship", async () => {
      const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
        navigationPropertyName: "Scope",
        source: "Element",
        target: "ExternalSourceAspect",
        relationship: { name: "ElementScopesExternalSourceIdentifier", direction: "Backward" },
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(
          `INNER JOIN [${schemaName}].[ExternalSourceAspect] [t] ON [t].[Scope].[Id] = [s].[ECInstanceId]`,
        ),
      );
    });

    it("creates a reversed join on forward navigation property with forward relationship", async () => {
      const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
        navigationPropertyName: "PhysicalMaterial",
        source: "PhysicalElement",
        target: "PhysicalMaterial",
        relationship: { name: "PhysicalElementIsOfPhysicalMaterial", direction: "Forward" },
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: targetClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            relationshipReverse: true,
            targetClassName: sourceClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(
          `INNER JOIN [${schemaName}].[PhysicalElement] [t] ON [t].[PhysicalMaterial].[Id] = [s].[ECInstanceId]`,
        ),
      );
    });

    it("creates a reversed join on forward navigation property with backward relationship", async () => {
      const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
        navigationPropertyName: "ModeledElement",
        source: "Model",
        target: "Element",
        relationship: { name: "ModelModelsElement", direction: "Backward" },
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: targetClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            relationshipReverse: true,
            targetClassName: sourceClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`INNER JOIN [${schemaName}].[Model] [t] ON [t].[ModeledElement].[Id] = [s].[ECInstanceId]`),
      );
    });

    it("creates a reversed join on backward navigation property with forward relationship", async () => {
      const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
        navigationPropertyName: "Model",
        source: "Model",
        target: "Element",
        relationship: { name: "ModelContainsElements", direction: "Forward" },
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: targetClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            relationshipReverse: true,
            targetClassName: sourceClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`INNER JOIN [${schemaName}].[Model] [t] ON [t].[ECInstanceId] = [s].[Model].[Id]`),
      );
    });

    it("creates a reversed join on backward navigation property with backward relationship", async () => {
      const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
        navigationPropertyName: "Scope",
        source: "Element",
        target: "ExternalSourceAspect",
        relationship: { name: "ElementScopesExternalSourceIdentifier", direction: "Backward" },
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: targetClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            relationshipReverse: true,
            targetClassName: sourceClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`INNER JOIN [${schemaName}].[Element] [t] ON [t].[ECInstanceId] = [s].[Scope].[Id]`),
      );
    });
  });

  describe("using link table relationships", () => {
    it("creates a forward inner join", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${relationship.name}] [r] ON [r].[SourceECInstanceId] = [s].[ECInstanceId]
          INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId]
        `),
      );
    });

    it("creates a forward outer join", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
            joinType: "outer",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          LEFT OUTER JOIN (
            SELECT [r].*
            FROM [${schemaName}].[${relationship.name}] [r]
            INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId]
          ) [r] ON [r].[SourceECInstanceId] = [s].[ECInstanceId]
          LEFT OUTER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId]
        `),
      );
    });

    it("creates a reversed inner join", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: targetClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            relationshipReverse: true,
            targetClassName: sourceClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${relationship.name}] [r] ON [r].[TargetECInstanceId] = [s].[ECInstanceId]
          INNER JOIN [${schemaName}].[${sourceClass.name}] [t] ON [t].[ECInstanceId] = [r].[SourceECInstanceId]
        `),
      );
    });
  });

  describe("multi-step joins", () => {
    it("creates 2 navigation property joins", async () => {
      const step1 = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
        navigationPropertyName: "nav-prop-1",
        source: "a",
        relationship: "r1",
        target: "b",
      });
      const step2 = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
        navigationPropertyName: "nav-prop-2",
        source: step1.targetClass,
        relationship: "r2",
        target: "c",
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: step1.sourceClass.fullName,
            sourceAlias: "a",
            relationshipName: step1.relationship.fullName,
            relationshipAlias: "r1",
            targetClassName: step1.targetClass.fullName,
            targetAlias: "b",
          },
          {
            sourceClassName: step2.sourceClass.fullName,
            sourceAlias: "b",
            relationshipName: step2.relationship.fullName,
            relationshipAlias: "r2",
            targetClassName: step2.targetClass.fullName,
            targetAlias: "c",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${step1.targetClass.name}] [b] ON [b].[ECInstanceId] = [a].[${step1.navigationProperty.name}].[Id]
          INNER JOIN [${schemaName}].[${step2.targetClass.name}] [c] ON [c].[${step2.navigationProperty.name}].[Id] = [b].[ECInstanceId]
        `),
      );
    });

    it("creates 2 link table relationship joins", async () => {
      const step1 = setupLinkTableRelationshipClasses({ source: "a", relationship: "r1", target: "b" });
      const step2 = setupLinkTableRelationshipClasses({ source: step1.targetClass, relationship: "r2", target: "c" });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: step1.sourceClass.fullName,
            sourceAlias: "a",
            relationshipName: step1.relationship.fullName,
            relationshipAlias: "r1",
            targetClassName: step1.targetClass.fullName,
            targetAlias: "b",
          },
          {
            sourceClassName: step2.sourceClass.fullName,
            sourceAlias: "b",
            relationshipName: step2.relationship.fullName,
            relationshipAlias: "r2",
            targetClassName: step2.targetClass.fullName,
            targetAlias: "c",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${step1.relationship.name}] [r1] ON [r1].[SourceECInstanceId] = [a].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step1.targetClass.name}] [b] ON [b].[ECInstanceId] = [r1].[TargetECInstanceId]
          INNER JOIN [${schemaName}].[${step2.relationship.name}] [r2] ON [r2].[SourceECInstanceId] = [b].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step2.targetClass.name}] [c] ON [c].[ECInstanceId] = [r2].[TargetECInstanceId]
        `),
      );
    });

    it("creates link table join after navigation property join", async () => {
      const step1 = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
        navigationPropertyName: "nav-prop-1",
        source: "a",
        relationship: "r1",
        target: "b",
      });
      const step2 = setupLinkTableRelationshipClasses({ source: step1.targetClass, relationship: "r2", target: "c" });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: step1.sourceClass.fullName,
            sourceAlias: "a",
            relationshipName: step1.relationship.fullName,
            relationshipAlias: "r1",
            targetClassName: step1.targetClass.fullName,
            targetAlias: "b",
          },
          {
            sourceClassName: step2.sourceClass.fullName,
            sourceAlias: "b",
            relationshipName: step2.relationship.fullName,
            relationshipAlias: "r2",
            targetClassName: step2.targetClass.fullName,
            targetAlias: "c",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${step1.targetClass.name}] [b] ON [b].[ECInstanceId] = [a].[${step1.navigationProperty.name}].[Id]
          INNER JOIN [${schemaName}].[${step2.relationship.name}] [r2] ON [r2].[SourceECInstanceId] = [b].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step2.targetClass.name}] [c] ON [c].[ECInstanceId] = [r2].[TargetECInstanceId]
        `),
      );
    });

    it("creates navigation property join after link table join", async () => {
      const step1 = setupLinkTableRelationshipClasses({ source: "a", relationship: "r1", target: "b" });
      const step2 = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
        navigationPropertyName: "nav-prop-2",
        source: step1.targetClass,
        relationship: "r2",
        target: "c",
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: step1.sourceClass.fullName,
            sourceAlias: "a",
            relationshipName: step1.relationship.fullName,
            relationshipAlias: "r1",
            targetClassName: step1.targetClass.fullName,
            targetAlias: "b",
          },
          {
            sourceClassName: step2.sourceClass.fullName,
            sourceAlias: "b",
            relationshipName: step2.relationship.fullName,
            relationshipAlias: "r2",
            targetClassName: step2.targetClass.fullName,
            targetAlias: "c",
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${step1.relationship.name}] [r1] ON [r1].[SourceECInstanceId] = [a].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step1.targetClass.name}] [b] ON [b].[ECInstanceId] = [r1].[TargetECInstanceId]
          INNER JOIN [${schemaName}].[${step2.targetClass.name}] [c] ON [c].[${step2.navigationProperty.name}].[Id] = [b].[ECInstanceId]
        `),
      );
    });
  });

  describe("with instanceFilter", () => {
    it("appends instance filter expression to navigation property join ON clause", async () => {
      const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
        navigationPropertyName: "PhysicalMaterial",
        source: "PhysicalElement",
        target: "PhysicalMaterial",
        relationship: { name: "PhysicalElementIsOfPhysicalMaterial", direction: "Forward" },
      });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
            instanceFilter: { expression: "this.Area > 0" },
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(
          `INNER JOIN [${schemaName}].[PhysicalMaterial] [t] ON [t].[ECInstanceId] = [s].[PhysicalMaterial].[Id] AND ([t].Area > 0)`,
        ),
      );
      expect(result.bindings).toBeUndefined();
    });

    it("appends instance filter expression to link table target INNER JOIN ON clause", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
            instanceFilter: { expression: "this.Name = :name AND rel.Priority > 0" },
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${relationship.name}] [r] ON [r].[SourceECInstanceId] = [s].[ECInstanceId]
          INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId] AND ([t].Name = :name AND [r].Priority > 0)
        `),
      );
      expect(result.bindings).toBeUndefined();
    });

    it("appends instance filter expression to link table target OUTER JOIN ON clause", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
            joinType: "outer",
            instanceFilter: { expression: "this.Area > 0" },
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          LEFT OUTER JOIN (
            SELECT [r].*
            FROM [${schemaName}].[${relationship.name}] [r]
            INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId] AND ([t].Area > 0)
          ) [r] ON [r].[SourceECInstanceId] = [s].[ECInstanceId]
          LEFT OUTER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId] AND ([t].Area > 0)
        `),
      );
      expect(result.bindings).toBeUndefined();
    });

    it("collects bindings from instanceFilter and substitutes custom alias placeholders", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
            instanceFilter: {
              expression: "target.Area > :minArea",
              targetAlias: "target",
              bindings: { minArea: { type: "double", value: 10.5 } },
            },
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${relationship.name}] [r] ON [r].[SourceECInstanceId] = [s].[ECInstanceId]
          INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId] AND ([t].Area > :minArea)
        `),
      );
      expect(result.bindings).toEqual({ minArea: { type: "double", value: 10.5 } });
    });

    it("substitutes bracket-quoted alias placeholders", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
            instanceFilter: { expression: "[this].Name = :name AND [rel].Priority > 0" },
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${relationship.name}] [r] ON [r].[SourceECInstanceId] = [s].[ECInstanceId]
          INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId] AND ([t].Name = :name AND [r].Priority > 0)
        `),
      );
      expect(result.bindings).toBeUndefined();
    });

    it("applies instanceFilter on each step of a multi-step path and merges bindings", async () => {
      const step1 = setupLinkTableRelationshipClasses({ source: "a", relationship: "r1", target: "b" });
      const step2 = setupLinkTableRelationshipClasses({ source: step1.targetClass, relationship: "r2", target: "c" });
      const result = await createRelationshipPathJoinClause({
        schemaProvider,
        path: [
          {
            sourceClassName: step1.sourceClass.fullName,
            sourceAlias: "a",
            relationshipName: step1.relationship.fullName,
            relationshipAlias: "r1",
            targetClassName: step1.targetClass.fullName,
            targetAlias: "b",
            instanceFilter: {
              expression: "this.Active = :isActive",
              bindings: { isActive: { type: "boolean", value: true } },
            },
          },
          {
            sourceClassName: step2.sourceClass.fullName,
            sourceAlias: "b",
            relationshipName: step2.relationship.fullName,
            relationshipAlias: "r2",
            targetClassName: step2.targetClass.fullName,
            targetAlias: "c",
            instanceFilter: {
              expression: "rel.Weight > :minWeight",
              bindings: { minWeight: { type: "double", value: 5.0 } },
            },
          },
        ],
      });
      expect(trimWhitespace(result.joins)).toBe(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${step1.relationship.name}] [r1] ON [r1].[SourceECInstanceId] = [a].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step1.targetClass.name}] [b] ON [b].[ECInstanceId] = [r1].[TargetECInstanceId] AND ([b].Active = :isActive)
          INNER JOIN [${schemaName}].[${step2.relationship.name}] [r2] ON [r2].[SourceECInstanceId] = [b].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step2.targetClass.name}] [c] ON [c].[ECInstanceId] = [r2].[TargetECInstanceId] AND ([r2].Weight > :minWeight)
        `),
      );
      expect(result.bindings).toEqual({
        isActive: { type: "boolean", value: true },
        minWeight: { type: "double", value: 5.0 },
      });
    });

    it("throws when two steps use the same binding key", async () => {
      const step1 = setupLinkTableRelationshipClasses({ source: "a", relationship: "r1", target: "b" });
      const step2 = setupLinkTableRelationshipClasses({ source: step1.targetClass, relationship: "r2", target: "c" });
      await expect(
        createRelationshipPathJoinClause({
          schemaProvider,
          path: [
            {
              sourceClassName: step1.sourceClass.fullName,
              sourceAlias: "a",
              relationshipName: step1.relationship.fullName,
              relationshipAlias: "r1",
              targetClassName: step1.targetClass.fullName,
              targetAlias: "b",
              instanceFilter: {
                expression: "this.Value > :threshold",
                bindings: { threshold: { type: "double", value: 1.0 } },
              },
            },
            {
              sourceClassName: step2.sourceClass.fullName,
              sourceAlias: "b",
              relationshipName: step2.relationship.fullName,
              relationshipAlias: "r2",
              targetClassName: step2.targetClass.fullName,
              targetAlias: "c",
              instanceFilter: {
                expression: "this.Value < :threshold",
                bindings: { threshold: { type: "double", value: 9.0 } },
              },
            },
          ],
        }),
      ).rejects.toThrow(`Binding key "threshold" is used in multiple steps`);
    });
  });

  describe("createRelationshipPathJoinInfo", () => {
    it("returns empty joins array for empty path", async () => {
      const result = await createRelationshipPathJoinInfo({ schemaProvider, path: [] });
      expect(result.steps).toEqual([]);
      expect(result.bindings).toBeUndefined();
    });

    it("navigation property step produces one class entry", async () => {
      const { sourceClass, targetClass, relationship, navigationProperty } =
        await setupNavigationPropertyRelationshipClasses({
          navigationPropertyDirection: "Forward",
          navigationPropertyName: "PhysicalMaterial",
          source: "PhysicalElement",
          target: "PhysicalMaterial",
          relationship: { name: "PhysicalElementIsOfPhysicalMaterial", direction: "Forward" },
        });
      const result = await createRelationshipPathJoinInfo({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].relationshipClassIdSelector).toBe(`[s].[${navigationProperty.name}].[RelECClassId]`);
      expect(result.steps[0].sourceClassIdSelector).toBe("[s].[ECClassId]");
      expect(result.steps[0].targetClassIdSelector).toBe("[t].[ECClassId]");

      const joins = result.steps[0].joins;
      expect(joins).toHaveLength(1);
      expect(joins[0].joinType).toBe("inner");
      expect(joins[0].joinTarget).toEqual({ kind: "class", className: targetClass.fullName });
      expect(joins[0].joinAlias).toBe("t");
      expect(trimWhitespace(joins[0].joinCondition)).toBe(
        trimWhitespace(`[t].[ECInstanceId] = [s].[${navigationProperty.name}].[Id]`),
      );
      expect(result.bindings).toBeUndefined();
    });

    it("link-table inner step produces two class entries", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      const result = await createRelationshipPathJoinInfo({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
          },
        ],
      });
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].relationshipClassIdSelector).toBe("[r].[ECClassId]");
      expect(result.steps[0].sourceClassIdSelector).toBe("[s].[ECClassId]");
      expect(result.steps[0].targetClassIdSelector).toBe("[t].[ECClassId]");
      const joins = result.steps[0].joins;
      expect(joins).toHaveLength(2);
      expect(joins[0]).toMatchObject({
        joinType: "inner",
        joinTarget: { kind: "class", className: relationship.fullName },
        joinAlias: "r",
      });
      expect(trimWhitespace(joins[0].joinCondition)).toBe("[r].[SourceECInstanceId] = [s].[ECInstanceId]");
      expect(joins[1]).toMatchObject({
        joinType: "inner",
        joinTarget: { kind: "class", className: targetClass.fullName },
        joinAlias: "t",
      });
      expect(trimWhitespace(joins[1].joinCondition)).toBe("[t].[ECInstanceId] = [r].[TargetECInstanceId]");

      expect(result.bindings).toBeUndefined();
    });

    it("link-table outer step produces a relationship-select entry then a class entry", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      const result = await createRelationshipPathJoinInfo({
        schemaProvider,
        path: [
          {
            sourceClassName: sourceClass.fullName,
            sourceAlias: "s",
            relationshipName: relationship.fullName,
            relationshipAlias: "r",
            targetClassName: targetClass.fullName,
            targetAlias: "t",
            joinType: "outer",
          },
        ],
      });

      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].relationshipClassIdSelector).toBe("[r].[ECClassId]");
      expect(result.steps[0].sourceClassIdSelector).toBe("[s].[ECClassId]");
      expect(result.steps[0].targetClassIdSelector).toBe("[t].[ECClassId]");
      const joins = result.steps[0].joins;
      expect(joins).toHaveLength(2);
      const first = joins[0];
      expect(first.joinType).toBe("outer");
      expect(first.joinAlias).toBe("r");
      assert(first.joinTarget.kind === "relationship-select");
      const joinTarget = first.joinTarget;
      expect(joinTarget.relationshipClassName).toBe(relationship.fullName);
      expect(joinTarget.relationshipAlias).toBe("r");
      expect(joinTarget.innerTarget).toEqual({ kind: "class", className: targetClass.fullName });
      expect(joinTarget.innerTargetAlias).toBe("t");
      expect(trimWhitespace(joinTarget.innerJoinCondition)).toBe("[t].[ECInstanceId] = [r].[TargetECInstanceId]");
      expect(trimWhitespace(first.joinCondition)).toBe("[r].[SourceECInstanceId] = [s].[ECInstanceId]");
      expect(joins[1]).toMatchObject({
        joinType: "outer",
        joinTarget: { kind: "class", className: targetClass.fullName },
        joinAlias: "t",
      });
      expect(trimWhitespace(joins[1].joinCondition)).toBe("[t].[ECInstanceId] = [r].[TargetECInstanceId]");
      expect(result.bindings).toBeUndefined();
    });

    it("collects bindings across steps", async () => {
      const step1 = setupLinkTableRelationshipClasses({ source: "a", relationship: "r1", target: "b" });
      const step2 = setupLinkTableRelationshipClasses({ source: step1.targetClass, relationship: "r2", target: "c" });
      const result = await createRelationshipPathJoinInfo({
        schemaProvider,
        path: [
          {
            sourceClassName: step1.sourceClass.fullName,
            sourceAlias: "a",
            relationshipName: step1.relationship.fullName,
            relationshipAlias: "r1",
            targetClassName: step1.targetClass.fullName,
            targetAlias: "b",
            instanceFilter: {
              expression: "this.Active = :isActive",
              bindings: { isActive: { type: "boolean", value: true } },
            },
          },
          {
            sourceClassName: step2.sourceClass.fullName,
            sourceAlias: "b",
            relationshipName: step2.relationship.fullName,
            relationshipAlias: "r2",
            targetClassName: step2.targetClass.fullName,
            targetAlias: "c",
            instanceFilter: {
              expression: "this.Weight > :minWeight",
              bindings: { minWeight: { type: "double", value: 5.0 } },
            },
          },
        ],
      });
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].relationshipClassIdSelector).toBe(`[r1].[ECClassId]`);
      expect(result.steps[0].sourceClassIdSelector).toBe(`[a].[ECClassId]`);
      expect(result.steps[0].targetClassIdSelector).toBe(`[b].[ECClassId]`);

      expect(result.steps[1].relationshipClassIdSelector).toBe(`[r2].[ECClassId]`);
      expect(result.steps[1].sourceClassIdSelector).toBe(`[b].[ECClassId]`);
      expect(result.steps[1].targetClassIdSelector).toBe(`[c].[ECClassId]`);

      expect(result.bindings).toEqual({
        isActive: { type: "boolean", value: true },
        minWeight: { type: "double", value: 5.0 },
      });
    });

    it("throws on duplicate binding key across steps", async () => {
      const step1 = setupLinkTableRelationshipClasses({ source: "a", relationship: "r1", target: "b" });
      const step2 = setupLinkTableRelationshipClasses({ source: step1.targetClass, relationship: "r2", target: "c" });
      await expect(
        createRelationshipPathJoinInfo({
          schemaProvider,
          path: [
            {
              sourceClassName: step1.sourceClass.fullName,
              sourceAlias: "a",
              relationshipName: step1.relationship.fullName,
              relationshipAlias: "r1",
              targetClassName: step1.targetClass.fullName,
              targetAlias: "b",
              instanceFilter: {
                expression: "this.Value > :threshold",
                bindings: { threshold: { type: "double", value: 1.0 } },
              },
            },
            {
              sourceClassName: step2.sourceClass.fullName,
              sourceAlias: "b",
              relationshipName: step2.relationship.fullName,
              relationshipAlias: "r2",
              targetClassName: step2.targetClass.fullName,
              targetAlias: "c",
              instanceFilter: {
                expression: "this.Value < :threshold",
                bindings: { threshold: { type: "double", value: 9.0 } },
              },
            },
          ],
        }),
      ).rejects.toThrow(`Binding key "threshold" is used in multiple steps`);
    });

    describe("parity with async createRelationshipPathJoinClause", () => {
      it("nav property path: sync render matches async", async () => {
        const { sourceClass, targetClass, relationship } = await setupNavigationPropertyRelationshipClasses({
          navigationPropertyDirection: "Forward",
          navigationPropertyName: "PhysicalMaterial",
          source: "PhysicalElement",
          target: "PhysicalMaterial",
          relationship: { name: "PhysicalElementIsOfPhysicalMaterial", direction: "Forward" },
        });
        const props = {
          schemaProvider,
          path: [
            {
              sourceClassName: sourceClass.fullName,
              sourceAlias: "s",
              relationshipName: relationship.fullName,
              relationshipAlias: "r",
              targetClassName: targetClass.fullName,
              targetAlias: "t",
            },
          ],
        };
        const fromProps = await createRelationshipPathJoinClause(props);
        const fromInfo = createRelationshipPathJoinClause(await createRelationshipPathJoinInfo(props));
        expect(trimWhitespace(fromInfo.joins)).toBe(trimWhitespace(fromProps.joins));
        expect(fromInfo.bindings).toEqual(fromProps.bindings);
      });

      it("link-table inner path: sync render matches async", async () => {
        const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
        const props = {
          schemaProvider,
          path: [
            {
              sourceClassName: sourceClass.fullName,
              sourceAlias: "s",
              relationshipName: relationship.fullName,
              relationshipAlias: "r",
              targetClassName: targetClass.fullName,
              targetAlias: "t",
            },
          ],
        };
        const fromProps = await createRelationshipPathJoinClause(props);
        const fromInfo = createRelationshipPathJoinClause(await createRelationshipPathJoinInfo(props));
        expect(trimWhitespace(fromInfo.joins)).toBe(trimWhitespace(fromProps.joins));
        expect(fromInfo.bindings).toEqual(fromProps.bindings);
      });

      it("link-table outer path: sync render matches async", async () => {
        const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
        const props = {
          schemaProvider,
          path: [
            {
              sourceClassName: sourceClass.fullName,
              sourceAlias: "s",
              relationshipName: relationship.fullName,
              relationshipAlias: "r",
              targetClassName: targetClass.fullName,
              targetAlias: "t",
              joinType: "outer" as const,
            },
          ],
        };
        const fromProps = await createRelationshipPathJoinClause(props);
        const fromInfo = createRelationshipPathJoinClause(await createRelationshipPathJoinInfo(props));
        expect(trimWhitespace(fromInfo.joins)).toBe(trimWhitespace(fromProps.joins));
        expect(fromInfo.bindings).toEqual(fromProps.bindings);
      });

      it("multi-step with instanceFilter: sync render matches async", async () => {
        const step1 = setupLinkTableRelationshipClasses({ source: "a", relationship: "r1", target: "b" });
        const step2 = setupLinkTableRelationshipClasses({ source: step1.targetClass, relationship: "r2", target: "c" });
        const props = {
          schemaProvider,
          path: [
            {
              sourceClassName: step1.sourceClass.fullName,
              sourceAlias: "a",
              relationshipName: step1.relationship.fullName,
              relationshipAlias: "r1",
              targetClassName: step1.targetClass.fullName,
              targetAlias: "b",
              instanceFilter: {
                expression: "this.Active = :isActive",
                bindings: { isActive: { type: "boolean" as const, value: true } } as Record<string, ECSqlBinding>,
              },
            },
            {
              sourceClassName: step2.sourceClass.fullName,
              sourceAlias: "b",
              relationshipName: step2.relationship.fullName,
              relationshipAlias: "r2",
              targetClassName: step2.targetClass.fullName,
              targetAlias: "c",
              instanceFilter: {
                expression: "this.Weight > :minWeight",
                bindings: { minWeight: { type: "double" as const, value: 5.0 } } as Record<string, ECSqlBinding>,
              },
            },
          ],
        };
        const fromProps = await createRelationshipPathJoinClause(props);
        const fromInfo = createRelationshipPathJoinClause(await createRelationshipPathJoinInfo(props));
        expect(trimWhitespace(fromInfo.joins)).toBe(trimWhitespace(fromProps.joins));
        expect(fromInfo.bindings).toEqual(fromProps.bindings);
      });
    });
  });

  async function setupNavigationPropertyRelationshipClasses(props: {
    navigationPropertyDirection: "Forward" | "Backward";
    navigationPropertyName?: string;
    source?: Partial<Omit<EC.Class, "is">> | string;
    relationship?: Partial<Omit<EC.RelationshipClass, "is">> | string;
    target?: Partial<Omit<EC.Class, "is">> | string;
  }) {
    const sourceClass = schemaProvider.stubEntityClass({
      schemaName,
      className: typeof props.source === "string" ? props.source : "source",
      ...(typeof props.source === "object" ? props.source : undefined),
    });
    const targetClass = schemaProvider.stubEntityClass({
      schemaName,
      className: typeof props.target === "string" ? props.target : "target",
      ...(typeof props.target === "object" ? props.target : undefined),
    });
    const relationship = schemaProvider.stubRelationshipClass({
      schemaName,
      className: typeof props.relationship === "string" ? props.relationship : "relationship",
      direction: "Forward",
      source: {
        polymorphic: false,
        multiplicity: { lowerLimit: 0, upperLimit: 1 },
        abstractConstraint: sourceClass,
        constraintClasses: [sourceClass],
      },
      target: {
        polymorphic: false,
        multiplicity: { lowerLimit: 0, upperLimit: INT32_MAX },
        abstractConstraint: targetClass,
        constraintClasses: [targetClass],
      },
      ...(typeof props.relationship === "object" ? props.relationship : undefined),
    });
    const navigationProperty = {
      name: props.navigationPropertyName ?? "navigation-property",
      isNavigation: () => true,
      direction: props.navigationPropertyDirection,
      relationshipClass: relationship,
    } as unknown as EC.NavigationProperty;
    schemaProvider.stubEntityClass({
      schemaName,
      className: typeof props.source === "string" ? props.source : "source",
      properties: props.navigationPropertyDirection === "Forward" ? [navigationProperty] : [],
      ...(typeof props.source === "object" ? props.source : undefined),
    });
    schemaProvider.stubEntityClass({
      schemaName,
      className: typeof props.target === "string" ? props.target : "target",
      properties: props.navigationPropertyDirection === "Backward" ? [navigationProperty] : [],
      ...(typeof props.target === "object" ? props.target : undefined),
    });
    return { sourceClass, targetClass, relationship, navigationProperty };
  }

  function setupLinkTableRelationshipClasses(props?: {
    source?: EC.Class | string;
    target?: EC.Class | string;
    relationship?: EC.RelationshipClass | string;
  }) {
    const sourceClass =
      typeof props?.source === "object"
        ? props.source
        : schemaProvider.stubEntityClass({ schemaName, className: props?.source ?? "source" });
    const targetClass =
      typeof props?.target === "object"
        ? props.target
        : schemaProvider.stubEntityClass({ schemaName, className: props?.target ?? "target" });
    const relationship =
      typeof props?.relationship === "object"
        ? props.relationship
        : schemaProvider.stubRelationshipClass({
            schemaName,
            className: props?.relationship ?? "relationship",
            direction: "Forward",
            source: {
              polymorphic: false,
              abstractConstraint: sourceClass,
              constraintClasses: [sourceClass],
              multiplicity: { lowerLimit: 0, upperLimit: INT32_MAX },
            },
            target: {
              polymorphic: false,
              abstractConstraint: targetClass,
              constraintClasses: [targetClass],
              multiplicity: { lowerLimit: 0, upperLimit: INT32_MAX },
            },
          });
    return { sourceClass, targetClass, relationship };
  }
});

// taken from `@itwin/ecschema-metadata`
const INT32_MAX = 2147483647;

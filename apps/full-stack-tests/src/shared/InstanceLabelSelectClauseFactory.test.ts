/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalType,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BisCodeSpec, Code, IModel } from "@itwin/core-common";
import { RulesetEmbedder } from "@itwin/presentation-backend";
import {
  createIModelInstanceLabelSelectClauseFactory,
  parseFullClassName,
  parseInstanceLabel,
} from "@itwin/presentation-shared";
import { createIModelAccess } from "../hierarchies/Utils.js";
import { buildTestIModel } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { Ruleset } from "@itwin/presentation-common";
import type { InstanceKey } from "@itwin/presentation-shared";

describe("iModel instance labels", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  it("falls back to default factory when `PresentationRules` schema is absent", async () => {
    const { imodelConnection } = await buildTestIModel();
    const imodelAccess = createIModelAccess(imodelConnection);
    const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess });
    // Must not throw; falls back to BIS default label factory when PresentationRules schema is missing
    await expect(factory.createSelectClause({ classAlias: "x" })).resolves.toBeTruthy();
  });

  it("applies `InstanceLabelOverride` `Property` spec from embedded ruleset", async () => {
    const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
      const { id: modelId } = insertPhysicalModelWithPartition({ imodel, codeValue: "model" });
      const { id: categoryId } = insertSpatialCategory({ imodel, codeValue: "category" });
      const target = insertPhysicalElement({ imodel, modelId, categoryId, userLabel: "ExpectedLabel" });
      const ruleset: Ruleset = {
        id: "label-override-test",
        rules: [
          {
            ruleType: "InstanceLabelOverride",
            class: parseFullClassName(target.className),
            values: [{ specType: "Property", propertyName: "UserLabel" }],
          },
        ],
      };
      await new RulesetEmbedder({ imodel }).insertRuleset(ruleset);
      return { target };
    });
    expect(await selectInstanceLabel({ imodel: imodelConnection, instanceKey: keys.target })).toBe("ExpectedLabel");
  });

  it("higher-priority override wins over lower-priority override", async () => {
    const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
      const model = insertPhysicalModelWithPartition({ imodel, codeValue: "model" });
      const category = insertSpatialCategory({ imodel, codeValue: "category" });
      const el = insertPhysicalElement({
        imodel,
        modelId: model.id,
        categoryId: category.id,
        userLabel: "HighWins",
        codeValue: "LowLoses",
      });
      // Low-priority rule listed first in source; high-priority should still win
      const ruleset: Ruleset = {
        id: "priority-test",
        rules: [
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "Generic", className: "PhysicalObject" },
            priority: 500,
            values: [{ specType: "Property", propertyName: "CodeValue" }],
          },
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "Generic", className: "PhysicalObject" },
            priority: 1000,
            values: [{ specType: "Property", propertyName: "UserLabel" }],
          },
        ],
      };
      await new RulesetEmbedder({ imodel }).insertRuleset(ruleset);
      return { target: el };
    });
    expect(await selectInstanceLabel({ imodel: imodelConnection, instanceKey: keys.target })).toBe("HighWins");
  });

  it("applies `Property` spec with `propertySource` - label from parent's property", async () => {
    const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
      const { id: modelId } = insertPhysicalModelWithPartition({ imodel, codeValue: "model" });
      const { id: categoryId } = insertSpatialCategory({ imodel, codeValue: "category" });
      const parent = insertPhysicalElement({ imodel, modelId, categoryId, userLabel: "ParentLabel" });
      const child = insertPhysicalElement({ imodel, modelId, categoryId, parentId: parent.id });
      const ruleset: Ruleset = {
        id: "property-source-test",
        rules: [
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "Generic", className: "PhysicalObject" },
            values: [
              {
                specType: "Property",
                propertyName: "UserLabel",
                propertySource: {
                  relationship: { schemaName: "BisCore", className: "PhysicalElementAssemblesElements" },
                  direction: "Backward",
                },
              },
            ],
          },
        ],
      };
      await new RulesetEmbedder({ imodel }).insertRuleset(ruleset);
      return { child };
    });
    expect(await selectInstanceLabel({ imodel: imodelConnection, instanceKey: keys.child })).toBe("ParentLabel");
  });

  it("applies `RelatedInstanceLabel` spec - label from related PhysicalType", async () => {
    const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
      const { id: modelId } = insertPhysicalModelWithPartition({ imodel, codeValue: "model" });
      const { id: categoryId } = insertSpatialCategory({ imodel, codeValue: "category" });
      const physicalType = insertPhysicalType({ imodel, userLabel: "MyTypeName" });
      const element = insertPhysicalElement({ imodel, modelId, categoryId, typeDefinitionId: physicalType.id });
      const ruleset: Ruleset = {
        id: "related-instance-label-test",
        rules: [
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "Generic", className: "PhysicalObject" },
            values: [
              {
                specType: "RelatedInstanceLabel",
                pathToRelatedInstance: {
                  relationship: { schemaName: "BisCore", className: "PhysicalElementIsOfType" },
                  direction: "Forward",
                },
              },
            ],
          },
        ],
      };
      await new RulesetEmbedder({ imodel }).insertRuleset(ruleset);
      return { element };
    });
    expect(await selectInstanceLabel({ imodel: imodelConnection, instanceKey: keys.element })).toBe("MyTypeName");
  });

  it("applies `RelatedInstanceLabel` spec with recursive override for the related class", async () => {
    const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
      const { id: modelId } = insertPhysicalModelWithPartition({ imodel, codeValue: "model" });
      const { id: categoryId } = insertSpatialCategory({ imodel, codeValue: "category" });
      const physicalType = insertPhysicalType({
        imodel,
        userLabel: "IgnoredUserLabel",
        code: new Code({
          spec: imodel.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).id,
          scope: IModel.dictionaryId,
          value: "TypeCodeValue",
        }),
      });
      const element = insertPhysicalElement({ imodel, modelId, categoryId, typeDefinitionId: physicalType.id });
      const ruleset: Ruleset = {
        id: "related-instance-label-override-test",
        rules: [
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "Generic", className: "PhysicalObject" },
            values: [
              {
                specType: "RelatedInstanceLabel",
                pathToRelatedInstance: {
                  relationship: { schemaName: "BisCore", className: "PhysicalElementIsOfType" },
                  direction: "Forward",
                },
              },
            ],
          },
          {
            ruleType: "InstanceLabelOverride",
            class: { schemaName: "Generic", className: "PhysicalType" },
            values: [{ specType: "Property", propertyName: "CodeValue" }],
          },
        ],
      };
      await new RulesetEmbedder({ imodel }).insertRuleset(ruleset);
      return { element };
    });
    expect(await selectInstanceLabel({ imodel: imodelConnection, instanceKey: keys.element })).toBe("TypeCodeValue");
  });

  async function selectInstanceLabel({
    imodel,
    instanceKey,
  }: {
    imodel: IModelConnection;
    instanceKey: InstanceKey;
  }): Promise<ReturnType<typeof parseInstanceLabel>> {
    const factory = createIModelInstanceLabelSelectClauseFactory({ imodelAccess: createIModelAccess(imodel) });
    const selectClause = await factory.createSelectClause({ classAlias: "x", className: instanceKey.className });
    for await (const row of imodel.createQueryReader(
      `SELECT ${selectClause} FROM [Generic].[PhysicalObject] AS x WHERE x.ECInstanceId = ${instanceKey.id}`,
    )) {
      return parseInstanceLabel(row[0]);
    }
    throw new Error("Instance not found");
  }
});

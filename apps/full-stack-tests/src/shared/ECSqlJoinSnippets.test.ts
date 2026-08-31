/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertGroupInformationElement,
  insertGroupInformationModelWithPartition,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalType,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ECSql, ECSqlQueryRow } from "@itwin/presentation-shared";
import { createIModelAccess } from "../hierarchies/Utils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { buildTestIModel } from "../TestIModelSetup.js";

describe("createRelationshipPathJoinClause", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  it("creates executable outer join through a navigation property relationship", async () => {
    const { imodel, type, elementWithType, elementWithoutType } = await buildTestIModel(async (builder) => {
      const model = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
      const category = insertSpatialCategory({ builder, codeValue: "test category" });
      const insertedType = insertPhysicalType({ builder });
      return {
        type: insertedType,
        elementWithType: insertPhysicalElement({
          builder,
          modelId: model.id,
          categoryId: category.id,
          typeDefinitionId: insertedType.id,
        }),
        elementWithoutType: insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id }),
      };
    });
    const imodelAccess = createIModelAccess(imodel);

    const joinClause = await ECSql.createRelationshipPathJoinClause({
      schemaProvider: imodelAccess,
      path: [
        {
          sourceClassName: "BisCore.PhysicalElement",
          sourceAlias: "s",
          relationshipName: "BisCore.GeometricElement3dHasTypeDefinition",
          relationshipAlias: "r",
          targetClassName: "BisCore.PhysicalType",
          targetAlias: "t",
          joinType: "outer",
        },
      ],
    });
    const ecsql = `
      SELECT [s].[ECInstanceId] [sourceId], [t].[ECInstanceId] [targetId]
      FROM [BisCore].[PhysicalElement] [s]
      ${joinClause}
    `;

    const rows = new Array<ECSqlQueryRow>();
    for await (const row of imodelAccess.createQueryReader({ ecsql }, { rowFormat: "ECSqlPropertyNames" })) {
      rows.push(row);
    }

    expect(rows.map((row) => ({ sourceId: row.sourceId, targetId: row.targetId ?? undefined }))).toEqual(
      expect.arrayContaining([
        { sourceId: elementWithType.id, targetId: type.id },
        { sourceId: elementWithoutType.id, targetId: undefined },
      ]),
    );
  });

  it("creates executable outer join through a link table relationship", async () => {
    const { imodel, groupWithMember, member, emptyGroup } = await buildTestIModel(async (builder) => {
      const groupModel = insertGroupInformationModelWithPartition({ builder, codeValue: "test group model" });
      const physicalModel = insertPhysicalModelWithPartition({ builder, codeValue: "test physical model" });
      const category = insertSpatialCategory({ builder, codeValue: "test category" });
      const insertedGroup = insertGroupInformationElement({ builder, modelId: groupModel.id });
      const insertedMember = insertPhysicalElement({ builder, modelId: physicalModel.id, categoryId: category.id });
      builder.insertRelationship({
        classFullName: "BisCore.ElementGroupsMembers",
        sourceId: insertedGroup.id,
        targetId: insertedMember.id,
      });
      return {
        groupWithMember: insertedGroup,
        member: insertedMember,
        emptyGroup: insertGroupInformationElement({ builder, modelId: groupModel.id }),
      };
    });
    const imodelAccess = createIModelAccess(imodel);

    const joinClause = await ECSql.createRelationshipPathJoinClause({
      schemaProvider: imodelAccess,
      path: [
        {
          sourceClassName: "BisCore.GroupInformationElement",
          sourceAlias: "s",
          relationshipName: "BisCore.ElementGroupsMembers",
          relationshipAlias: "r",
          targetClassName: "BisCore.PhysicalElement",
          targetAlias: "t",
          joinType: "outer",
        },
      ],
    });
    const ecsql = `
      SELECT [s].[ECInstanceId] [sourceId], [t].[ECInstanceId] [targetId]
      FROM [BisCore].[GroupInformationElement] [s]
      ${joinClause}
    `;

    const rows = new Array<ECSqlQueryRow>();
    for await (const row of imodelAccess.createQueryReader({ ecsql }, { rowFormat: "ECSqlPropertyNames" })) {
      rows.push(row);
    }

    expect(rows.map((row) => ({ sourceId: row.sourceId, targetId: row.targetId ?? undefined }))).toEqual(
      expect.arrayContaining([
        { sourceId: groupWithMember.id, targetId: member.id },
        { sourceId: emptyGroup.id, targetId: undefined },
      ]),
    );
  });
});

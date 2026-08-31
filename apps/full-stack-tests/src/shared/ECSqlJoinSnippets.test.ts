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
import { withEditTxn } from "@itwin/core-backend";
import { ECSql, ECSqlQueryRow } from "@itwin/presentation-shared";
import { createIModelAccess } from "../hierarchies/Utils.js";
import { buildTestIModel } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";

describe("createRelationshipPathJoinClause", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  it("creates executable outer join through a navigation property relationship", async () => {
    const { imodelConnection, type, elementWithType, elementWithoutType } = await buildTestIModel(async (imodel) => {
      return withEditTxn(imodel, (txn) => {
        const model = insertPhysicalModelWithPartition({ txn, codeValue: "test model" });
        const category = insertSpatialCategory({ txn, codeValue: "test category" });
        const insertedType = insertPhysicalType({ txn });
        return {
          type: insertedType,
          elementWithType: insertPhysicalElement({
            txn,
            modelId: model.id,
            categoryId: category.id,
            typeDefinitionId: insertedType.id,
          }),
          elementWithoutType: insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id }),
        };
      });
    });
    const imodelAccess = createIModelAccess(imodelConnection);

    const { joins } = await ECSql.createRelationshipPathJoinClause({
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
      ${joins}
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
    const { imodelConnection, groupWithMember, member, emptyGroup } = await buildTestIModel(async (imodel) => {
      return withEditTxn(imodel, (txn) => {
        const groupModel = insertGroupInformationModelWithPartition({ txn, codeValue: "test group model" });
        const physicalModel = insertPhysicalModelWithPartition({ txn, codeValue: "test physical model" });
        const category = insertSpatialCategory({ txn, codeValue: "test category" });
        const insertedGroup = insertGroupInformationElement({ txn, modelId: groupModel.id });
        const insertedMember = insertPhysicalElement({ txn, modelId: physicalModel.id, categoryId: category.id });
        txn.insertRelationship({
          classFullName: "BisCore.ElementGroupsMembers",
          sourceId: insertedGroup.id,
          targetId: insertedMember.id,
        });
        return {
          groupWithMember: insertedGroup,
          member: insertedMember,
          emptyGroup: insertGroupInformationElement({ txn, modelId: groupModel.id }),
        };
      });
    });
    const imodelAccess = createIModelAccess(imodelConnection);

    const { joins } = await ECSql.createRelationshipPathJoinClause({
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
      ${joins}
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

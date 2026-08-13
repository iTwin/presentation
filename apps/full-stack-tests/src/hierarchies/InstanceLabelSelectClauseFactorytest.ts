/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalModelWithPartition } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createBisInstanceLabelSelectClauseFactory,
  createDefaultInstanceLabelSelectClauseFactory,
} from "@itwin/presentation-shared";
import { initialize, terminate } from "../IntegrationTests.js";
import { buildTestIModel } from "../TestIModelSetup.js";
import { createIModelAccess } from "./Utils.js";

describe("NodesQueryClauseFactory", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  it("creates correct labels for BisCore.Model subclasses when outer query uses alias 'e'", async () => {
    const { imodel } = await buildTestIModel(async (builder) => {
      insertPhysicalModelWithPartition({ builder, codeValue: "Test model" });
    });
    const imodelAccess = createIModelAccess(imodel);

    const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });

    const ecsql = `
      SELECT ${await labelsQueryFactory.createSelectClause({
        classAlias: "e",
        className: "BisCore.GeometricModel3d",
      })} AS label
      FROM BisCore.GeometricModel3d e
    `;
    const reader = imodel.createQueryReader(ecsql);
    const rows = await reader.toArray();
    expect(rows[0].label).to.eq("Test model");
  });

  it("creates correct labels when outer query uses alias 'c' (same as default label factory's internal alias)", async () => {
    const { imodel } = await buildTestIModel(async (builder) => {
      insertPhysicalModelWithPartition({ builder, codeValue: "Test model" });
    });

    const labelsQueryFactory = createDefaultInstanceLabelSelectClauseFactory();

    const ecsql = `
      SELECT ${await labelsQueryFactory.createSelectClause({
        classAlias: "c",
        className: "BisCore.GeometricModel3d",
      })} AS label
      FROM BisCore.GeometricModel3d c
    `;
    const reader = imodel.createQueryReader(ecsql);
    const rows = await reader.toArray();
    expect(rows[0].label).to.eq("Physical Model [0-H]");
  });
});

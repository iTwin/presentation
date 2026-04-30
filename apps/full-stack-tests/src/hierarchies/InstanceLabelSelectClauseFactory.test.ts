/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalModelWithPartition } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { QueryRowFormat } from "@itwin/core-common";
import {
  createBisInstanceLabelSelectClauseFactory,
  createDefaultInstanceLabelSelectClauseFactory,
  createDefaultValueFormatter,
  formatConcatenatedValue,
} from "@itwin/presentation-shared";
import { buildTestIModel } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { createIModelAccess } from "./Utils.js";

describe("NodesQueryClauseFactory", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  it("creates correct labels for BisCore.Model subclasses when outer query uses alias 'e'", async () => {
    const { imodelConnection } = await buildTestIModel(async (imodel) => {
      withEditTxn(imodel, (txn) => {
        insertPhysicalModelWithPartition({ txn, codeValue: "Test model" });
      });
    });
    const imodelAccess = createIModelAccess(imodelConnection);

    const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });

    const ecsql = `
      SELECT ${await labelsQueryFactory.createSelectClause({
        classAlias: "e",
        className: "BisCore.GeometricModel3d",
      })} AS label
      FROM BisCore.GeometricModel3d e
    `;
    const reader = imodelConnection.createQueryReader(ecsql, undefined, {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    });
    const rows = await reader.toArray();
    expect(rows[0].label).to.eq("Test model");
  });

  it("creates correct labels when outer query uses alias 'c' (same as default label factory's internal alias)", async () => {
    const { imodelConnection } = await buildTestIModel(async (imodel) => {
      withEditTxn(imodel, (txn) => {
        insertPhysicalModelWithPartition({ txn, codeValue: "Test model" });
      });
    });

    const labelsQueryFactory = createDefaultInstanceLabelSelectClauseFactory();

    const ecsql = `
      SELECT ${await labelsQueryFactory.createSelectClause({
        classAlias: "c",
        className: "BisCore.GeometricModel3d",
      })} AS label
      FROM BisCore.GeometricModel3d c
    `;
    const reader = imodelConnection.createQueryReader(ecsql, undefined, {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    });
    const rows = await reader.toArray();
    const labelParts = JSON.parse(rows[0].label);
    const label = await formatConcatenatedValue({ value: labelParts, valueFormatter: createDefaultValueFormatter() });
    expect(label).to.eq("Physical Model [0-H]");
  });
});

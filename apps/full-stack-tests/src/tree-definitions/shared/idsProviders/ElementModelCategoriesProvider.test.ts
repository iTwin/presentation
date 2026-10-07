/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { firstValueFrom } from "rxjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { CLASS_NAMES, ElementModelCategoriesProvider } from "@itwin/presentation-tree-definitions/internal";
import { initialize, terminate } from "../../../IntegrationTests.js";
import { createIModelAccess } from "../../Common.js";
import { buildIModel, insertGeometricModelWithPartition } from "../../IModelUtils.js";

describe("ElementModelCategoriesProvider", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  it("does not return private or template models", async () => {
    await using buildIModelResult = await buildIModel(async (imodel) =>
      withEditTxn(imodel, (txn) => {
        const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
        const category = insertSpatialCategory({ txn, codeValue: "category" });
        insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id });
        for (const flag of ["isPrivate", "isTemplate"] as const) {
          const hiddenModel = insertGeometricModelWithPartition({ txn, codeValue: flag, [flag]: true });
          insertPhysicalElement({ txn, modelId: hiddenModel.id, categoryId: category.id });
          const hiddenCategory = insertSpatialCategory({ txn, codeValue: flag });
          insertPhysicalElement({ txn, modelId: hiddenModel.id, categoryId: hiddenCategory.id });
        }
        return { model, category };
      }),
    );
    const { imodelConnection, ...keys } = buildIModelResult;
    const provider = new ElementModelCategoriesProvider({
      queryExecutor: createIModelAccess(imodelConnection),
      componentId: "test",
      elementClassName: CLASS_NAMES.GeometricElement3d,
    });

    const result = await firstValueFrom(provider.getData());

    expect([...result.modelsCategoriesInfo.keys()]).toEqual([keys.model.id]);
    expect(result.categoryModelsInfo).toEqual(
      new Map([
        [
          keys.category.id,
          [{ id: keys.model.id, categoryIsOfTopMostElement: true, hasNonExcludedTopMostElements: true }],
        ],
      ]),
    );
    expect(result.allCategories).toEqual(new Set([keys.category.id]));
  });
});

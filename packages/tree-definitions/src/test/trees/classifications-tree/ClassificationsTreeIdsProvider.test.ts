/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EMPTY, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { createClassificationsTreeIdsProvider } from "../../../tree-definitions/trees/classifications-tree/ClassificationsTreeIdsProvider.js";
import { createClassificationsTree } from "../../../tree-definitions/trees/classifications-tree/CreateClassificationsTree.js";

import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider } from "@itwin/presentation-shared";
import type { ClassificationsTreeHierarchyConfiguration } from "../../../tree-definitions/trees/classifications-tree/ClassificationsTreeDefinition.js";
import type { ClassificationsTreeIdsProvider } from "../../../tree-definitions/trees/classifications-tree/ClassificationsTreeIdsProvider.js";

function createIModelAccess() {
  return {
    createQueryReader: vi.fn<LimitingECSqlQueryExecutor["createQueryReader"]>(async function* () {}),
    getSchema: vi.fn<ECSchemaProvider["getSchema"]>().mockResolvedValue(undefined),
    getHiddenClassesTree: vi.fn<ECSchemaProvider["getHiddenClassesTree"]>().mockResolvedValue([]),
    classDerivesFrom: vi
      .fn<ECSchemaProvider["classDerivesFrom"]>()
      .mockImplementation((derived, base) => derived === base),
  };
}

describe("classifications provider configuration", () => {
  it.each<{
    name: string;
    providerConfig?: Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode">;
    treeConfig: ClassificationsTreeHierarchyConfiguration;
    shouldThrow: boolean;
  }>([
    {
      name: "accepts matching classification systems",
      treeConfig: { rootClassificationSystemCode: "SystemA" },
      shouldThrow: false,
    },
    {
      name: "rejects different classification systems",
      treeConfig: { rootClassificationSystemCode: "SystemB" },
      shouldThrow: true,
    },
    {
      name: "accepts tree element exclusions",
      treeConfig: {
        rootClassificationSystemCode: "SystemA",
        elements: { excludedClasses: ["BisCore.PhysicalElement"] },
      },
      shouldThrow: false,
    },
    {
      name: "accepts empty tree element exclusions",
      treeConfig: { rootClassificationSystemCode: "SystemA", elements: { excludedClasses: [] } },
      shouldThrow: false,
    },
    {
      name: "accepts duplicated tree element exclusions",
      treeConfig: {
        rootClassificationSystemCode: "SystemA",
        elements: { excludedClasses: ["Generic.PhysicalObject", "BisCore.PhysicalElement", "Generic.PhysicalObject"] },
      },
      shouldThrow: false,
    },
  ])("$name", ({ providerConfig = { rootClassificationSystemCode: "SystemA" }, treeConfig, shouldThrow }) => {
    const imodelAccess = createIModelAccess();
    const provider = createClassificationsTreeIdsProvider({ imodelAccess, hierarchyConfig: providerConfig });
    const createTree = () =>
      createClassificationsTree({ imodelAccess, hierarchyConfig: treeConfig, idsProvider: provider });
    if (shouldThrow) {
      expect(createTree).toThrow("Classifications tree ID provider configuration does not match");
    } else {
      expect(createTree).not.toThrow();
    }
  });
});

describe("createClassificationsTree", () => {
  it("uses the supplied ID provider for hierarchy and search", async () => {
    const imodelAccess = createIModelAccess();
    const hierarchyConfig = { rootClassificationSystemCode: "SystemA" };
    const getDirectChildClassifications = vi.fn(() => of([]));
    const getAllClassifications = vi.fn(() => of([]));
    const idsProvider: ClassificationsTreeIdsProvider = {
      state: "loaded",
      config: hierarchyConfig,
      getDirectChildClassifications,
      getAllClassifications,
      getClassificationsPath: () => EMPTY,
    };
    const tree = createClassificationsTree({ imodelAccess, hierarchyConfig, idsProvider });
    const tableId = "0x10";

    expect(
      await tree.hierarchyDefinition.defineHierarchyLevel({
        parentNode: {
          key: {
            type: "instances",
            instanceKeys: [{ className: "ClassificationSystems.ClassificationTable", id: tableId }],
          },
          parentKeys: [],
          label: "table",
        },
        createSelectClause: async () => "",
        createFilterClauses: async () => ({ from: "", where: "", joins: "" }),
      }),
    ).toEqual([]);
    expect(getDirectChildClassifications).toHaveBeenCalledWith([tableId]);
    expect(await tree.createSearchTree({ label: "classification" })).toEqual([]);
    expect(getAllClassifications).toHaveBeenCalled();
  });
});

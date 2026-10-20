/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { createSharedIdsProvider } from "../../../tree-definitions/shared/idsProviders/SharedIdsProvider.js";
import { createCategoriesTreeIdsProvider } from "../../../tree-definitions/trees/categories-tree/CategoriesTreeIdsProvider.js";
import { createCategoriesTree } from "../../../tree-definitions/trees/categories-tree/CreateCategoriesTree.js";

import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";

function createAccess() {
  return {
    imodelKey: "test-imodel",
    createQueryReader: vi.fn<LimitingECSqlQueryExecutor["createQueryReader"]>(),
    getSchema: vi.fn<ECSchemaProvider["getSchema"]>().mockResolvedValue(undefined),
    getHiddenClassesTree: vi.fn<ECSchemaProvider["getHiddenClassesTree"]>().mockResolvedValue([]),
    classDerivesFrom: vi
      .fn<ECSchemaProvider["classDerivesFrom"]>()
      .mockImplementation((derived, base) => derived === base),
  };
}

describe("categories provider configuration", () => {
  it.each<{
    name: string;
    providerType: "2d" | "3d";
    treeType: "2d" | "3d";
    providerExclusions?: EC.FullClassNameDotNotation[];
    treeExclusions?: EC.FullClassNameDotNotation[];
    shouldThrow: boolean;
  }>([
    { name: "accepts matching 2d views", providerType: "2d", treeType: "2d", shouldThrow: false },
    { name: "accepts matching 3d views", providerType: "3d", treeType: "3d", shouldThrow: false },
    { name: "rejects a 2d provider for a 3d tree", providerType: "2d", treeType: "3d", shouldThrow: true },
    { name: "rejects a 3d provider for a 2d tree", providerType: "3d", treeType: "2d", shouldThrow: true },
    {
      name: "rejects exclusions present only in the tree",
      providerType: "3d",
      treeType: "3d",
      treeExclusions: ["Generic.PhysicalObject"],
      shouldThrow: true,
    },
    {
      name: "rejects exclusions present only in the provider",
      providerType: "3d",
      treeType: "3d",
      providerExclusions: ["Generic.PhysicalObject"],
      shouldThrow: true,
    },
    {
      name: "accepts omitted and empty exclusions",
      providerType: "3d",
      treeType: "3d",
      treeExclusions: [],
      shouldThrow: false,
    },
    {
      name: "accepts reordered and duplicated exclusions",
      providerType: "3d",
      treeType: "3d",
      providerExclusions: ["Generic.PhysicalObject", "BisCore.PhysicalElement", "Generic.PhysicalObject"],
      treeExclusions: ["BisCore.PhysicalElement", "Generic.PhysicalObject"],
      shouldThrow: false,
    },
  ])("$name", ({ providerType, treeType, providerExclusions, treeExclusions, shouldThrow }) => {
    const access = createAccess();
    const sharedIdsProvider = createSharedIdsProvider({
      imodelAccess: access,
      elementClassName: providerType === "2d" ? "BisCore.GeometricElement2d" : "BisCore.GeometricElement3d",
      excludedElementClassNames: providerExclusions,
    });
    const provider = createCategoriesTreeIdsProvider({ imodelAccess: access, sharedIdsProvider, type: providerType });
    const createTree = () =>
      createCategoriesTree({
        imodelAccess: access,
        viewType: treeType,
        hierarchyConfig: { elements: { nodes: "include", excludedClasses: treeExclusions } },
        idsProvider: provider,
      });
    if (shouldThrow) {
      expect(createTree).toThrow("Categories tree ID provider configuration does not match");
    } else {
      expect(createTree).not.toThrow();
    }
  });

  it.each<{ elementClassName: EC.FullClassNameDotNotation; shouldThrow: boolean }>([
    { elementClassName: "BisCore.GeometricElement3d", shouldThrow: false },
    { elementClassName: "BisCore.GeometricElement2d", shouldThrow: true },
  ])(
    "shared provider class $elementClassName with a 3d view (throws: $shouldThrow)",
    ({ elementClassName, shouldThrow }) => {
      const access = createAccess();
      const sharedIdsProvider = createSharedIdsProvider({ imodelAccess: access, elementClassName });
      const createProvider = () =>
        createCategoriesTreeIdsProvider({ imodelAccess: access, sharedIdsProvider, type: "3d" });
      if (shouldThrow) {
        expect(createProvider).toThrow("ID provider configuration does not match");
      } else {
        expect(createProvider).not.toThrow();
      }
    },
  );
});

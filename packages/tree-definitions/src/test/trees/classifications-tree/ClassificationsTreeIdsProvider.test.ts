/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { createClassificationsTree } from "../../../tree-definitions/trees/classifications-tree/CreateClassificationsTree.js";
import { createClassificationsTreeIdsProvider } from "../../../tree-definitions/trees/classifications-tree/ClassificationsTreeIdsProvider.js";

import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider } from "@itwin/presentation-shared";
import type { ClassificationsTreeHierarchyConfiguration } from "../../../tree-definitions/trees/classifications-tree/ClassificationsTreeDefinition.js";

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

describe("classifications provider configuration", () => {
  it.each<{
    name: string;
    providerConfig?: ClassificationsTreeHierarchyConfiguration;
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
      name: "rejects exclusions present only in the tree",
      treeConfig: {
        rootClassificationSystemCode: "SystemA",
        elements: { excludedClasses: ["BisCore.PhysicalElement"] },
      },
      shouldThrow: true,
    },
    {
      name: "rejects exclusions present only in the provider",
      providerConfig: {
        rootClassificationSystemCode: "SystemA",
        elements: { excludedClasses: ["BisCore.PhysicalElement"] },
      },
      treeConfig: { rootClassificationSystemCode: "SystemA" },
      shouldThrow: true,
    },
    {
      name: "rejects different excluded classes",
      providerConfig: {
        rootClassificationSystemCode: "SystemA",
        elements: { excludedClasses: ["BisCore.PhysicalElement"] },
      },
      treeConfig: {
        rootClassificationSystemCode: "SystemA",
        elements: { excludedClasses: ["BisCore.SpatialLocationElement"] },
      },
      shouldThrow: true,
    },
    {
      name: "accepts omitted and empty exclusions",
      treeConfig: { rootClassificationSystemCode: "SystemA", elements: { excludedClasses: [] } },
      shouldThrow: false,
    },
    {
      name: "accepts reordered and duplicated exclusions",
      providerConfig: {
        rootClassificationSystemCode: "SystemA",
        elements: { excludedClasses: ["Generic.PhysicalObject", "BisCore.PhysicalElement", "Generic.PhysicalObject"] },
      },
      treeConfig: {
        rootClassificationSystemCode: "SystemA",
        elements: { excludedClasses: ["BisCore.PhysicalElement", "Generic.PhysicalObject"] },
      },
      shouldThrow: false,
    },
  ])("$name", ({ providerConfig = { rootClassificationSystemCode: "SystemA" }, treeConfig, shouldThrow }) => {
    const access = createAccess();
    const provider = createClassificationsTreeIdsProvider({ imodelAccess: access, hierarchyConfig: providerConfig });
    const tree = createClassificationsTree({ hierarchyConfig: treeConfig, getIdsProvider: () => provider });
    if (shouldThrow) {
      expect(() => tree.getHierarchyDefinition(access)).toThrow(
        "Classifications tree ID provider configuration does not match",
      );
    } else {
      expect(() => tree.getHierarchyDefinition(access)).not.toThrow();
    }
  });
});

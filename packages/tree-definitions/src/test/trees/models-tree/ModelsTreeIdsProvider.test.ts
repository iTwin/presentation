/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EMPTY, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { IModel } from "@itwin/core-common";
import { createSharedIdsProvider } from "../../../tree-definitions/shared/idsProviders/SharedIdsProvider.js";
import { createModelsTree } from "../../../tree-definitions/trees/models-tree/CreateModelsTree.js";
import {
  createModelsTreeIdsProvider,
  normalizeModelsTreeIdsProviderConfig,
} from "../../../tree-definitions/trees/models-tree/ModelsTreeIdsProvider.js";

import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ModelsTreeHierarchyConfiguration } from "../../../tree-definitions/trees/models-tree/ModelsTreeDefinition.js";
import type { ModelsTreeIdsProvider } from "../../../tree-definitions/trees/models-tree/ModelsTreeIdsProvider.js";

function createAccess() {
  return {
    createQueryReader: vi.fn<LimitingECSqlQueryExecutor["createQueryReader"]>(async function* () {}),
    getSchema: vi.fn<ECSchemaProvider["getSchema"]>().mockResolvedValue(undefined),
    getHiddenClassesTree: vi.fn<ECSchemaProvider["getHiddenClassesTree"]>().mockResolvedValue([]),
    classDerivesFrom: vi
      .fn<ECSchemaProvider["classDerivesFrom"]>()
      .mockImplementation((derived, base) => derived === base),
  };
}

describe("models provider configuration", () => {
  it.each<{
    name: string;
    providerConfig?: ModelsTreeHierarchyConfiguration;
    treeConfig: ModelsTreeHierarchyConfiguration;
    shouldThrow: boolean;
  }>([
    { name: "accepts matching defaults", treeConfig: {}, shouldThrow: false },
    {
      name: "accepts explicit defaults",
      treeConfig: {
        subjects: { root: "include", labelMerging: "enable" },
        models: { withoutElements: "exclude", labelMerging: "enable" },
        elements: { baseClass: "BisCore.GeometricElement3d", classGrouping: "enable", excludedClasses: [] },
      },
      shouldThrow: false,
    },
    {
      name: "accepts differences in hierarchy-only category settings",
      treeConfig: { categories: { labelMerging: "disable" } },
      shouldThrow: false,
    },
    { name: "rejects different subject roots", treeConfig: { subjects: { root: "exclude" } }, shouldThrow: true },
    {
      name: "accepts different subject label merging",
      treeConfig: { subjects: { labelMerging: "disable" } },
      shouldThrow: false,
    },
    {
      name: "rejects different empty-model settings",
      treeConfig: { models: { withoutElements: "include" } },
      shouldThrow: true,
    },
    {
      name: "accepts different model label merging",
      treeConfig: { models: { labelMerging: "disable" } },
      shouldThrow: false,
    },
    {
      name: "rejects different element base classes",
      treeConfig: { elements: { baseClass: "BisCore.PhysicalElement" } },
      shouldThrow: true,
    },
    {
      name: "accepts disabled element grouping",
      treeConfig: { elements: { classGrouping: "disable" } },
      shouldThrow: false,
    },
    {
      name: "accepts element grouping with counts",
      treeConfig: { elements: { classGrouping: "enable-with-counts" } },
      shouldThrow: false,
    },
    {
      name: "rejects different element exclusions",
      treeConfig: { elements: { excludedClasses: ["Generic.PhysicalObject"] } },
      shouldThrow: true,
    },
    {
      name: "accepts reordered and duplicated exclusions",
      providerConfig: {
        elements: { excludedClasses: ["Generic.PhysicalObject", "BisCore.PhysicalElement", "Generic.PhysicalObject"] },
      },
      treeConfig: { elements: { excludedClasses: ["BisCore.PhysicalElement", "Generic.PhysicalObject"] } },
      shouldThrow: false,
    },
  ])("$name", ({ providerConfig, treeConfig, shouldThrow }) => {
    const access = createAccess();
    const sharedIdsProvider = createSharedIdsProvider({
      imodelAccess: access,
      elementClassName: providerConfig?.elements?.baseClass ?? "BisCore.GeometricElement3d",
      excludedElementClassNames: providerConfig?.elements?.excludedClasses,
    });
    const provider = createModelsTreeIdsProvider({
      imodelAccess: access,
      sharedIdsProvider,
      hierarchyConfig: providerConfig,
    });
    const createTree = () =>
      createModelsTree({ imodelAccess: access, hierarchyConfig: treeConfig, idsProvider: provider });
    if (shouldThrow) {
      expect(createTree).toThrow("Models tree ID provider configuration does not match");
    } else {
      expect(createTree).not.toThrow();
    }
  });

  it.each<{
    name: string;
    elementClassName: EC.FullClassNameDotNotation;
    excludedClasses?: EC.FullClassNameDotNotation[];
    shouldThrow: boolean;
  }>([
    {
      name: "accepts matching shared element filters",
      elementClassName: "BisCore.GeometricElement3d",
      shouldThrow: false,
    },
    {
      name: "rejects a different shared element class",
      elementClassName: "BisCore.GeometricElement2d",
      shouldThrow: true,
    },
    {
      name: "rejects different shared element exclusions",
      elementClassName: "BisCore.GeometricElement3d",
      excludedClasses: ["Generic.PhysicalObject"],
      shouldThrow: true,
    },
  ])("$name", ({ elementClassName, excludedClasses, shouldThrow }) => {
    const access = createAccess();
    const sharedIdsProvider = createSharedIdsProvider({
      imodelAccess: access,
      elementClassName,
      excludedElementClassNames: excludedClasses,
    });
    const createProvider = () => createModelsTreeIdsProvider({ imodelAccess: access, sharedIdsProvider });
    if (shouldThrow) {
      expect(createProvider).toThrow("ID provider configuration does not match");
    } else {
      expect(createProvider).not.toThrow();
    }
  });
});

describe("createModelsTree", () => {
  it("uses the supplied ID provider for hierarchy and search", async () => {
    const access = createAccess();
    const hierarchyConfig = { subjects: { root: "exclude" as const } };
    const getChildSubjectIds = vi.fn(() => of([]));
    const createSubjectInstanceKeysPath = vi.fn(() => of([]));
    const idsProvider: ModelsTreeIdsProvider = {
      state: "loaded",
      config: normalizeModelsTreeIdsProviderConfig(hierarchyConfig),
      subModeledElements: {
        state: "loaded",
        getData: () => of({ allSubModels: new Set<string>() }),
        getAllSubModeledElements: () => of(new Set<string>()),
      },
      categories: { state: "loaded", getCategories: () => of(new Set<string>()) },
      getChildSubjectIds,
      getChildSubjectModelIds: () => of([]),
      createSubjectInstanceKeysPath,
      getParentSubjectIds: () => of([]),
      getHiddenModelIds: () => of(new Set<string>()),
      createUpToModelInstanceKeyPaths: () => EMPTY,
      getSearchPathsUpToRootCategory: () => EMPTY,
    };
    const tree = createModelsTree({ imodelAccess: access, hierarchyConfig, idsProvider });
    const subject = { className: "BisCore.Subject" as const, id: "0x10" };

    expect(
      await tree.hierarchyDefinition.defineHierarchyLevel({
        parentNode: undefined,
        createSelectClause: async () => "",
        createFilterClauses: async () => ({ from: "", where: "", joins: "" }),
      }),
    ).toEqual([]);
    expect(getChildSubjectIds).toHaveBeenCalledWith([IModel.rootSubjectId]);
    expect(await tree.createSearchTree({ targetItems: [subject] })).toEqual([]);
    expect(createSubjectInstanceKeysPath).toHaveBeenCalledWith(subject.id);
    expect(access.createQueryReader).not.toHaveBeenCalled();
  });
});

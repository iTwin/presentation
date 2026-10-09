/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { ModeledElementsProvider } from "../tree-definitions/shared/idsProviders/ModeledElementsProvider.js";
import { createSharedIdsProvider } from "../tree-definitions/shared/idsProviders/SharedIdsProvider.js";
import { createCategoriesTreeIdsProvider } from "../tree-definitions/trees/categories-tree/CategoriesTreeIdsProvider.js";
import { createClassificationsTreeIdsProvider } from "../tree-definitions/trees/classifications-tree/ClassificationsTreeIdsProvider.js";
import { createModelsTreeIdsProvider } from "../tree-definitions/trees/models-tree/ModelsTreeIdsProvider.js";

import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider, ECSqlQueryRow } from "@itwin/presentation-shared";
import type { SharedIdsProvider } from "../tree-definitions/shared/idsProviders/SharedIdsProvider.js";

function createAccess(waitForQuery: (token: string) => Promise<void> = async () => {}) {
  return {
    imodelKey: "test-imodel",
    createQueryReader: vi.fn<LimitingECSqlQueryExecutor["createQueryReader"]>(async function* (_query, options) {
      const token = options?.restartToken ?? "";
      await waitForQuery(token);
      const rows: ECSqlQueryRow[] = token.endsWith("/element-models-and-categories")
        ? [{ modelId: "0x10", categoryId: "0x20", isTopMostElementCategory: true, isPlanProjectionModel: true }]
        : token.endsWith("/modeled-elements")
          ? [{ modeledElementId: "0x10" }]
          : token.includes("/sub-categories/")
            ? [{ id: "0x21", categoryId: "0x20" }]
            : token.endsWith("/categories")
              ? [{ id: "0x20", modelId: "0x1", parentDefinitionContainerExists: false }]
              : token.includes("/classifications/")
                ? [{ id: "0x30", tableId: "0x31", relatedCategories: "0x20" }]
                : [];
      yield* rows;
    }),
    getSchema: vi.fn<ECSchemaProvider["getSchema"]>().mockResolvedValue(undefined),
    getHiddenClassesTree: vi.fn<ECSchemaProvider["getHiddenClassesTree"]>().mockResolvedValue([]),
    classDerivesFrom: vi
      .fn<ECSchemaProvider["classDerivesFrom"]>()
      .mockImplementation((derived, base) => derived === base),
  };
}

function createBase(imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor) {
  return createSharedIdsProvider({ imodelAccess, elementClassName: "BisCore.GeometricElement3d" });
}

function createGate() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const baseDatasets = [
  { group: "categories", load: async (base: SharedIdsProvider) => base.categories.getAllCategoriesOfElements() },
  { group: "models", load: async (base: SharedIdsProvider) => base.models.getAllModels() },
  { group: "modeledElements", load: async (base: SharedIdsProvider) => base.modeledElements.getAllModeledElements() },
  { group: "subCategories", load: async (base: SharedIdsProvider) => base.subCategories.getCategorySubCategoriesMap() },
] as const;

describe("ID provider data states", () => {
  it("exposes live state beside grouped methods without eagerly loading unused data", async () => {
    const access = createAccess();
    const provider = createSharedIdsProvider({ imodelAccess: access, elementClassName: "BisCore.GeometricElement3d" });
    expect(provider.models.state).toBe("not-requested");
    expect(provider.modeledElements.state).toBe("not-requested");
    expect(provider.categories.state).toBe("not-requested");
    expect(provider.subCategories.state).toBe("not-requested");
    expect(access.createQueryReader).not.toHaveBeenCalled();

    expect(await provider.models.getAllModels()).toEqual(["0x10"]);
    expect(provider.models.state).toBe("loaded");
    expect(provider.modeledElements.state).toBe("not-requested");
    expect(provider.categories.state).toBe("loaded");
    expect(provider.subCategories.state).toBe("not-requested");
    expect(await provider.categories.getCategories({ modelId: "0x10" })).toEqual(new Set(["0x20"]));
    expect(access.createQueryReader).toHaveBeenCalledTimes(1);

    expect(await provider.modeledElements.getAllModeledElements()).toEqual(new Set(["0x10"]));
    expect(provider.modeledElements.state).toBe("loaded");
    expect(provider.models.state).toBe("loaded");
    expect(access.createQueryReader).toHaveBeenCalledTimes(2);
    expect(provider.subCategories.state).toBe("not-requested");
    expect(await provider.subCategories.getCategorySubCategoriesMap()).toEqual(new Map([["0x20", ["0x21"]]]));
    expect(provider.subCategories.state).toBe("loaded");
  });

  it("loads modeled elements only when model lookups exclude sub-models", async () => {
    const access = createAccess();
    const provider = createBase(access);
    const allModels = [];
    for await (const modelId of provider.models.getModels({ categoryId: "0x20" })) {
      allModels.push(modelId);
    }
    expect(allModels).toEqual(["0x10"]);
    expect(provider.models.state).toBe("loaded");
    expect(provider.modeledElements.state).toBe("not-requested");
    expect(access.createQueryReader).toHaveBeenCalledTimes(1);

    const modelsWithoutSubModels = [];
    for await (const modelId of provider.models.getModels({ categoryId: "0x20", excludeSubModels: true })) {
      modelsWithoutSubModels.push(modelId);
    }
    expect(modelsWithoutSubModels).toEqual([]);
    expect(provider.models.state).toBe("loaded");
    expect(provider.modeledElements.state).toBe("loaded");
    expect(access.createQueryReader).toHaveBeenCalledTimes(2);
  });

  it("keeps modeled-element loading and failures separate from loaded model data", async () => {
    const gate = createGate();
    let failModeledElements = true;
    const access = createAccess(async (token) => {
      if (token.endsWith("/modeled-elements")) {
        await gate.promise;
        if (failModeledElements) {
          throw new Error("modeled elements failed");
        }
      }
    });
    const provider = createBase(access);
    await provider.models.getAllModels();
    const pending = provider.modeledElements.getAllModeledElements();
    const failure = expect(pending).rejects.toThrow("modeled elements failed");
    expect(provider.modeledElements.state).toBe("requested");
    expect(provider.models.state).toBe("loaded");
    gate.resolve();
    await failure;
    expect(provider.modeledElements.state).toBe("failed");
    expect(provider.models.state).toBe("loaded");
    expect(provider.categories.state).toBe("loaded");
    expect(await provider.models.getAllModels()).toEqual(["0x10"]);
    expect(provider.modeledElements.state).toBe("failed");

    failModeledElements = false;
    const retry = provider.modeledElements.getAllModeledElements();
    expect(provider.modeledElements.state).toBe("requested");
    expect(provider.models.state).toBe("loaded");
    expect(await retry).toEqual(new Set(["0x10"]));
    expect(provider.modeledElements.state).toBe("loaded");
    expect(provider.models.state).toBe("loaded");
  });

  it("discards failed rows when the same modeled-elements provider is subscribed again", async () => {
    let attempts = 0;
    const queryExecutor: LimitingECSqlQueryExecutor = {
      async *createQueryReader() {
        if (++attempts === 1) {
          yield { modeledElementId: "0x10" };
          throw new Error("Query interrupted by a connection failure");
        }
        yield { modeledElementId: "0x20" };
      },
    };
    const provider = new ModeledElementsProvider({
      queryExecutor,
      componentId: "00000000-0000-0000-0000-000000000001",
      elementClassName: "BisCore.GeometricElement3d",
      nonEmptyModelIds: ["0x10", "0x20"],
    });
    const cached = provider.getData();

    await expect(firstValueFrom(cached)).rejects.toThrow("connection failure");
    expect(provider.getData()).toBe(cached);
    const result = await firstValueFrom(cached);

    expect(attempts).toBe(2);
    expect([...result.allSubModels]).toEqual(["0x20"]);
  });

  describe.each(baseDatasets)("$group", ({ group, load }) => {
    it("is lazy, shares pending work, and becomes loaded after success", async () => {
      const gate = createGate();
      const started = createGate();
      const access = createAccess(async () => {
        started.resolve();
        await gate.promise;
      });
      const base = createBase(access);
      expect(base[group].state).toBe("not-requested");
      expect(access.createQueryReader).not.toHaveBeenCalled();

      const first = load(base);
      expect(base[group].state).toBe("requested");
      const second = load(base);
      await started.promise;
      expect(access.createQueryReader).toHaveBeenCalledTimes(1);

      gate.resolve();
      expect(await first).toEqual(await second);
      expect(base[group].state).toBe("loaded");
      const queries = access.createQueryReader.mock.calls.length;
      await load(base);
      expect(access.createQueryReader).toHaveBeenCalledTimes(queries);
      expect(createBase(access)[group].state).toBe("not-requested");
    });

    it("reports failures and marks an explicit retry as requested until it loads", async () => {
      const gate = createGate();
      const retryGate = createGate();
      const access = createAccess(vi.fn().mockReturnValueOnce(gate.promise).mockReturnValue(retryGate.promise));
      const base = createBase(access);
      const pending = load(base);
      const failure = expect(pending).rejects.toThrow("query failed");
      gate.reject(new Error("query failed"));
      await failure;
      expect(base[group].state).toBe("failed");
      const retry = load(base);
      expect(base[group].state).toBe("requested");
      const queries = access.createQueryReader.mock.calls.length;
      const concurrent = load(base);
      expect(access.createQueryReader).toHaveBeenCalledTimes(queries);
      retryGate.resolve();
      expect(await retry).toEqual(await concurrent);
      expect(base[group].state).toBe("loaded");
    });

    it("allows preloading", async () => {
      const access = createAccess();
      const base = createBase(access);
      void load(base);
      expect(base[group].state).toBe("requested");
      await vi.waitFor(() => expect(base[group].state).toBe("loaded"));
      const queries = access.createQueryReader.mock.calls.length;

      await load(base);
      expect(access.createQueryReader).toHaveBeenCalledTimes(queries);
    });
  });

  it("loads independent shared datasets only when needed", async () => {
    const access = createAccess();
    const base = createBase(access);
    await base.models.getAllModels();
    expect(base.categories.state).toBe("loaded");
    expect(base.models.state).toBe("loaded");
    expect(base.modeledElements.state).toBe("not-requested");
    expect(base.subCategories.state).toBe("not-requested");
    expect(await base.models.getPlanProjectionModels()).toEqual(new Set(["0x10"]));
    expect(await base.categories.getAllCategoriesOfElements()).toEqual(new Set(["0x20"]));
    expect(await base.categories.getCategories({ modelId: "0x10" })).toEqual(new Set(["0x20"]));
    expect(access.createQueryReader).toHaveBeenCalledTimes(1);
  });

  const treeFactories = [
    {
      name: "models",
      create: (access: ReturnType<typeof createAccess>, sharedIdsProvider: SharedIdsProvider) => {
        const provider = createModelsTreeIdsProvider({ imodelAccess: access, sharedIdsProvider });
        return { provider, load: async () => provider.getParentSubjectIds() };
      },
    },
    {
      name: "categories",
      create: (access: ReturnType<typeof createAccess>, sharedIdsProvider: SharedIdsProvider) => {
        const provider = createCategoriesTreeIdsProvider({ imodelAccess: access, sharedIdsProvider, type: "3d" });
        return { provider, load: async () => provider.getAllDefinitionContainersAndCategories() };
      },
    },
    {
      name: "classifications",
      create: (access: ReturnType<typeof createAccess>, sharedIdsProvider: SharedIdsProvider) => {
        const provider = createClassificationsTreeIdsProvider({
          imodelAccess: access,
          sharedIdsProvider,
          hierarchyConfig: { rootClassificationSystemCode: "test" },
        });
        return { provider, load: async () => provider.getAllClassifications() };
      },
    },
  ];

  describe.each(treeFactories)("$name", ({ name, create }) => {
    it("tracks requests, shares queries, and loads only its dependencies", async () => {
      const gate = createGate();
      const access = createAccess(async () => gate.promise);
      const base = createBase(access);
      const { provider, load } = create(access, base);
      if ("modeledElements" in provider) {
        expect(provider.modeledElements).toBe(base.modeledElements);
        expect(provider.categories).toBe(base.categories);
      }
      expect(provider.state).toBe("not-requested");
      expect(access.createQueryReader).not.toHaveBeenCalled();
      const pending = load();
      expect(provider.state).toBe("requested");
      const concurrent = load();
      gate.resolve();
      expect(await pending).toEqual(await concurrent);
      expect(provider.state).toBe("loaded");
      const tokens = access.createQueryReader.mock.calls.map(([, options]) => options?.restartToken);
      expect(new Set(tokens).size).toBe(tokens.length);
      expect(base.categories.state).toBe(name === "models" ? "not-requested" : "loaded");
      expect(base.subCategories.state).toBe(name === "categories" ? "loaded" : "not-requested");
      expect(base.models.state).toBe(name === "models" ? "not-requested" : "loaded");
      expect(base.modeledElements.state).toBe("not-requested");
      expect(create(access, base).provider.state).toBe("not-requested");
    });

    it("reports query failures and allows retry", async () => {
      let gate = createGate();
      const started = createGate();
      const access = createAccess(async (token) => {
        if (
          (name === "models" && token.endsWith("/subjects")) ||
          (name === "categories" && token.endsWith("/categories")) ||
          (name === "classifications" && token.includes("/classifications/"))
        ) {
          started.resolve();
          await gate.promise;
        }
      });
      const base = createBase(access);
      const { provider, load } = create(access, base);
      const failure = expect(load()).rejects.toThrow("tree query failed");
      await started.promise;
      expect(provider.state).toBe("requested");
      gate.reject(new Error("tree query failed"));
      await failure;
      expect(provider.state).toBe("failed");
      expect(base.categories.state).toBe(name === "models" ? "not-requested" : "loaded");
      expect(base.subCategories.state).toBe(name === "categories" ? "loaded" : "not-requested");

      gate = createGate();
      const retry = load();
      expect(provider.state).toBe("requested");
      gate.resolve();
      await retry;
      expect(provider.state).toBe("loaded");
    });
  });
});

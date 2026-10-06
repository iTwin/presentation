/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { createBaseIdsProvider } from "../tree-definitions/shared/idsProviders/BaseIdsProvider.js";
import { ModeledElementsProvider } from "../tree-definitions/shared/idsProviders/ModeledElementsProvider.js";
import { createCategoriesTreeIdsProvider } from "../tree-definitions/trees/categories-tree/CategoriesTreeIdsProvider.js";
import { createClassificationsTreeIdsProvider } from "../tree-definitions/trees/classifications-tree/ClassificationsTreeIdsProvider.js";
import { createModelsTreeIdsProvider } from "../tree-definitions/trees/models-tree/ModelsTreeIdsProvider.js";

import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider, ECSqlQueryRow } from "@itwin/presentation-shared";
import type { BaseIdsProvider } from "../tree-definitions/shared/idsProviders/BaseIdsProvider.js";

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
    classDerivesFrom: vi
      .fn<ECSchemaProvider["classDerivesFrom"]>()
      .mockImplementation((derived, base) => derived === base),
  };
}

function createBase(queryExecutor: LimitingECSqlQueryExecutor) {
  return createBaseIdsProvider({ queryExecutor, elementClassName: "BisCore.GeometricElement3d" });
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
  { state: "elementModelCategoriesState", load: async (base: BaseIdsProvider) => base.getAllModels() },
  { state: "modeledElementsState", load: async (base: BaseIdsProvider) => base.getAllModeledElements() },
  { state: "subCategoriesState", load: async (base: BaseIdsProvider) => base.getCategorySubCategoriesMap() },
] as const;

describe("ID provider data states", () => {
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

  describe.each(baseDatasets)("$state", ({ state, load }) => {
    it("is lazy, shares pending work, and becomes loaded after success", async () => {
      const gate = createGate();
      const access = createAccess(async () => gate.promise);
      const base = createBase(access);
      expect(base[state]).toBe("not-requested");
      expect(access.createQueryReader).not.toHaveBeenCalled();

      const first = load(base);
      expect(base[state]).toBe("requested");
      const second = load(base);
      expect(access.createQueryReader).toHaveBeenCalledTimes(1);

      gate.resolve();
      expect(await first).toEqual(await second);
      expect(base[state]).toBe("loaded");
      const queries = access.createQueryReader.mock.calls.length;
      await load(base);
      expect(access.createQueryReader).toHaveBeenCalledTimes(queries);
      expect(createBase(access)[state]).toBe("not-requested");
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
      expect(base[state]).toBe("failed");
      const retry = load(base);
      expect(base[state]).toBe("requested");
      const queries = access.createQueryReader.mock.calls.length;
      const concurrent = load(base);
      expect(access.createQueryReader).toHaveBeenCalledTimes(queries);
      retryGate.resolve();
      expect(await retry).toEqual(await concurrent);
      expect(base[state]).toBe("loaded");
    });

    it("allows preloading", async () => {
      const access = createAccess();
      const base = createBase(access);
      void load(base);
      expect(base[state]).toBe("requested");
      await vi.waitFor(() => expect(base[state]).toBe("loaded"));
      const queries = access.createQueryReader.mock.calls.length;

      await load(base);
      expect(access.createQueryReader).toHaveBeenCalledTimes(queries);
    });
  });

  it("loads independent base datasets only when needed", async () => {
    const access = createAccess();
    const base = createBase(access);
    await base.getAllModels();
    expect(base.elementModelCategoriesState).toBe("loaded");
    expect(base.modeledElementsState).toBe("not-requested");
    expect(base.subCategoriesState).toBe("not-requested");
    expect(await base.getPlanProjectionModels()).toEqual(new Set(["0x10"]));
    expect(await base.getAllCategoriesOfElements()).toEqual(new Set(["0x20"]));
    expect(await base.getCategories({ modelId: "0x10" })).toEqual(new Set(["0x20"]));
    expect(access.createQueryReader).toHaveBeenCalledTimes(1);
  });

  const treeFactories = [
    {
      name: "models",
      create: (access: ReturnType<typeof createAccess>, baseIdsProvider: BaseIdsProvider) => {
        const provider = createModelsTreeIdsProvider({ queryExecutor: access, baseIdsProvider });
        return { provider, load: async () => provider.getParentSubjectIds() };
      },
    },
    {
      name: "categories",
      create: (access: ReturnType<typeof createAccess>, baseIdsProvider: BaseIdsProvider) => {
        const provider = createCategoriesTreeIdsProvider({ imodelAccess: access, baseIdsProvider, type: "3d" });
        return { provider, load: async () => provider.getAllDefinitionContainersAndCategories() };
      },
    },
    {
      name: "classifications",
      create: (access: ReturnType<typeof createAccess>, baseIdsProvider: BaseIdsProvider) => {
        const provider = createClassificationsTreeIdsProvider({
          queryExecutor: access,
          baseIdsProvider,
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
      expect(provider.dataState).toBe("not-requested");
      expect(access.createQueryReader).not.toHaveBeenCalled();
      const pending = load();
      expect(provider.dataState).toBe("requested");
      const concurrent = load();
      gate.resolve();
      expect(await pending).toEqual(await concurrent);
      expect(provider.dataState).toBe("loaded");
      const tokens = access.createQueryReader.mock.calls.map(([, options]) => options?.restartToken);
      expect(new Set(tokens).size).toBe(tokens.length);
      expect(base.elementModelCategoriesState).toBe(name === "models" ? "not-requested" : "loaded");
      expect(base.subCategoriesState).toBe(name === "categories" ? "loaded" : "not-requested");
      expect(base.modeledElementsState).toBe("not-requested");
      expect(create(access, base).provider.dataState).toBe("not-requested");
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
      expect(provider.dataState).toBe("requested");
      gate.reject(new Error("tree query failed"));
      await failure;
      expect(provider.dataState).toBe("failed");
      expect(base.elementModelCategoriesState).toBe(name === "models" ? "not-requested" : "loaded");
      expect(base.subCategoriesState).toBe(name === "categories" ? "loaded" : "not-requested");

      gate = createGate();
      const retry = load();
      expect(provider.dataState).toBe("requested");
      gate.resolve();
      await retry;
      expect(provider.dataState).toBe("loaded");
    });
  });
});

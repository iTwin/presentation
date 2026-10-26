/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { firstValueFrom, from, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
  eachValueFrom,
  type ECSchemaProvider,
  type ECSqlQueryRow,
  type Subscribable,
} from "@itwin/presentation-shared";
import { createSharedIdsProvider } from "../tree-definitions/shared/idsProviders/SharedIdsProvider.js";
import { SubModeledElementsProvider } from "../tree-definitions/shared/idsProviders/SubModeledElementsProvider.js";
import { toPromise } from "../tree-definitions/shared/Rxjs.js";
import { createCategoriesTreeIdsProvider } from "../tree-definitions/trees/categories-tree/CategoriesTreeIdsProvider.js";
import { createClassificationsTreeIdsProvider } from "../tree-definitions/trees/classifications-tree/ClassificationsTreeIdsProvider.js";
import { createModelsTreeIdsProvider } from "../tree-definitions/trees/models-tree/ModelsTreeIdsProvider.js";

import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { SharedIdsProvider } from "../tree-definitions/shared/idsProviders/SharedIdsProvider.js";

// IDs of instances returned by the iModel queries mocked in `createAccess`.
/** Model containing an element of `CATEGORY_ID`. Also returned as a sub-modeled element, i.e. it models an element. */
const MODEL_ID = "0x10";
const CATEGORY_ID = "0x20";
const SUB_CATEGORY_ID = "0x21";
/** Model containing `CATEGORY_ID`. */
const CATEGORY_MODEL_ID = "0x1";
const CLASSIFICATION_ID = "0x30";
const CLASSIFICATION_TABLE_ID = "0x31";
/** ID that isn't returned by any mocked query. */
const UNRELATED_SUB_MODEL_ID = "0x99";

function createAccess(waitForQuery: (token: string) => Promise<void> = async () => {}) {
  return {
    createQueryReader: vi.fn<LimitingECSqlQueryExecutor["createQueryReader"]>(async function* (_query, options) {
      const token = options?.restartToken ?? "";
      await waitForQuery(token);
      const rows: ECSqlQueryRow[] = token.endsWith("/element-models-and-categories")
        ? [{ modelId: MODEL_ID, categoryId: CATEGORY_ID, isTopMostElementCategory: true, isPlanProjectionModel: true }]
        : token.endsWith("/sub-modeled-elements")
          ? [{ subModeledElementId: MODEL_ID }]
          : token.includes("/sub-categories/")
            ? [{ id: SUB_CATEGORY_ID, categoryId: CATEGORY_ID }]
            : token.endsWith("/categories")
              ? [{ id: CATEGORY_ID, modelId: CATEGORY_MODEL_ID, parentDefinitionContainerExists: false }]
              : token.includes("/classifications/")
                ? [
                    { type: "cl", id: CLASSIFICATION_ID, tableId: CLASSIFICATION_TABLE_ID },
                    { type: "ct", id: CLASSIFICATION_TABLE_ID },
                  ]
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

function createModelsProviderStub(modelIds: string[]) {
  return {
    state: "loaded" as const,
    getData: () =>
      of({
        planProjectionModels: new Set<string>(),
        modelsCategoriesInfo: new Map(
          modelIds.map((id) => [
            id,
            { categoriesOfTopMostNonExcludedElements: new Set<string>(), hasNonExcludedElements: true },
          ]),
        ),
        categoriesContainingNonExcludedElements: new Set<string>(),
        categoryModelsInfo: new Map(),
        allCategories: new Set<string>(),
      }),
  };
}

const baseDatasets = [
  {
    group: "categories",
    load: async (base: SharedIdsProvider) => toPromise(base.categories.getAllCategoriesOfElements()),
  },
  { group: "models", load: async (base: SharedIdsProvider) => toPromise(base.models.getAllModels()) },
  {
    group: "subModeledElements",
    load: async (base: SharedIdsProvider) => toPromise(base.subModeledElements.getAllSubModeledElements()),
  },
  {
    group: "subCategories",
    load: async (base: SharedIdsProvider) => toPromise(base.subCategories.getCategorySubCategoriesMap()),
  },
] as const;

describe("ID provider data states", () => {
  it("exposes live state beside grouped methods without eagerly loading unused data", async () => {
    const access = createAccess();
    const provider = createSharedIdsProvider({ imodelAccess: access, elementClassName: "BisCore.GeometricElement3d" });
    expect(provider.models.state).toBe("not-requested");
    expect(provider.subModeledElements.state).toBe("not-requested");
    expect(provider.categories.state).toBe("not-requested");
    expect(provider.subCategories.state).toBe("not-requested");
    expect(access.createQueryReader).not.toHaveBeenCalled();

    expect(await toPromise(provider.models.getAllModels())).toEqual(new Set([MODEL_ID]));
    expect(provider.models.state).toBe("loaded");
    expect(provider.subModeledElements.state).toBe("not-requested");
    expect(provider.categories.state).toBe("loaded");
    expect(provider.subCategories.state).toBe("not-requested");
    expect(await toPromise(provider.categories.getCategories({ modelId: MODEL_ID }))).toEqual(new Set([CATEGORY_ID]));
    expect(access.createQueryReader).toHaveBeenCalledTimes(1);

    expect(await toPromise(provider.subModeledElements.getAllSubModeledElements())).toEqual(new Set([MODEL_ID]));
    expect(provider.subModeledElements.state).toBe("loaded");
    expect(provider.models.state).toBe("loaded");
    expect(access.createQueryReader).toHaveBeenCalledTimes(2);
    expect(provider.subCategories.state).toBe("not-requested");
    expect(await toPromise(provider.subCategories.getCategorySubCategoriesMap())).toEqual(
      new Map([[CATEGORY_ID, [SUB_CATEGORY_ID]]]),
    );
    expect(provider.subCategories.state).toBe("loaded");
  });

  it("omits supplied sub-models from model lookups without loading sub-modeled elements", async () => {
    const access = createAccess();
    const provider = createBase(access);
    const allModels = [];
    for await (const modelId of eachValueFrom(provider.models.getModels({ categoryId: CATEGORY_ID }))) {
      allModels.push(modelId);
    }
    expect(allModels).toEqual([MODEL_ID]);
    expect(provider.models.state).toBe("loaded");
    expect(access.createQueryReader).toHaveBeenCalledTimes(1);

    const modelsWithoutSubModels = [];
    for await (const modelId of eachValueFrom(
      provider.models.getModels({ categoryId: CATEGORY_ID, excludedSubModels: new Set([MODEL_ID]) }),
    )) {
      modelsWithoutSubModels.push(modelId);
    }
    expect(modelsWithoutSubModels).toEqual([]);

    const modelsWithoutOtherSubModels = [];
    for await (const modelId of eachValueFrom(
      provider.models.getModels({ categoryId: CATEGORY_ID, excludedSubModels: new Set([UNRELATED_SUB_MODEL_ID]) }),
    )) {
      modelsWithoutOtherSubModels.push(modelId);
    }
    expect(modelsWithoutOtherSubModels).toEqual([MODEL_ID]);
    expect(provider.subModeledElements.state).toBe("not-requested");
    expect(access.createQueryReader).toHaveBeenCalledTimes(1);
  });

  it("keeps sub-modeled element loading and failures separate from loaded model data", async () => {
    const gate = new ResolvablePromise<void>();
    let failSubModeledElements = true;
    const access = createAccess(async (token) => {
      if (token.endsWith("/sub-modeled-elements")) {
        await gate;
        if (failSubModeledElements) {
          throw new Error("modeled elements failed");
        }
      }
    });
    const provider = createBase(access);
    await toPromise(provider.models.getAllModels());
    const pending = toPromise(provider.subModeledElements.getAllSubModeledElements());
    const failure = expect(pending).rejects.toThrow("modeled elements failed");
    expect(provider.subModeledElements.state).toBe("requested");
    expect(provider.models.state).toBe("loaded");
    gate.resolveSync();
    await failure;
    expect(provider.subModeledElements.state).toBe("failed");
    expect(provider.models.state).toBe("loaded");
    expect(provider.categories.state).toBe("loaded");
    expect(await toPromise(provider.models.getAllModels())).toEqual(new Set([MODEL_ID]));
    expect(provider.subModeledElements.state).toBe("failed");

    failSubModeledElements = false;
    const retry = toPromise(provider.subModeledElements.getAllSubModeledElements());
    expect(provider.subModeledElements.state).toBe("requested");
    expect(provider.models.state).toBe("loaded");
    expect(await retry).toEqual(new Set([MODEL_ID]));
    expect(provider.subModeledElements.state).toBe("loaded");
    expect(provider.models.state).toBe("loaded");
  });

  it("discards failed rows when the same sub-modeled elements provider is subscribed again", async () => {
    const failedAttemptSubModelId = "0x10";
    const retrySubModelId = "0x20";
    let attempts = 0;
    const queryExecutor: LimitingECSqlQueryExecutor = {
      async *createQueryReader() {
        if (++attempts === 1) {
          yield { subModeledElementId: failedAttemptSubModelId };
          throw new Error("Query interrupted by a connection failure");
        }
        yield { subModeledElementId: retrySubModelId };
      },
    };
    const provider = new SubModeledElementsProvider({
      queryExecutor,
      componentId: "00000000-0000-0000-0000-000000000001",
      elementClassName: "BisCore.GeometricElement3d",
      elementModelCategoriesProvider: createModelsProviderStub([failedAttemptSubModelId, retrySubModelId]),
    });
    const cached = provider.getData();

    await expect(firstValueFrom(cached)).rejects.toThrow("connection failure");
    expect(provider.getData()).toBe(cached);
    const result = await firstValueFrom(cached);

    expect(attempts).toBe(2);
    expect([...result.allSubModels]).toEqual([retrySubModelId]);
  });

  it("doesn't query sub-modeled elements when there are no models with elements", async () => {
    const queryExecutor = { createQueryReader: vi.fn<LimitingECSqlQueryExecutor["createQueryReader"]>() };
    const provider = new SubModeledElementsProvider({
      queryExecutor,
      componentId: "00000000-0000-0000-0000-000000000001",
      elementClassName: "BisCore.GeometricElement3d",
      elementModelCategoriesProvider: createModelsProviderStub([]),
    });

    expect(await firstValueFrom(provider.getData())).toEqual({ allSubModels: new Set() });
    expect(provider.state).toBe("loaded");
    expect(queryExecutor.createQueryReader).not.toHaveBeenCalled();
  });

  describe.each(baseDatasets)("$group", ({ group, load }) => {
    it("is lazy, shares pending work, and becomes loaded after success", async () => {
      const gate = new ResolvablePromise<void>();
      const started = new ResolvablePromise<void>();
      const access = createAccess(async () => {
        started.resolveSync();
        await gate;
      });
      const base = createBase(access);
      expect(base[group].state).toBe("not-requested");
      expect(access.createQueryReader).not.toHaveBeenCalled();

      const first = load(base);
      expect(base[group].state).toBe("requested");
      const second = load(base);
      await started;
      expect(access.createQueryReader).toHaveBeenCalledTimes(1);

      gate.resolveSync();
      expect(await first).toEqual(await second);
      expect(base[group].state).toBe("loaded");
      const queries = access.createQueryReader.mock.calls.length;
      await load(base);
      expect(access.createQueryReader).toHaveBeenCalledTimes(queries);
      expect(createBase(access)[group].state).toBe("not-requested");
    });

    it("reports failures and marks an explicit retry as requested until it loads", async () => {
      const gate = new ResolvablePromise<void>();
      const retryGate = new ResolvablePromise<void>();
      const access = createAccess(vi.fn().mockReturnValueOnce(gate).mockReturnValue(retryGate));
      const base = createBase(access);
      const pending = load(base);
      const failure = expect(pending).rejects.toThrow("query failed");
      gate.rejectSync(new Error("query failed"));
      await failure;
      expect(base[group].state).toBe("failed");
      const retry = load(base);
      expect(base[group].state).toBe("requested");
      const queries = access.createQueryReader.mock.calls.length;
      const concurrent = load(base);
      expect(access.createQueryReader).toHaveBeenCalledTimes(queries);
      retryGate.resolveSync();
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
    await toPromise(base.models.getAllModels());
    expect(base.categories.state).toBe("loaded");
    expect(base.models.state).toBe("loaded");
    expect(base.subModeledElements.state).toBe("not-requested");
    expect(base.subCategories.state).toBe("not-requested");
    expect(await toPromise(base.models.getPlanProjectionModels())).toEqual(new Set([MODEL_ID]));
    expect(await toPromise(base.categories.getAllCategoriesOfElements())).toEqual(new Set([CATEGORY_ID]));
    expect(await toPromise(base.categories.getCategories({ modelId: MODEL_ID }))).toEqual(new Set([CATEGORY_ID]));
    expect(access.createQueryReader).toHaveBeenCalledTimes(1);
  });

  it("exposes loaded data that can override another provider's queries", async () => {
    const source = createBase(createAccess());
    const access = createAccess();
    const overrides = {
      loadElementModelCategories: vi.fn(() => source.models.getData()),
      loadSubModeledElements: vi.fn(() => source.subModeledElements.getData()),
      loadSubCategories: vi.fn(() => source.subCategories.getData()),
    };
    const provider = createSharedIdsProvider({
      imodelAccess: access,
      elementClassName: "BisCore.GeometricElement3d",
      loadDataOverrides: overrides,
    });
    expect(provider.models.state).toBe("not-requested");
    expect(provider.subModeledElements.state).toBe("not-requested");
    expect(provider.subCategories.state).toBe("not-requested");
    expect(overrides.loadElementModelCategories).not.toHaveBeenCalled();
    expect(overrides.loadSubModeledElements).not.toHaveBeenCalled();
    expect(overrides.loadSubCategories).not.toHaveBeenCalled();

    expect(await toPromise(provider.subModeledElements.getAllSubModeledElements())).toEqual(new Set([MODEL_ID]));
    expect(provider.subModeledElements.state).toBe("loaded");
    expect(provider.models.state).toBe("not-requested");
    expect(overrides.loadElementModelCategories).not.toHaveBeenCalled();

    expect(await toPromise(provider.categories.getCategories({ modelId: MODEL_ID }))).toEqual(new Set([CATEGORY_ID]));
    expect(await toPromise(provider.models.getAllModels())).toEqual(new Set([MODEL_ID]));
    expect(await toPromise(provider.models.getData())).toBe(await toPromise(source.models.getData()));
    expect(provider.models.state).toBe("loaded");
    expect(provider.categories.state).toBe("loaded");

    expect(await toPromise(provider.subCategories.getCategorySubCategoriesMap())).toEqual(
      new Map([[CATEGORY_ID, [SUB_CATEGORY_ID]]]),
    );
    expect(provider.subCategories.state).toBe("loaded");

    expect(overrides.loadElementModelCategories).toHaveBeenCalledTimes(1);
    expect(overrides.loadSubModeledElements).toHaveBeenCalledTimes(1);
    expect(overrides.loadSubCategories).toHaveBeenCalledTimes(1);
    expect(access.createQueryReader).not.toHaveBeenCalled();
  });

  describe.each([
    {
      group: "models",
      overrideKey: "loadElementModelCategories",
      load: async (base: SharedIdsProvider) => toPromise(base.models.getData()),
      data: () => ({
        planProjectionModels: new Set<string>(),
        modelsCategoriesInfo: new Map(),
        categoriesContainingNonExcludedElements: new Set<string>(),
        categoryModelsInfo: new Map(),
        allCategories: new Set(["0x99"]),
      }),
    },
    {
      group: "subModeledElements",
      overrideKey: "loadSubModeledElements",
      load: async (base: SharedIdsProvider) => toPromise(base.subModeledElements.getData()),
      data: () => ({ allSubModels: new Set(["0x99"]) }),
    },
    {
      group: "subCategories",
      overrideKey: "loadSubCategories",
      load: async (base: SharedIdsProvider) => toPromise(base.subCategories.getData()),
      data: () => ({ subCategoryCategories: new Map(), categorySubCategories: new Map([["0x99", ["0x98"]]]) }),
    },
  ] as const)("$overrideKey data override", ({ group, overrideKey, load, data }) => {
    it("tracks state, shares results, and is called again on retry after failure", async () => {
      const gate = new ResolvablePromise<void>();
      const expected = data();
      const override = vi.fn<() => Subscribable<any>>().mockReturnValueOnce(from(gate)).mockReturnValue(of(expected));
      const access = createAccess();
      const provider = createSharedIdsProvider({
        imodelAccess: access,
        elementClassName: "BisCore.GeometricElement3d",
        loadDataOverrides: { [overrideKey]: override },
      });

      const pending = load(provider);
      const concurrent = load(provider);
      expect(provider[group].state).toBe("requested");
      expect(override).toHaveBeenCalledTimes(1);
      const failures = Promise.all([
        expect(pending).rejects.toThrow("override failed"),
        expect(concurrent).rejects.toThrow("override failed"),
      ]);
      gate.rejectSync(new Error("override failed"));
      await failures;
      expect(provider[group].state).toBe("failed");

      expect(await load(provider)).toBe(expected);
      expect(provider[group].state).toBe("loaded");
      expect(await load(provider)).toBe(expected);
      expect(override).toHaveBeenCalledTimes(2);
      expect(access.createQueryReader).not.toHaveBeenCalled();
    });
  });

  const treeFactories = [
    {
      name: "models",
      create: (access: ReturnType<typeof createAccess>, sharedIdsProvider: SharedIdsProvider) => {
        const provider = createModelsTreeIdsProvider({ imodelAccess: access, sharedIdsProvider });
        return { provider, load: async () => toPromise(provider.getParentSubjectIds()) };
      },
    },
    {
      name: "categories",
      create: (access: ReturnType<typeof createAccess>, sharedIdsProvider: SharedIdsProvider) => {
        const provider = createCategoriesTreeIdsProvider({
          imodelAccess: access,
          sharedIdsProvider,
          hierarchyConfig: { perspective: "3d" },
        });
        return { provider, load: async () => toPromise(provider.getAllDefinitionContainersAndCategories()) };
      },
    },
    {
      name: "classifications",
      create: (access: ReturnType<typeof createAccess>, _sharedIdsProvider: SharedIdsProvider) => {
        const provider = createClassificationsTreeIdsProvider({
          imodelAccess: access,
          hierarchyConfig: { rootClassificationSystemCode: "test" },
        });
        return { provider, load: async () => toPromise(provider.getAllClassifications()) };
      },
    },
  ];

  describe.each(treeFactories)("$name", ({ name, create }) => {
    it("tracks requests, shares queries, and loads only its dependencies", async () => {
      const gate = new ResolvablePromise<void>();
      const access = createAccess(async () => gate);
      const base = createBase(access);
      const { provider, load } = create(access, base);
      if ("subModeledElements" in provider) {
        expect(provider.subModeledElements).toBe(base.subModeledElements);
        expect(provider.categories).toBe(base.categories);
      }
      expect(provider.state).toBe("not-requested");
      expect(access.createQueryReader).not.toHaveBeenCalled();
      const pending = load();
      expect(provider.state).toBe("requested");
      const concurrent = load();
      gate.resolveSync();
      expect(await pending).toEqual(await concurrent);
      expect(provider.state).toBe("loaded");
      const tokens = access.createQueryReader.mock.calls.map(([, options]) => options?.restartToken);
      expect(new Set(tokens).size).toBe(tokens.length);
      expect(base.categories.state).toBe(name === "categories" ? "loaded" : "not-requested");
      expect(base.subCategories.state).toBe(name === "categories" ? "loaded" : "not-requested");
      expect(base.models.state).toBe(name === "categories" ? "loaded" : "not-requested");
      expect(base.subModeledElements.state).toBe("not-requested");
      expect(create(access, base).provider.state).toBe("not-requested");
    });

    it("reports query failures and allows retry", async () => {
      let gate = new ResolvablePromise<void>();
      const started = new ResolvablePromise<void>();
      const access = createAccess(async (token) => {
        if (
          (name === "models" && token.endsWith("/subjects")) ||
          (name === "categories" && token.endsWith("/categories")) ||
          (name === "classifications" && token.includes("/classifications/"))
        ) {
          started.resolveSync();
          await gate;
        }
      });
      const base = createBase(access);
      const { provider, load } = create(access, base);
      const failure = expect(load()).rejects.toThrow("tree query failed");
      await started;
      expect(provider.state).toBe("requested");
      gate.rejectSync(new Error("tree query failed"));
      await failure;
      expect(provider.state).toBe("failed");
      expect(base.categories.state).toBe(name === "categories" ? "loaded" : "not-requested");
      expect(base.subCategories.state).toBe(name === "categories" ? "loaded" : "not-requested");
      expect(base.models.state).toBe(name === "categories" ? "loaded" : "not-requested");
      expect(base.subModeledElements.state).toBe("not-requested");

      gate = new ResolvablePromise<void>();
      const retry = load();
      expect(provider.state).toBe("requested");
      gate.resolveSync();
      await retry;
      expect(provider.state).toBe("loaded");
    });
  });
});

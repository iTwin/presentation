/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryReaderOptions, ECSqlQueryRow } from "@itwin/presentation-shared";
import { createHiliteSetProvider, HiliteSetProvider } from "../unified-selection/HiliteSetProvider.js";
import { SelectableInstanceKey, Selectables } from "../unified-selection/Selectable.js";
import { createCustomSelectable, createECInstanceId, createSelectableInstanceKey } from "./_helpers/SelectablesCreator.js";

describe("HiliteSetProvider", () => {
  describe("create", () => {
    it("creates a new HiliteSetProvider instance", () => {
      const imodelAccess = {
        createQueryReader: vi.fn<(query: ECSqlQueryDef, options?: ECSqlQueryReaderOptions) => ReturnType<ECSqlQueryExecutor["createQueryReader"]>>(),
        classDerivesFrom: vi.fn<(cn: string, parentCn: string) => Promise<boolean> | boolean>(),
      };
      const result = createHiliteSetProvider({ imodelAccess });
      expect(result).toBeDefined();
    });
  });

  describe("getHiliteSet", () => {
    const imodelAccess = {
      createQueryReader: vi.fn<(query: ECSqlQueryDef, options?: ECSqlQueryReaderOptions) => ReturnType<ECSqlQueryExecutor["createQueryReader"]>>(),
      classDerivesFrom: vi.fn<(cn: string, parentCn: string) => Promise<boolean> | boolean>(),
    };
    let provider: HiliteSetProvider;

    async function* createFakeQueryReader<TRow extends {} = ECSqlQueryRow>(
      rows: (TRow | Promise<TRow>)[],
    ): ReturnType<ECSqlQueryExecutor["createQueryReader"]> {
      // eslint-disable-next-line @typescript-eslint/await-thenable
      for await (const row of rows) {
        yield row;
      }
    }

    function mockQuery(
      modelKeys: (string | Promise<string>)[],
      subCategoryKeys: (string | Promise<string>)[],
      elementKeys: (string | Promise<string>)[],
      functionalElementKeys: (string | Promise<string>)[] = [],
    ) {
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      const toQueryResponse = (k: string | Promise<string>) => {
        if (typeof k === "string") {
          return { ["ECInstanceId"]: k };
        }
        return k.then((x) => ({ ["ECInstanceId"]: x }));
      };

      imodelAccess.createQueryReader.mockImplementation((query: ECSqlQueryDef) => {
        if (query.ecsql.includes("Models")) {
          return createFakeQueryReader(modelKeys.map(toQueryResponse));
        }
        if (query.ecsql.includes("SubCategories")) {
          return createFakeQueryReader(subCategoryKeys.map(toQueryResponse));
        }
        if (query.ecsql.includes("ElementGeometricElements")) {
          return createFakeQueryReader(elementKeys.map(toQueryResponse));
        }
        if (query.ecsql.includes("FunctionalElement")) {
          return createFakeQueryReader<ECSqlQueryRow>(functionalElementKeys.map((k) => ({ ["ECInstanceId"]: k }) as unknown as ECSqlQueryRow));
        }
        return createFakeQueryReader([]);
      });
    }

    async function loadHiliteSet(selectables: Selectables) {
      const iterator = provider.getHiliteSet({ selectables });

      const models: string[] = [];
      const subCategories: string[] = [];
      const elements: string[] = [];

      for await (const set of iterator) {
        models.push(...set.models);
        subCategories.push(...set.subCategories);
        elements.push(...set.elements);
      }

      return {
        models,
        subCategories,
        elements,
      };
    }

    beforeEach(() => {
      imodelAccess.classDerivesFrom.mockReturnValue(false);
      provider = createHiliteSetProvider({ imodelAccess });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe("Hilites element", () => {
      it("creates result for `Element` keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation(async (cn, pc) =>
          cn === elementKey.className && pc === "BisCore.Element" ? Promise.resolve(true) : false,
        );
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).toHaveLength(0);
        expect(result.subCategories).toHaveLength(0);
        expect(result.elements).toEqual([resultKey]);
      });

      it("creates result for `GroupInformationElement` element keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === elementKey.className && pc === "BisCore.GroupInformationElement");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).toHaveLength(0);
        expect(result.subCategories).toHaveLength(0);
        expect(result.elements).toEqual([resultKey]);
      });

      it("creates result for `GeometricElement` element child keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === elementKey.className && pc === "BisCore.GeometricElement");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).toHaveLength(0);
        expect(result.subCategories).toHaveLength(0);
        expect(result.elements).toEqual([resultKey]);
      });
    });

    describe("Hilites `FunctionalElement`", () => {
      it("creates result for `FunctionalElement` keys when `Functional` schema exists", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === elementKey.className && pc === "Functional.FunctionalElement");
        mockQuery([], [], [resultKey], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).toHaveLength(0);
        expect(result.subCategories).toHaveLength(0);
        expect(result.elements).toEqual([resultKey]);
      });
    });

    describe("Hilites model", () => {
      it("creates result for `Model` keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const modelKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === elementKey.className && pc === "BisCore.Model");
        mockQuery([modelKey], [], []);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).toHaveLength(0);
        expect(result.subCategories).toHaveLength(0);
        expect(result.models).toEqual([modelKey]);
      });

      it("creates result for `Subject` model keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const modelKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === elementKey.className && pc === "BisCore.Subject");
        mockQuery([modelKey], [], []);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).toHaveLength(0);
        expect(result.subCategories).toHaveLength(0);
        expect(result.models).toEqual([modelKey]);
      });
    });

    describe("Hilites subcategories", () => {
      it("creates result for `SubCategory` keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const subCategoryKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === elementKey.className && pc === "BisCore.SubCategory");
        mockQuery([], [subCategoryKey], []);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).toHaveLength(0);
        expect(result.elements).toHaveLength(0);
        expect(result.subCategories).toEqual([subCategoryKey]);
      });

      it("creates result for `Category` subcategory keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const subCategoryKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === elementKey.className && pc === "BisCore.Category");
        mockQuery([], [subCategoryKey], []);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).toHaveLength(0);
        expect(result.elements).toHaveLength(0);
        expect(result.subCategories).toEqual([subCategoryKey]);
      });
    });

    describe("Hilites custom selectable items", () => {
      it("creates result for custom selectable", async () => {
        const modelKey = createSelectableInstanceKey(1, "TestSchema.TestModel");
        const categoryKey = createSelectableInstanceKey(1, "TestSchema.TestCategory");
        const elementKey = createSelectableInstanceKey(1, "TestSchema.TestElement");

        const customSelectable = createCustomSelectable(1);
        customSelectable.loadInstanceKeys = async function* () {
          yield modelKey;
          yield categoryKey;
          yield elementKey;
        };

        const modelResultKey = createECInstanceId(2);
        const categoryResultKey = createECInstanceId(2);
        const elementResultKey = createECInstanceId(2);

        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => {
          if (cn === modelKey.className && pc === "BisCore.Model") {
            return true;
          }
          if (cn === categoryKey.className && pc === "BisCore.Category") {
            return true;
          }
          if (cn === elementKey.className && pc === "BisCore.Element") {
            return true;
          }
          return false;
        });
        mockQuery([modelResultKey], [categoryResultKey], [elementResultKey]);

        const selection = Selectables.create([customSelectable]);
        const result = await loadHiliteSet(selection);
        expect(result.models).toEqual([modelResultKey]);
        expect(result.subCategories).toEqual([categoryResultKey]);
        expect(result.elements).toEqual([elementResultKey]);
      });
    });

    describe("Other", () => {
      it("ignores unknown type", async () => {
        const elementKey = createSelectableInstanceKey(1);
        imodelAccess.classDerivesFrom.mockReturnValue(false);
        mockQuery([createECInstanceId(2)], [createECInstanceId(3)], [createECInstanceId(4)]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).toHaveLength(0);
        expect(result.subCategories).toHaveLength(0);
        expect(result.models).toHaveLength(0);
      });

      it("ignores key whose class hierarchy check throws with 'Schema not found' error", async () => {
        const elementKey = createSelectableInstanceKey(1);
        imodelAccess.classDerivesFrom.mockImplementation(() => {
          throw new Error(`Schema "Test" not found`);
        });
        mockQuery([createECInstanceId(2)], [createECInstanceId(3)], [createECInstanceId(4)]);

        const result = await loadHiliteSet(Selectables.create([elementKey]));
        expect(result.elements).toHaveLength(0);
        expect(result.subCategories).toHaveLength(0);
        expect(result.models).toHaveLength(0);
      });

      it("caches class type with `:` separator", async () => {
        const className = "TestSchema:TestClass";
        const elementKeys = [createSelectableInstanceKey(1, className), createSelectableInstanceKey(2, className)];
        const resultKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === "TestSchema.TestClass" && pc === "BisCore.Subject");
        mockQuery([resultKey], [], []);

        const selection = Selectables.create(elementKeys);
        const result = await loadHiliteSet(selection);
        expect(imodelAccess.classDerivesFrom).toHaveBeenCalledTimes(1);
        expect(result.models).toEqual([resultKey]);
        expect(result.subCategories).toHaveLength(0);
        expect(result.elements).toHaveLength(0);
      });

      it("caches class type with `.` separator", async () => {
        const className = "TestSchema.TestClass";
        const elementKeys = [createSelectableInstanceKey(1, className), createSelectableInstanceKey(2, className)];
        const resultKey = createECInstanceId(2);
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === "TestSchema.TestClass" && pc === "BisCore.Subject");
        mockQuery([resultKey], [], []);

        const selection = Selectables.create(elementKeys);
        const result = await loadHiliteSet(selection);
        expect(imodelAccess.classDerivesFrom).toHaveBeenCalledTimes(1);
        expect(result.models).toEqual([resultKey]);
        expect(result.subCategories).toHaveLength(0);
        expect(result.elements).toHaveLength(0);
      });

      it("uses InVirtualSet when 1000 or more ids passed", async () => {
        const elementKeys: SelectableInstanceKey[] = [];
        const resultKey = createECInstanceId(2);
        for (let i = 1; i <= 1001; i++) {
          elementKeys.push(createSelectableInstanceKey(i));
        }
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === elementKeys[0].className && pc === "BisCore.Element");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create(elementKeys);
        const result = await loadHiliteSet(selection);
        expect(result.models).toHaveLength(0);
        expect(result.subCategories).toHaveLength(0);
        expect(result.elements).toEqual([resultKey]);
        expect(imodelAccess.createQueryReader).toHaveBeenCalledWith(
          expect.objectContaining({
            ctes: expect.arrayContaining([expect.stringContaining("InVirtualSet")]),
          }),
          expect.anything(),
        );
      });

      it("doesn't output duplicate instance IDs", async () => {
        const elementKey1 = createSelectableInstanceKey(1, "TestSchema:TestClass");
        const customElement1 = createCustomSelectable(1, [{ className: "TestSchema:TestClass", id: "0x1" }]);

        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === "TestSchema.TestClass" && pc === "BisCore.Element");
        mockQuery([], [], ["0x1"]);

        const selection = Selectables.create([elementKey1, customElement1]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).toEqual(["0x1"]);
      });

      it("returns values in time intervals", async () => {
        vi.useFakeTimers();
        const elementPromises = [new ResolvablePromise<string>(), new ResolvablePromise<string>()];
        const elementKeys = [1, 2].map((i) => createSelectableInstanceKey(i, "TestSchema:TestElement"));

        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === "TestSchema.TestElement" && pc === "BisCore.Element");
        mockQuery([], [], elementPromises);

        const selectables = Selectables.create(elementKeys);
        const iter = provider.getHiliteSet({ selectables });
        elementPromises[0].resolveSync(elementKeys[0].id);

        const nextValuePromise = iter.next();
        await expect(Promise.race([nextValuePromise, vi.advanceTimersByTimeAsync(5).then(() => "timeout")])).resolves.toBe("timeout");

        await vi.advanceTimersByTimeAsync(15);
        elementPromises[1].resolveSync(elementKeys[1].id);
        await expect(nextValuePromise).resolves.toEqual({
          done: false,
          value: {
            models: [],
            subCategories: [],
            elements: elementKeys.map((x) => x.id),
          },
        });
        expect((await iter.next()).done).toBe(true);
      });

      it("rethrows ECClassHierarchyInspector errors", async () => {
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => {
          if (cn === "TestSchema.TestElement" && pc === "BisCore.Element") {
            throw new Error("dummy error");
          }
          return false;
        });
        mockQuery([], [], []);
        const selectables = Selectables.create([createSelectableInstanceKey(1, "TestSchema:TestElement")]);
        await expect(loadHiliteSet(selectables)).rejects.toThrow();
      });

      it("rethrows errors thrown by query observables", async () => {
        imodelAccess.classDerivesFrom.mockImplementation((cn, pc) => cn === "TestSchema.TestElement" && pc === "BisCore.Element");
        mockQuery([], [], [Promise.reject(new Error("dummy error"))]);

        const selectables = Selectables.create([createSelectableInstanceKey(1, "TestSchema:TestElement")]);
        await expect(loadHiliteSet(selectables)).rejects.toThrow();
      });
    });
  });
});

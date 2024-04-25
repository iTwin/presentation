/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ResolvablePromise } from "presentation-test-utilities";
import sinon from "sinon";
import { createHiliteSetProvider, HiliteSetProvider } from "../unified-selection/HiliteSetProvider";
import { ECClass, ECSchema } from "../unified-selection/queries/ECMetadata";
import { ECSqlQueryDef, ECSqlQueryReader, ECSqlQueryReaderOptions, ECSqlQueryRow } from "../unified-selection/queries/ECSqlCore";
import { SelectableInstanceKey, Selectables } from "../unified-selection/Selectable";
import { createCustomSelectable, createECInstanceId, createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

describe("HiliteSetProvider", () => {
  describe("create", () => {
    it("creates a new HiliteSetProvider instance", () => {
      const imodelAccess = {
        createQueryReader: sinon.stub<[ECSqlQueryDef, ECSqlQueryReaderOptions | undefined], ECSqlQueryReader>(),
        getSchema: sinon.stub<[string], Promise<ECSchema | undefined>>(),
      };
      const result = createHiliteSetProvider({ imodelAccess });
      expect(result).to.not.be.undefined;
    });
  });

  describe("getHiliteSet", () => {
    const imodelAccess = {
      createQueryReader: sinon.stub<[ECSqlQueryDef, ECSqlQueryReaderOptions | undefined], ECSqlQueryReader>(),
      getSchema: sinon.stub<[string], Promise<ECSchema | undefined>>(),
    };
    let provider: HiliteSetProvider;
    const schemaMock = {
      getClass: sinon.stub<[string], Promise<ECClass | undefined>>(),
    };

    async function* createFakeQueryReader<TRow extends {} = ECSqlQueryRow>(rows: (TRow | Promise<TRow>)[]): ECSqlQueryReader {
      for await (const row of rows) {
        yield row;
      }
    }

    function mockClass(className: string, baseClassSchema: string, baseClassName: string) {
      const classMock = {
        is: (baseClass: string, baseSchema: string) => {
          return baseClass === baseClassName && baseSchema === baseClassSchema;
        },
      };

      schemaMock.getClass.withArgs(className).returns(Promise.resolve(classMock as unknown as ECClass));
    }

    function mockQuery(modelKeys: (string | Promise<string>)[], subCategoryKeys: (string | Promise<string>)[], elementKeys: (string | Promise<string>)[]) {
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      const toQueryResponse = (k: string | Promise<string>) => {
        if (typeof k === "string") {
          return { ["ECInstanceId"]: k };
        }
        return k.then((x) => ({ ["ECInstanceId"]: x }));
      };

      imodelAccess.createQueryReader
        .withArgs(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("Models")))
        .returns(createFakeQueryReader(modelKeys.map(toQueryResponse)));
      imodelAccess.createQueryReader
        .withArgs(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("SubCategories")))
        .returns(createFakeQueryReader(subCategoryKeys.map(toQueryResponse)));
      imodelAccess.createQueryReader
        .withArgs(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("ElementGeometricElements")))
        .returns(createFakeQueryReader(elementKeys.map(toQueryResponse)));
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
      imodelAccess.createQueryReader.reset();
      imodelAccess.getSchema.reset();
      schemaMock.getClass.reset();

      imodelAccess.getSchema.returns(Promise.resolve(schemaMock as unknown as ECSchema));
      imodelAccess.getSchema.withArgs("Functional").returns(Promise.resolve(undefined));
      provider = createHiliteSetProvider({ imodelAccess });
    });

    afterEach(() => {
      sinon.restore();
    });

    describe("Hilites element", () => {
      it("creates result for `Element` keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "Element");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.elements).to.deep.eq([resultKey]);
      });

      it("creates result for `GroupInformationElement` element keys", async () => {
        imodelAccess.getSchema.withArgs("Functional").returns(Promise.resolve({} as unknown as ECSchema));
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "GroupInformationElement");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.elements).to.deep.eq([resultKey]);
      });

      it("creates result for `GeometricElement` element child keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "GeometricElement");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.elements).to.deep.eq([resultKey]);
      });
    });

    describe("Hilites `FunctionalElement`", () => {
      it("creates result for `FunctionalElement` keys when `Functional` schema exists", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);

        imodelAccess.getSchema.withArgs("Functional").returns(Promise.resolve({} as unknown as ECSchema));
        imodelAccess.createQueryReader
          .withArgs(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("FunctionalElement")))
          .returns(createFakeQueryReader<ECSqlQueryRow>([{ ["ECInstanceId"]: resultKey }]));

        mockClass("TestClass", "Functional", "FunctionalElement");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.elements).to.deep.eq([resultKey]);
      });
    });

    describe("Hilites model", () => {
      it("creates result for `Model` keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const modelKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "Model");
        mockQuery([modelKey], [], []);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.models).to.deep.eq([modelKey]);
      });

      it("creates result for `Subject` model keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const modelKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "Subject");
        mockQuery([modelKey], [], []);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.models).to.deep.eq([modelKey]);
      });
    });

    describe("Hilites subcategories", () => {
      it("creates result for `SubCategory` keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const subCategoryKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "SubCategory");
        mockQuery([], [subCategoryKey], []);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.elements).to.be.empty;
        expect(result.subCategories).to.deep.eq([subCategoryKey]);
      });

      it("creates result for `Category` subcategory keys", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const subCategoryKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "Category");
        mockQuery([], [subCategoryKey], []);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.elements).to.be.empty;
        expect(result.subCategories).to.deep.eq([subCategoryKey]);
      });
    });

    describe("Hilites custom selectable items", () => {
      it("creates result for custom selectable", async () => {
        const modelKey = createSelectableInstanceKey(1, "TestSchema:TestModel");
        const categoryKey = createSelectableInstanceKey(1, "TestSchema:TestCategory");
        const elementKey = createSelectableInstanceKey(1, "TestSchema:TestElement");

        const customSelectable = createCustomSelectable(1);
        customSelectable.loadInstanceKeys = async function* () {
          yield modelKey;
          yield categoryKey;
          yield elementKey;
        };

        const modelResultKey = createECInstanceId(2);
        const categoryResultKey = createECInstanceId(2);
        const elementResultKey = createECInstanceId(2);

        mockClass("TestModel", "BisCore", "Model");
        mockClass("TestCategory", "BisCore", "Category");
        mockClass("TestElement", "BisCore", "Element");
        mockQuery([modelResultKey], [categoryResultKey], [elementResultKey]);

        const selection = Selectables.create([customSelectable]);
        const result = await loadHiliteSet(selection);
        expect(result.models).to.deep.eq([modelResultKey]);
        expect(result.subCategories).to.deep.eq([categoryResultKey]);
        expect(result.elements).to.deep.eq([elementResultKey]);
      });
    });

    describe("Other", () => {
      it("ignores unknown type", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const modelKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "Unknown");
        mockQuery([modelKey], [modelKey], [modelKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.models).to.be.empty;
      });

      it("ignores unknown schema", async () => {
        imodelAccess.getSchema.returns(Promise.resolve(undefined));
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "Element");
        mockQuery([resultKey], [resultKey], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.models).to.be.empty;
      });

      it("ignores unknown class", async () => {
        schemaMock.getClass.returns(Promise.resolve(undefined));
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        mockQuery([resultKey], [resultKey], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.models).to.be.empty;
      });

      it("caches class type", async () => {
        const classMock = {
          is: (baseClass: string, baseSchema: string) => {
            return baseClass === "Element" && baseSchema === "BisCore";
          },
        };

        schemaMock.getClass.onCall(0).returns(Promise.resolve(classMock as unknown as ECClass));

        const elementKey1 = createSelectableInstanceKey(1);
        const elementKey2 = createSelectableInstanceKey(2);
        const resultKey = createECInstanceId(2);
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey1, elementKey2]);
        const result = await loadHiliteSet(selection);
        expect(schemaMock.getClass).to.be.calledOnce;
        expect(result.models).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.elements).to.deep.eq([resultKey]);
      });

      it("uses InVirtualSet when 1000 or more ids passed", async () => {
        const elementKeys: SelectableInstanceKey[] = [];
        const resultKey = createECInstanceId(2);
        for (let i = 1; i <= 1001; i++) {
          elementKeys.push(createSelectableInstanceKey(i));
        }
        mockClass("TestClass", "BisCore", "Element");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create(elementKeys);
        const result = await loadHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.elements).to.deep.eq([resultKey]);
        expect(imodelAccess.createQueryReader).to.be.calledWith(sinon.match((query: ECSqlQueryDef) => query.ctes!.some((cte) => cte.includes("InVirtualSet"))));
      });

      it("doesn't output duplicate instance IDs", async () => {
        const elementKey1 = createSelectableInstanceKey(1, "TestSchema:TestClass");
        const customElement1 = createCustomSelectable(1, [{ className: "TestSchema:TestClass", id: "0x1" }]);

        mockClass("TestClass", "BisCore", "Element");
        mockQuery([], [], ["0x1"]);

        const selection = Selectables.create([elementKey1, customElement1]);
        const result = await loadHiliteSet(selection);
        expect(result.elements).to.deep.eq(["0x1"]);
      });

      it("returns values in time intervals", async () => {
        const timers = sinon.useFakeTimers();
        const elementPromises = [new ResolvablePromise<string>(), new ResolvablePromise<string>()];
        const elementKeys = [1, 2].map((i) => createSelectableInstanceKey(i, "TestSchema:TestElement"));

        mockClass("TestElement", "BisCore", "Element");
        mockQuery([], [], elementPromises);

        const selectables = Selectables.create(elementKeys);
        const iter = provider.getHiliteSet({ selectables });
        elementPromises[0].resolveSync(elementKeys[0].id);

        const nextValuePromise = iter.next();
        await expect(Promise.race([nextValuePromise, timers.tickAsync(5).then(() => "timeout")])).to.eventually.eq("timeout");

        await timers.tickAsync(15);
        elementPromises[1].resolveSync(elementKeys[1].id);
        await expect(nextValuePromise).to.eventually.deep.eq({
          done: false,
          value: {
            models: [],
            subCategories: [],
            elements: elementKeys.map((x) => x.id),
          },
        });
        expect((await iter.next()).done).to.be.true;
      });

      it("rethrows errors thrown by query observables", async () => {
        mockClass("TestElement", "BisCore", "Element");
        mockQuery([], [], [Promise.reject("dummy error")]);

        const selectables = Selectables.create([createSelectableInstanceKey(1, "TestSchema:TestElement")]);
        await expect(loadHiliteSet(selectables)).to.be.rejected;
      });
    });
  });
});

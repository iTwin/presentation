/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { HiliteSetProvider } from "../unified-selection/HiliteSetProvider";
import { ECClass, ECSchema } from "../unified-selection/queries/ECMetadata";
import { ECSqlBinding, ECSqlQueryReader, ECSqlQueryReaderOptions, ECSqlQueryRow } from "../unified-selection/queries/ECSqlCore";
import { SelectableInstanceKey, Selectables } from "../unified-selection/Selectable";
import { createCustomSelectable, createECInstanceId, createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

describe("HiliteSetProvider", () => {
  describe("create", () => {
    it("creates a new HiliteSetProvider instance", () => {
      const queryExecutor = {
        createQueryReader: sinon.stub<[string, ECSqlBinding[] | undefined, ECSqlQueryReaderOptions | undefined], ECSqlQueryReader>(),
      };
      const metadataProvider = {
        getSchema: sinon.stub<[string], Promise<ECSchema | undefined>>(),
      };
      const result = HiliteSetProvider.create({ queryExecutor, metadataProvider });
      expect(result).to.not.be.undefined;
      expect(result instanceof HiliteSetProvider).to.be.true;
    });
  });

  describe("getHiliteSet", () => {
    const queryExecutor = {
      createQueryReader: sinon.stub<[string, ECSqlBinding[] | undefined, ECSqlQueryReaderOptions | undefined], ECSqlQueryReader>(),
    };
    const metadataProvider = {
      getSchema: sinon.stub<[string], Promise<ECSchema | undefined>>(),
    };
    let provider: HiliteSetProvider;
    let schemaMock = {
      getClass: sinon.stub<[string], Promise<ECClass | undefined>>(),
    };

    function createFakeQueryReader<TRow extends object>(rows: TRow[]): ECSqlQueryReader {
      return (async function* () {
        for (const row of rows) {
          yield row;
        }
      })();
    }

    function mockClass(className: string, baseClassSchema: string, baseClassName: string) {
      const classMock = {
        is: (baseClass: string, baseSchema: string) => {
          return baseClass === baseClassName && baseSchema === baseClassSchema;
        },
      };

      schemaMock.getClass.withArgs(className).returns(Promise.resolve(classMock as unknown as ECClass));
    }

    function mockQuery(modelKeys: string[], subCategoryKeys: string[], elementKeys: string[]) {
      queryExecutor.createQueryReader
        .withArgs(sinon.match((query: string) => query.includes("Models")))
        .returns(createFakeQueryReader<ECSqlQueryRow>(modelKeys.length === 0 ? [] : modelKeys.map((k) => ({ ["ECInstanceId"]: k }))));
      queryExecutor.createQueryReader
        .withArgs(sinon.match((query: string) => query.includes("SubCategories")))
        .returns(createFakeQueryReader<ECSqlQueryRow>(subCategoryKeys.length === 0 ? [] : subCategoryKeys.map((k) => ({ ["ECInstanceId"]: k }))));
      queryExecutor.createQueryReader
        .withArgs(sinon.match((query: string) => query.includes("ElementGeometricElements")))
        .returns(createFakeQueryReader<ECSqlQueryRow>(elementKeys.length === 0 ? [] : elementKeys.map((k) => ({ ["ECInstanceId"]: k }))));
    }

    beforeEach(() => {
      queryExecutor.createQueryReader.reset();
      metadataProvider.getSchema.reset();

      schemaMock = {
        getClass: sinon.stub<[string], Promise<ECClass | undefined>>(),
      };
      metadataProvider.getSchema.returns(Promise.resolve(schemaMock as unknown as ECSchema));
      metadataProvider.getSchema.withArgs("Functional").returns(Promise.resolve(undefined));
      provider = HiliteSetProvider.create({ queryExecutor, metadataProvider });
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
        const result = await provider.getHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.elements).to.deep.eq([resultKey]);
      });

      it("creates result for `GroupInformationElement` element keys", async () => {
        metadataProvider.getSchema.withArgs("Functional").returns(Promise.resolve({} as unknown as ECSchema));
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "GroupInformationElement");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await provider.getHiliteSet(selection);
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
        const result = await provider.getHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.elements).to.deep.eq([resultKey]);
      });
    });

    describe("Hilites `FunctionalElement`", () => {
      it("creates result for `FunctionalElement` keys when `Functional` schema exists", async () => {
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);

        metadataProvider.getSchema.withArgs("Functional").returns(Promise.resolve({} as unknown as ECSchema));
        queryExecutor.createQueryReader
          .withArgs(sinon.match((query: string) => query.includes("FunctionalElement")))
          .returns(createFakeQueryReader<ECSqlQueryRow>([{ ["ECInstanceId"]: resultKey }]));

        mockClass("TestClass", "Functional", "FunctionalElement");
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await provider.getHiliteSet(selection);
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
        const result = await provider.getHiliteSet(selection);
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
        const result = await provider.getHiliteSet(selection);
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
        const result = await provider.getHiliteSet(selection);
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
        const result = await provider.getHiliteSet(selection);
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
        const result = await provider.getHiliteSet(selection);
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
        const result = await provider.getHiliteSet(selection);
        expect(result.elements).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.models).to.be.empty;
      });

      it("ignores unknown schema", async () => {
        metadataProvider.getSchema.returns(Promise.resolve(undefined));
        const elementKey = createSelectableInstanceKey(1);
        const resultKey = createECInstanceId(2);
        mockClass("TestClass", "BisCore", "Element");
        mockQuery([resultKey], [resultKey], [resultKey]);

        const selection = Selectables.create([elementKey]);
        const result = await provider.getHiliteSet(selection);
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
        const result = await provider.getHiliteSet(selection);
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
        schemaMock.getClass.onCall(1).throws();

        const elementKey1 = createSelectableInstanceKey(1);
        const elementKey2 = createSelectableInstanceKey(2);
        const resultKey = createECInstanceId(2);
        mockQuery([], [], [resultKey]);

        const selection = Selectables.create([elementKey1, elementKey2]);
        const result = await provider.getHiliteSet(selection);
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
        const result = await provider.getHiliteSet(selection);
        expect(result.models).to.be.empty;
        expect(result.subCategories).to.be.empty;
        expect(result.elements).to.deep.eq([resultKey]);
        expect(queryExecutor.createQueryReader).to.be.calledWithMatch(
          sinon.match((query: string) => query.includes("InVirtualSet")),
          sinon.match.any,
        );
      });
    });
  });
});

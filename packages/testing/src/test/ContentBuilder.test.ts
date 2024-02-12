/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { ArrayValue, PrimitiveValue, StructValue } from "@itwin/appui-abstract";
import { BeEvent, BeUiEvent, Guid, Id64String } from "@itwin/core-bentley";
import { ECSqlReader } from "@itwin/core-common";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import {
  ArrayTypeDescription,
  CategoryDescription,
  Content,
  Descriptor,
  DisplayValuesMap,
  Field,
  Item,
  KeySet,
  PrimitiveTypeDescription,
  PropertyValueFormat,
  RegisteredRuleset,
  Ruleset,
  StructTypeDescription,
  TypeDescription,
  ValuesMap,
} from "@itwin/presentation-common";
import { ContentDataProvider } from "@itwin/presentation-components";
import { Presentation, PresentationManager, RulesetManager } from "@itwin/presentation-frontend";
import { ContentBuilder, IContentBuilderDataProvider } from "../presentation-testing/ContentBuilder";
import { createStub } from "./Utils";

class EmptyDataProvider implements IContentBuilderDataProvider {
  // Verifies that given keyset matches a template, otherwise it throws an error
  private _keyVerificationFunction: ((keyset: KeySet) => void) | undefined;

  constructor(keyVerificationFunction?: (keyset: KeySet) => void) {
    this._keyVerificationFunction = keyVerificationFunction;
  }

  private _keyset: KeySet | undefined;
  public getContentSetSize = async () => 0;
  public getContent = async (): Promise<Readonly<Content> | undefined> => undefined;

  public set keys(keyset: KeySet) {
    if (this._keyVerificationFunction) {
      this._keyVerificationFunction(keyset);
    }
    this._keyset = keyset;
  }
  public get keys() {
    return this._keyset ? this._keyset : new KeySet();
  }
}

interface ItemValues {
  rawValues: ValuesMap;
  displayValues: DisplayValuesMap;
}

function createItemValues(rawValuesArr: ValuesMap[]): ItemValues[] {
  return rawValuesArr.map((rawValues) => ({
    rawValues,
    displayValues: {},
  }));
}

function createItem({ rawValues, displayValues }: ItemValues) {
  for (const key in rawValues) {
    if (rawValues.hasOwnProperty(key) && !displayValues.hasOwnProperty(key)) {
      displayValues[key] = "";
    }
  }
  return new Item(
    Object.keys(rawValues).map((key) => ({ className: "testClass", id: key })),
    "Test class",
    "",
    undefined,
    rawValues,
    displayValues,
    [],
  );
}

async function getContent(items: ItemValues[], descriptor: Descriptor) {
  return new Content(descriptor, items.map(createItem));
}

const createCategoryDescription = (): CategoryDescription => ({
  name: "test",
  label: "test",
  priority: 1,
  description: "",
  expand: false,
});

const createPrimitiveTypeDescription = (typeName: string): PrimitiveTypeDescription => ({
  valueFormat: PropertyValueFormat.Primitive,
  typeName,
});
const createStringTypeDescription = () => createPrimitiveTypeDescription("string");
const createIntTypeDescription = () => createPrimitiveTypeDescription("int");
const createDoubleTypeDescription = () => createPrimitiveTypeDescription("double");
const createPoint2dTypeDescription = () => createPrimitiveTypeDescription("pt2d");
const createPoint3dTypeDescription = () => createPrimitiveTypeDescription("pt3d");

const createArrayTypeDescription = (itemType: TypeDescription): ArrayTypeDescription => ({
  valueFormat: PropertyValueFormat.Array,
  typeName: "array",
  memberType: itemType,
});

const createStructTypeDescription = (members: { [name: string]: TypeDescription }): StructTypeDescription => ({
  valueFormat: PropertyValueFormat.Struct,
  typeName: "struct",
  members: Object.keys(members).map((key) => ({ name: key, label: key, type: members[key] })),
});

const createContentDescriptor = () => {
  const category = createCategoryDescription();
  return new Descriptor({
    displayType: "Grid",
    selectClasses: [],
    categories: [category],
    fields: [
      new Field(category, "width", "width", createStringTypeDescription(), false, 1),
      new Field(category, "title", "title", createStringTypeDescription(), false, 1),
      new Field(category, "radius", "radius", createStringTypeDescription(), false, 1),
    ],
    contentFlags: 1,
  });
};

class DataProvider extends EmptyDataProvider {
  public descriptor = createContentDescriptor();
  public values = [
    { title: "Item", height: 15, width: 16 },
    { title: "Circle", radius: 13 },
  ];
  public override getContentSetSize = async () => this.values.length;
  public override getContent = async () => getContent(createItemValues(this.values), this.descriptor);
}

interface TestInstance {
  schemaName: string;
  className: string;
  ids: Array<{ id: Id64String }>;
}

function verifyInstanceKey(instanceKey: [string, Set<string>], instances: TestInstance[]) {
  const className = instanceKey[0];
  const ids = Array.from(instanceKey[1].values());
  for (const instance of instances) {
    if (`${instance.schemaName}:${instance.className}` === className) {
      for (const idEntry of instance.ids) {
        if (!ids.includes(idEntry.id)) {
          throw new Error(`Wrong id provided - '${idEntry.id}'`);
        }
      }
      return;
    }
  }
  throw new Error(`Wrong className provided - '${className}'`);
}

function verifyKeyset(keyset: KeySet, testInstances: TestInstance[], verificationSpy: sinon.SinonSpy) {
  verificationSpy();
  for (const entry of keyset.instanceKeys.entries()) {
    verifyInstanceKey(entry, testInstances);
  }
}

function createThrowingQueryReader(): IModelConnection["createQueryReader"] {
  return (query) => {
    if (query.includes("SELECT s.Name")) {
      return {
        toArray: async () => {
          throw new Error("Test error");
        },
      } as unknown as ECSqlReader;
    }
    return {
      toArray: async () => [],
    } as unknown as ECSqlReader;
  };
}

function createFakeQueryReaders(instances: TestInstance[]): IModelConnection["createQueryReader"] {
  return (query) => {
    if (query.includes("SELECT s.Name")) {
      return {
        toArray: async () => instances,
      } as ECSqlReader;
    }

    for (const entry of instances) {
      if (query.includes(`"${entry.schemaName}"."${entry.className}"`)) {
        return {
          toArray: async () => entry.ids.map((e) => e.id),
        } as ECSqlReader;
      }
    }

    return {
      toArray: async () => [],
    } as unknown as ECSqlReader;
  };
}

describe("ContentBuilder", () => {
  const imodel = {
    createQueryReader: createStub<IModelConnection["createQueryReader"]>(),
  };

  const initialProps = {
    imodel: imodel as unknown as IModelConnection,
  };

  describe("createContent", () => {
    let presentationManager: sinon.SinonStubbedInstance<PresentationManager>;
    const rulesetManager = {
      add: createStub<RulesetManager["add"]>(),
    };

    beforeEach(() => {
      rulesetManager.add.callsFake(async (ruleset) => new RegisteredRuleset(ruleset, Guid.createValue(), () => {}));

      presentationManager = sinon.createStubInstance(PresentationManager);
      presentationManager.rulesets.returns(rulesetManager as unknown as RulesetManager);
      Object.assign(presentationManager, { onIModelContentChanged: new BeEvent() });

      sinon.stub(Presentation, "presentation").get(() => presentationManager);
    });

    afterEach(() => {
      sinon.restore();
    });

    it("registers ruleset when creating content", async () => {
      const ruleset: Ruleset = {
        id: "test-ruleset",
        rules: [],
      };
      const builder = new ContentBuilder({ ...initialProps, dataProvider: new EmptyDataProvider() });
      const content = await builder.createContent(ruleset, []);
      expect(content).to.be.empty;
      expect(rulesetManager.add).to.be.calledOnceWith(ruleset);
    });

    it("uses `ContentDataProvider` if data provider was not supplied", async () => {
      sinon.stub(IModelApp, "quantityFormatter").get(() => ({
        onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
      }));
      const getContentStub = sinon.stub(ContentDataProvider.prototype, "getContent").resolves(new Content(createContentDescriptor(), []));
      const builder = new ContentBuilder({ ...initialProps });

      const content = await builder.createContent("1", []);
      expect(content).to.be.empty;
      expect(getContentStub).to.be.calledOnce;
    });

    it("returns empty records when there is no content in the supplied data provider", async () => {
      const builder = new ContentBuilder({ ...initialProps, dataProvider: new EmptyDataProvider() });
      const content = await builder.createContent("1", []);
      expect(content).to.be.empty;
    });

    it("returns correct records when there is content in the supplied data provider", async () => {
      const dataProvider = new DataProvider();
      const builder = new ContentBuilder({ ...initialProps, dataProvider });
      const content = await builder.createContent("1", []);
      expect(content.length).to.equal(dataProvider.values.length * dataProvider.descriptor.fields.length);
    });

    it("rounds raw numeric values to supplied decimal precision", async () => {
      const testValues = [
        { name: "not-set", value: undefined, displayValue: "", type: createDoubleTypeDescription() },
        { name: "int", value: 1, displayValue: "1.0", type: createIntTypeDescription() },
        { name: "doubleLowPrecision", value: 1.9, displayValue: "1.9", type: createDoubleTypeDescription() },
        { name: "doubleRoundedDown", value: 1.234, displayValue: "1.2", type: createDoubleTypeDescription() },
        { name: "doubleRoundedUp", value: 4.567, displayValue: "4.6", type: createDoubleTypeDescription() },
        {
          name: "doublesArray",
          value: [1.234, 4.567, 7.89],
          displayValue: ["1.2", "4.6", "7.9"],
          type: createArrayTypeDescription(createDoubleTypeDescription()),
        },
        { name: "doublesStruct", value: { a: 1.234 }, displayValue: { a: "1.2" }, type: createStructTypeDescription({ a: createDoubleTypeDescription() }) },
        { name: "point2d", value: [1.456, 4.789], displayValue: ["1.5", "4.8"], type: createPoint2dTypeDescription() },
        { name: "point3d", value: { x: 1.234, y: 4.567, z: 7.89 }, displayValue: { x: "1.2", y: "4.6", z: "7.9" }, type: createPoint3dTypeDescription() },
      ];
      const category = createCategoryDescription();
      const descriptor = new Descriptor({
        displayType: "",
        selectClasses: [],
        categories: [category],
        fields: testValues.map((v) => new Field(category, v.name, v.name, v.type, false, 1)),
        contentFlags: 1,
      });
      class TestDataProvider extends EmptyDataProvider {
        public readonly descriptor = descriptor;
        public readonly items = [
          testValues.reduce(
            (item, v) => {
              item.rawValues[v.name] = v.value;
              item.displayValues[v.name] = v.displayValue;
              return item;
            },
            { rawValues: {}, displayValues: {} } as ItemValues,
          ),
        ];
        public override getContentSetSize = async () => this.items.length;
        public override getContent = async () => getContent(this.items, this.descriptor);
      }
      const dataProvider = new TestDataProvider();
      const builder = new ContentBuilder({ ...initialProps, dataProvider, decimalPrecision: 2 });
      const content = await builder.createContent("", []);
      expect(content.length).to.eq(testValues.length);
      expect((content[0].value as PrimitiveValue).value).to.be.undefined;
      expect((content[1].value as PrimitiveValue).value).to.eq(1);
      expect((content[2].value as PrimitiveValue).value).to.eq(1.9);
      expect((content[3].value as PrimitiveValue).value).to.eq(1.23);
      expect((content[4].value as PrimitiveValue).value).to.eq(4.57);
      expect((content[5].value as ArrayValue).items.map((item) => (item.value as PrimitiveValue).value)).to.deep.eq([1.23, 4.57, 7.89]);
      expect(((content[6].value as StructValue).members.a.value as PrimitiveValue).value).to.deep.eq(1.23);
      expect((content[7].value as PrimitiveValue).value).to.deep.eq([1.46, 4.79]);
      expect((content[8].value as PrimitiveValue).value).to.deep.eq({ x: 1.23, y: 4.57, z: 7.89 });
    });
  });

  describe("[deprecated] createContentForAllClasses", () => {
    const testInstances: TestInstance[] = [
      {
        className: "Class1",
        schemaName: "Schema1",
        ids: [{ id: "0x2" }, { id: "0x3" }],
      },
      {
        className: "Class2",
        schemaName: "Schema2",
        ids: [{ id: "0x5" }, { id: "0x6" }],
      },
    ];

    before(() => {
      imodel.createQueryReader.reset();
      imodel.createQueryReader.callsFake(createFakeQueryReaders(testInstances));
    });

    it("returns all required instances with empty records", async () => {
      const verificationSpy = sinon.spy();

      const builder = new ContentBuilder({
        ...initialProps,
        dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
      });

      // eslint-disable-next-line deprecation/deprecation
      const content = await builder.createContentForAllInstances("1");

      expect(content.length).to.equal(2);

      expect(content.find((c) => c.className === "Schema1:Class1")).to.not.be.undefined;
      expect(content.find((c) => c.className === "Schema2:Class2")).to.not.be.undefined;

      expect(content[0].records).to.be.empty;
      expect(content[1].records).to.be.empty;

      expect(verificationSpy.calledTwice).to.be.true;
    });
  });

  describe("[deprecated] createContentForInstancePerClass", () => {
    context("test instances have ids", () => {
      const testInstances: TestInstance[] = [
        {
          className: "Class1",
          schemaName: "Schema1",
          ids: [{ id: "0x1" }],
        },
        {
          className: "Class2",
          schemaName: "Schema2",
          ids: [{ id: "0x9" }],
        },
      ];

      it("returns all required instances with empty records", async () => {
        imodel.createQueryReader.reset();
        imodel.createQueryReader.callsFake(createFakeQueryReaders(testInstances));

        const verificationSpy = sinon.spy();

        const builder = new ContentBuilder({
          ...initialProps,
          dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
        });

        // eslint-disable-next-line deprecation/deprecation
        const content = await builder.createContentForInstancePerClass("1");

        expect(content.length).to.equal(2);

        expect(content.find((c) => c.className === "Schema1:Class1")).to.not.be.undefined;
        expect(content.find((c) => c.className === "Schema2:Class2")).to.not.be.undefined;

        expect(content[0].records).to.be.empty;
        expect(content[1].records).to.be.empty;

        expect(verificationSpy.calledTwice).to.be.true;
      });

      it("throws when id query throws an unexpected error", async () => {
        imodel.createQueryReader.reset();
        imodel.createQueryReader.callsFake(createThrowingQueryReader());

        const verificationSpy = sinon.spy();

        const builder = new ContentBuilder({
          ...initialProps,
          dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
        });

        // eslint-disable-next-line deprecation/deprecation
        await expect(builder.createContentForInstancePerClass("1")).to.be.rejectedWith("Test error");
      });
    });

    context("test instances have no ids", () => {
      const testInstances: TestInstance[] = [{ className: "Class1", schemaName: "Schema1", ids: [] }];

      before(() => {
        imodel.createQueryReader.reset();
        imodel.createQueryReader.callsFake(createFakeQueryReaders(testInstances));
      });

      it("returns an empty list", async () => {
        const verificationSpy = sinon.spy();

        const builder = new ContentBuilder({
          ...initialProps,
          dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
        });

        // eslint-disable-next-line deprecation/deprecation
        const content = await builder.createContentForInstancePerClass("1");

        expect(content).to.be.empty;
        expect(verificationSpy.notCalled).to.be.true;
      });
    });
  });
});

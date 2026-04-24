/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, MockInstance, vi } from "vitest";
import { ArrayValue, PrimitiveValue, StructValue } from "@itwin/appui-abstract";
import { BeEvent, BeUiEvent, Guid, Id64String } from "@itwin/core-bentley";
import { ECSqlReader } from "@itwin/core-common";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import {
  ArrayTypeDescription,
  CategoryDescription,
  Content,
  Descriptor,
  DisplayValuesMap,
  Field,
  Item,
  KeySet,
  LabelDefinition,
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
import { ContentBuilder, IContentBuilderDataProvider } from "../presentation-testing/ContentBuilder.js";
import { createStub } from "./Utils.js";

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
  return rawValuesArr.map((rawValues) => ({ rawValues, displayValues: {} }));
}

function createItem({ rawValues, displayValues }: ItemValues) {
  for (const key in rawValues) {
    if (rawValues.hasOwnProperty(key) && !displayValues.hasOwnProperty(key)) {
      displayValues[key] = "";
    }
  }
  return new Item({
    primaryKeys: Object.keys(rawValues).map((key) => ({ className: "testClass", id: key })),
    label: LabelDefinition.fromLabelString("Test Class"),
    displayValues,
    values: rawValues,
    mergedFieldNames: [],
  });
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
      new Field({
        category,
        name: "width",
        label: "Width",
        type: createIntTypeDescription(),
        isReadonly: false,
        priority: 1,
      }),
      new Field({
        category,
        name: "title",
        label: "title",
        type: createStringTypeDescription(),
        isReadonly: false,
        priority: 1,
      }),
      new Field({
        category,
        name: "radius",
        label: "radius",
        type: createStringTypeDescription(),
        isReadonly: false,
        priority: 1,
      }),
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

function verifyKeyset(keyset: KeySet, testInstances: TestInstance[], verificationSpy: () => void) {
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
    return { toArray: async () => [] } as unknown as ECSqlReader;
  };
}

function createFakeQueryReaders(instances: TestInstance[]): IModelConnection["createQueryReader"] {
  return (query) => {
    if (query.includes("SELECT s.Name")) {
      return { toArray: async () => instances } as ECSqlReader;
    }

    for (const entry of instances) {
      if (query.includes(`"${entry.schemaName}"."${entry.className}"`)) {
        return { toArray: async () => entry.ids.map((e) => e.id) } as ECSqlReader;
      }
    }

    return { toArray: async () => [] } as unknown as ECSqlReader;
  };
}

describe("ContentBuilder", () => {
  const imodel = { createQueryReader: createStub<IModelConnection["createQueryReader"]>() };

  const initialProps = { imodel: imodel as unknown as IModelConnection };

  describe("createContent", () => {
    let presentationManager: { rulesets: MockInstance<() => RulesetManager>; onIModelContentChanged: BeEvent<any> };
    const rulesetManager = { add: createStub<RulesetManager["add"]>() };

    beforeEach(() => {
      rulesetManager.add.mockImplementation(
        async (ruleset) => new RegisteredRuleset(ruleset, Guid.createValue(), () => {}),
      );

      presentationManager = {
        rulesets: vi.fn<() => RulesetManager>().mockReturnValue(rulesetManager as unknown as RulesetManager),
        onIModelContentChanged: new BeEvent(),
      };

      vi.spyOn(Presentation, "presentation", "get").mockReturnValue(
        presentationManager as unknown as PresentationManager,
      );
    });

    it("registers ruleset when creating content", async () => {
      const ruleset: Ruleset = { id: "test-ruleset", rules: [] };
      const builder = new ContentBuilder({ ...initialProps, dataProvider: new EmptyDataProvider() });
      const content = await builder.createContent(ruleset, []);
      expect(content).toHaveLength(0);
      expect(rulesetManager.add).toHaveBeenCalledExactlyOnceWith(ruleset);
    });

    it("uses `ContentDataProvider` if data provider was not supplied", async () => {
      vi.spyOn(IModelApp, "quantityFormatter", "get").mockReturnValue({
        onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
      } as unknown as QuantityFormatter);
      const getContentStub = vi
        .spyOn(ContentDataProvider.prototype, "getContent")
        .mockResolvedValue(new Content(createContentDescriptor(), []));
      const builder = new ContentBuilder({ ...initialProps });

      const content = await builder.createContent("1", []);
      expect(content).toHaveLength(0);
      expect(getContentStub).toHaveBeenCalledOnce();
    });

    it("returns empty records when there is no content in the supplied data provider", async () => {
      const builder = new ContentBuilder({ ...initialProps, dataProvider: new EmptyDataProvider() });
      const content = await builder.createContent("1", []);
      expect(content).toHaveLength(0);
    });

    it("returns correct records when there is content in the supplied data provider", async () => {
      const dataProvider = new DataProvider();
      const builder = new ContentBuilder({ ...initialProps, dataProvider });
      const content = await builder.createContent("1", []);
      expect(content).toHaveLength(dataProvider.values.length * dataProvider.descriptor.fields.length);
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
        {
          name: "doublesStruct",
          value: { a: 1.234 },
          displayValue: { a: "1.2" },
          type: createStructTypeDescription({ a: createDoubleTypeDescription() }),
        },
        { name: "point2d", value: [1.456, 4.789], displayValue: ["1.5", "4.8"], type: createPoint2dTypeDescription() },
        {
          name: "point3d",
          value: { x: 1.234, y: 4.567, z: 7.89 },
          displayValue: { x: "1.2", y: "4.6", z: "7.9" },
          type: createPoint3dTypeDescription(),
        },
      ];
      const category = createCategoryDescription();
      const descriptor = new Descriptor({
        displayType: "",
        selectClasses: [],
        categories: [category],
        fields: testValues.map(
          (v) => new Field({ category, name: v.name, label: v.name, type: v.type, isReadonly: false, priority: 1 }),
        ),
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
            { rawValues: {}, displayValues: {} },
          ),
        ];
        public override getContentSetSize = async () => this.items.length;
        public override getContent = async () => getContent(this.items, this.descriptor);
      }
      const dataProvider = new TestDataProvider();
      const builder = new ContentBuilder({ ...initialProps, dataProvider, decimalPrecision: 2 });
      const content = await builder.createContent("", []);
      expect(content).toHaveLength(testValues.length);
      expect((content[0].value as PrimitiveValue).value).toBeUndefined();
      expect((content[1].value as PrimitiveValue).value).toBe(1);
      expect((content[2].value as PrimitiveValue).value).toBe(1.9);
      expect((content[3].value as PrimitiveValue).value).toBe(1.23);
      expect((content[4].value as PrimitiveValue).value).toBe(4.57);
      expect((content[5].value as ArrayValue).items.map((item) => (item.value as PrimitiveValue).value)).toEqual([
        1.23, 4.57, 7.89,
      ]);
      expect(((content[6].value as StructValue).members.a.value as PrimitiveValue).value).toEqual(1.23);
      expect((content[7].value as PrimitiveValue).value).toEqual([1.46, 4.79]);
      expect((content[8].value as PrimitiveValue).value).toEqual({ x: 1.23, y: 4.57, z: 7.89 });
    });
  });

  describe("[deprecated] createContentForAllClasses", () => {
    const testInstances: TestInstance[] = [
      { className: "Class1", schemaName: "Schema1", ids: [{ id: "0x2" }, { id: "0x3" }] },
      { className: "Class2", schemaName: "Schema2", ids: [{ id: "0x5" }, { id: "0x6" }] },
    ];

    beforeEach(() => {
      imodel.createQueryReader.mockImplementation(createFakeQueryReaders(testInstances));
    });

    it("returns all required instances with empty records", async () => {
      const verificationSpy = vi.fn();

      const builder = new ContentBuilder({
        ...initialProps,
        dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
      });

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const content = await builder.createContentForAllInstances("1");

      expect(content).toHaveLength(2);

      expect(content.find((c) => c.className === "Schema1:Class1")).toBeDefined();
      expect(content.find((c) => c.className === "Schema2:Class2")).toBeDefined();

      expect(content[0].records).toHaveLength(0);
      expect(content[1].records).toHaveLength(0);

      expect(verificationSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("[deprecated] createContentForInstancePerClass", () => {
    describe("test instances have ids", () => {
      const testInstances: TestInstance[] = [
        { className: "Class1", schemaName: "Schema1", ids: [{ id: "0x1" }] },
        { className: "Class2", schemaName: "Schema2", ids: [{ id: "0x9" }] },
      ];

      it("returns all required instances with empty records", async () => {
        imodel.createQueryReader.mockReset();
        imodel.createQueryReader.mockImplementation(createFakeQueryReaders(testInstances));

        const verificationSpy = vi.fn();

        const builder = new ContentBuilder({
          ...initialProps,
          dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
        });

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const content = await builder.createContentForInstancePerClass("1");

        expect(content).toHaveLength(2);

        expect(content.find((c) => c.className === "Schema1:Class1")).toBeDefined();
        expect(content.find((c) => c.className === "Schema2:Class2")).toBeDefined();

        expect(content[0].records).toHaveLength(0);
        expect(content[1].records).toHaveLength(0);

        expect(verificationSpy).toHaveBeenCalledTimes(2);
      });

      it("throws when id query throws an unexpected error", async () => {
        imodel.createQueryReader.mockReset();
        imodel.createQueryReader.mockImplementation(createThrowingQueryReader());

        const verificationSpy = vi.fn();

        const builder = new ContentBuilder({
          ...initialProps,
          dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
        });

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        await expect(builder.createContentForInstancePerClass("1")).rejects.toThrow("Test error");
      });
    });

    describe("test instances have no ids", () => {
      const testInstances: TestInstance[] = [{ className: "Class1", schemaName: "Schema1", ids: [] }];

      beforeEach(() => {
        imodel.createQueryReader.mockImplementation(createFakeQueryReaders(testInstances));
      });

      it("returns an empty list", async () => {
        const verificationSpy = vi.fn();

        const builder = new ContentBuilder({
          ...initialProps,
          dataProvider: new EmptyDataProvider((keyset: KeySet) => verifyKeyset(keyset, testInstances, verificationSpy)),
        });

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const content = await builder.createContentForInstancePerClass("1");

        expect(content).toHaveLength(0);
        expect(verificationSpy).not.toHaveBeenCalled();
      });
    });
  });
});

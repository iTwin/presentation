/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { PropertyRecord } from "@itwin/appui-abstract";
import { PropertyCategory } from "@itwin/components-react";
import { BeEvent, BeUiEvent, using } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import {
  ArrayTypeDescription,
  CategoryDescription,
  combineFieldNames,
  Content,
  ContentFlags,
  DisplayValue,
  Field,
  Item,
  Property,
  PropertyValueFormat,
  RelationshipMeaning,
  StructFieldMemberDescription,
  StructTypeDescription,
  TypeDescription,
  Value,
  ValuesDictionary,
} from "@itwin/presentation-common";
import { FavoritePropertiesManager, FavoritePropertiesScope, Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { CacheInvalidationProps } from "../../presentation-components/common/ContentDataProvider";
import { FAVORITES_CATEGORY_NAME } from "../../presentation-components/favorite-properties/Utils";
import { DEFAULT_PROPERTY_GRID_RULESET, PresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider";
import { createTestECClassInfo, createTestECInstanceKey, createTestPropertyInfo } from "../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestContentItem,
  createTestNestedContentField,
  createTestPropertiesContentField,
  createTestSimpleContentField,
} from "../_helpers/Content";

/**
 * This is just a helper class to provide public access to
 * protected methods of TableDataProvider
 */
class Provider extends PresentationPropertyDataProvider {
  public override invalidateCache(props: CacheInvalidationProps) {
    super.invalidateCache(props);
  }
  public override async getDescriptorOverrides() {
    return super.getDescriptorOverrides();
  }
  public override sortCategories(categories: CategoryDescription[]) {
    return super.sortCategories(categories);
  }
  public override async sortFieldsAsync(category: CategoryDescription, fields: Field[]) {
    return super.sortFieldsAsync(category, fields);
  }
  public override isFieldHidden(field: Field) {
    return super.isFieldHidden(field);
  }
  public override async isFieldFavoriteAsync(field: Field) {
    return super.isFieldFavoriteAsync(field);
  }
}

describe("PropertyDataProvider", () => {
  const rulesetId = "TestRulesetId";

  let provider: Provider;
  let presentationManager: sinon.SinonStubbedInstance<PresentationManager>;
  let favoritePropertiesManager: sinon.SinonStubbedInstance<FavoritePropertiesManager>;

  const onFavoritesChanged = new BeEvent<() => void>();

  const iTwinId = "itwin-id";
  const imodelId = "imodel-id";
  const imodel = { iTwinId, imodelId } as unknown as IModelConnection;

  beforeEach(async () => {
    presentationManager = sinon.createStubInstance(PresentationManager);

    favoritePropertiesManager = sinon.createStubInstance(FavoritePropertiesManager);
    favoritePropertiesManager.hasAsync.callsFake(async () => false);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    favoritePropertiesManager.has.callsFake(() => false);
    Object.assign(favoritePropertiesManager, {
      onFavoritesChanged,
      sortFieldsAsync: async (_imodel: IModelConnection, fields: Field[]) => fields,
      sortFields: (_imodel: IModelConnection, fields: Field[]) => fields,
    });

    sinon.stub(Presentation, "presentation").get(() => presentationManager);
    sinon.stub(Presentation, "favoriteProperties").get(() => favoritePropertiesManager);
    sinon.stub(Presentation, "localization").get(() => new EmptyLocalization());
    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    }));

    provider = new Provider({ imodel, ruleset: rulesetId });
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe("constructor", () => {
    it("uses default ruleset if not given through props", () => {
      using(new PresentationPropertyDataProvider({ imodel }), (p) => {
        expect(p.rulesetId).to.eq(DEFAULT_PROPERTY_GRID_RULESET.id);
      });
    });

    it("[deprecated] sets `includeFieldsWithNoValues` to true", () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      expect(provider.includeFieldsWithNoValues).to.be.true;
    });

    it("[deprecated] sets `includeFieldsWithCompositeValues` to true", () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      expect(provider.includeFieldsWithCompositeValues).to.be.true;
    });

    it("subscribes to `Presentation.favoriteProperties.onFavoritesChanged` to invalidate cache", async () => {
      provider = new Provider({ imodel, ruleset: rulesetId });
      await provider.getData();

      const s = sinon.spy(provider, "invalidateCache");

      onFavoritesChanged.raiseEvent();
      expect(s).to.be.calledOnce;
    });
  });

  describe("dispose", () => {
    it("unsubscribes from `Presentation.favoriteProperties.onFavoritesChanged` event", async () => {
      provider = new Provider({ imodel, ruleset: rulesetId });
      await provider.getData();

      expect(onFavoritesChanged.numberOfListeners).to.eq(1);
      provider.dispose();
      expect(onFavoritesChanged.numberOfListeners).to.eq(0);
    });
  });

  describe("invalidateCache", () => {
    it("raises onDataChanged event", () => {
      const s = sinon.spy(provider.onDataChanged, "raiseEvent");
      provider.invalidateCache({});
      expect(s).to.be.calledOnce;
    });
  });

  describe("getDescriptorOverrides", () => {
    it("should have `ShowLabels` and `MergeResults` flags", async () => {
      const overrides = await provider.getDescriptorOverrides();
      const flags = overrides.contentFlags!;
      expect(flags & (ContentFlags.MergeResults | ContentFlags.ShowLabels)).to.not.eq(0);
    });
  });

  describe("[deprecated] includeFieldsWithNoValues", () => {
    it("invalidates cache when setting to different value", () => {
      const invalidateCacheSpy = sinon.stub(provider, "invalidateCache");
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      provider.includeFieldsWithNoValues = !provider.includeFieldsWithNoValues;
      expect(invalidateCacheSpy).to.be.calledOnce;
    });

    it("doesn't invalidate cache when setting to same value", () => {
      const invalidateCacheSpy = sinon.stub(provider, "invalidateCache");
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      provider.includeFieldsWithNoValues = provider.includeFieldsWithNoValues;
      expect(invalidateCacheSpy).to.not.be.called;
    });
  });

  describe("[deprecated] includeFieldsWithCompositeValues", () => {
    it("invalidates cache when setting to different value", () => {
      const invalidateCacheSpy = sinon.stub(provider, "invalidateCache");
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      provider.includeFieldsWithCompositeValues = !provider.includeFieldsWithCompositeValues;
      expect(invalidateCacheSpy).to.be.calledOnce;
    });

    it("doesn't invalidate cache when setting to same value", () => {
      const invalidateCacheSpy = sinon.stub(provider, "invalidateCache");
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      provider.includeFieldsWithCompositeValues = provider.includeFieldsWithCompositeValues;
      expect(invalidateCacheSpy).to.not.be.called;
    });
  });

  describe("isFieldFavoriteAsync", () => {
    const field = createTestSimpleContentField();

    it("calls `FavoritePropertiesManager.hasAsync` when it's available", async () => {
      await provider.isFieldFavoriteAsync(field);
      expect(favoritePropertiesManager.hasAsync).to.be.calledOnceWith(field, imodel, FavoritePropertiesScope.IModel);
    });

    it("calls `FavoritePropertiesManager.has` when `hasAsync` is not available", async () => {
      Object.assign(favoritePropertiesManager, { hasAsync: undefined });
      await provider.isFieldFavoriteAsync(field);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      expect(favoritePropertiesManager.has).to.be.calledOnceWith(field, imodel, FavoritePropertiesScope.IModel);
    });

    it("calls deprecated `isFieldFavorite` when it's overriden by a subclass", async () => {
      class Subclass extends Provider {
        public override isFieldFavorite(f: Field): boolean {
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          return super.isFieldFavorite(f);
        }
      }
      await using(new Subclass({ imodel, ruleset: rulesetId }), async (subclassProvider) => {
        const spy = sinon.spy(subclassProvider, "isFieldFavorite");
        await subclassProvider.isFieldFavoriteAsync(field);
        expect(spy).to.be.calledOnce;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(favoritePropertiesManager.has).to.be.calledOnceWith(field, imodel, FavoritePropertiesScope.IModel);
      });
    });
  });

  describe("sortCategories", () => {
    it("sorts categories by priority", () => {
      const categories = [0, 1, 2].map(() => createTestCategoryDescription());
      categories[0].priority = 2;
      categories[1].priority = 3;
      categories[2].priority = 1;
      provider.sortCategories(categories);
      expect(categories[0].priority).to.eq(3);
      expect(categories[1].priority).to.eq(2);
      expect(categories[2].priority).to.eq(1);
    });
  });

  describe("sortFieldsAsync", () => {
    it("sorts fields by priority", async () => {
      const fields = [0, 1, 2].map(() => createTestSimpleContentField());
      fields[0].priority = 2;
      fields[1].priority = 3;
      fields[2].priority = 1;
      await provider.sortFieldsAsync(createTestCategoryDescription(), fields);
      expect(fields[0].priority).to.eq(3);
      expect(fields[1].priority).to.eq(2);
      expect(fields[2].priority).to.eq(1);
    });

    it("calls deprecated `sortFields` when it's overriden by a subclass", async () => {
      class Subclass extends Provider {
        public override sortFields(category: CategoryDescription, fields: Field[]) {
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          super.sortFields(category, fields);
        }
      }
      await using(new Subclass({ imodel, ruleset: rulesetId }), async (subclassProvider) => {
        const spy = sinon.spy(subclassProvider, "sortFields");
        const fields = [0, 1, 2].map(() => createTestSimpleContentField());
        await subclassProvider.sortFieldsAsync(createTestCategoryDescription(), fields);
        expect(spy).to.be.calledOnce;
      });
    });
  });

  describe("getData", () => {
    const createPrimitiveField = createTestSimpleContentField;

    const createArrayField = (props?: { name?: string; itemsType?: TypeDescription }) => {
      const property: Property = {
        property: createTestPropertyInfo(),
      };
      const typeDescription: ArrayTypeDescription = {
        valueFormat: PropertyValueFormat.Array,
        typeName: "MyArray[]",
        memberType: props?.itemsType ?? { valueFormat: PropertyValueFormat.Primitive, typeName: "MyType" },
      };
      return createTestPropertiesContentField({
        name: props?.name,
        type: typeDescription,
        properties: [property],
      });
    };

    const createStructField = (props?: { name?: string; members?: StructFieldMemberDescription[] }) => {
      const property: Property = {
        property: createTestPropertyInfo(),
      };
      const typeDescription: StructTypeDescription = {
        valueFormat: PropertyValueFormat.Struct,
        typeName: "MyStruct",
        members: props?.members ?? [
          {
            name: "MyProperty",
            label: "My Property",
            type: { valueFormat: PropertyValueFormat.Primitive, typeName: "MyType" },
          },
        ],
      };
      return createTestPropertiesContentField({
        name: props?.name,
        type: typeDescription,
        properties: [property],
      });
    };

    it("returns empty data object when receives undefined content", async () => {
      (provider as any).getContent = async () => undefined;
      expect(await provider.getData()).to.deep.eq({
        label: PropertyRecord.fromString("", "label"),
        categories: [],
        records: {},
      });
    });

    it("returns empty data object when receives content with no values", async () => {
      (provider as any).getContent = async () => new Content(createTestContentDescriptor({ fields: [] }), []);
      expect(await provider.getData()).to.deep.eq({
        label: PropertyRecord.fromString("", "label"),
        categories: [],
        records: {},
      });
    });

    it("set property data label", async () => {
      const item = createTestContentItem({ label: "test", values: {}, displayValues: {} });
      (provider as any).getContent = async () => new Content(createTestContentDescriptor({ fields: [] }), [item]);
      expect(await provider.getData()).to.containSubset({
        label: { value: { displayValue: "test" } },
      });
    });

    it("set property data description", async () => {
      const item = createTestContentItem({ classInfo: createTestECClassInfo({ label: "test" }), values: {}, displayValues: {} });
      (provider as any).getContent = async () => new Content(createTestContentDescriptor({ fields: [] }), [item]);
      expect(await provider.getData()).to.containSubset({
        description: "test",
      });
    });

    function runAllTestCases(name: string, setup: () => void) {
      describe(name, () => {
        beforeEach(() => {
          setup();
        });

        it("assigns category renderer", async () => {
          const field = createPrimitiveField({
            category: createTestCategoryDescription({
              name: "my-category",
              renderer: { name: "test" },
            }),
          });
          const descriptor = createTestContentDescriptor({ fields: [field] });
          const values: ValuesDictionary<any> = {
            [field.name]: "",
          };
          const displayValues: ValuesDictionary<any> = {
            [field.name]: "",
          };
          const record = createTestContentItem({ values, displayValues });
          (provider as any).getContent = async () => new Content(descriptor, [record]);
          expect(await provider.getData()).to.matchSnapshot();
        });

        it("handles records with no values", async () => {
          const descriptor = createTestContentDescriptor({ fields: [createPrimitiveField()] });
          const values: ValuesDictionary<any> = {};
          const displayValues: ValuesDictionary<any> = {};
          const record = createTestContentItem({ values, displayValues });
          (provider as any).getContent = async () => new Content(descriptor, [record]);
          expect(await provider.getData()).to.matchSnapshot();
        });

        it("returns primitive property data", async () => {
          const field = createPrimitiveField();
          const descriptor = createTestContentDescriptor({ fields: [field] });
          const values: ValuesDictionary<any> = {
            [field.name]: "some value",
          };
          const displayValues: ValuesDictionary<any> = {
            [field.name]: "some display value",
          };
          const record = createTestContentItem({ values, displayValues });
          (provider as any).getContent = async () => new Content(descriptor, [record]);
          expect(await provider.getData()).to.matchSnapshot();
        });

        it("returns array property data", async () => {
          const field = createArrayField();
          const descriptor = createTestContentDescriptor({ fields: [field] });
          const values = {
            [field.name]: ["some value 1", "some value 2"],
          };
          const displayValues = {
            [field.name]: ["some display value 1", "some display value 2"],
          };
          const record = createTestContentItem({ values, displayValues });
          (provider as any).getContent = async () => new Content(descriptor, [record]);
          expect(await provider.getData()).to.matchSnapshot();
        });

        it("returns struct property data", async () => {
          const field = createStructField();
          const descriptor = createTestContentDescriptor({ fields: [field] });
          const values = {
            [field.name]: {
              [(field.type as StructTypeDescription).members[0].name]: "some value",
            },
          };
          const displayValues = {
            [field.name]: {
              [(field.type as StructTypeDescription).members[0].name]: "some display value",
            },
          };
          const record = createTestContentItem({ values, displayValues });
          (provider as any).getContent = async () => new Content(descriptor, [record]);
          expect(await provider.getData()).to.matchSnapshot();
        });

        describe("nested content handling", () => {
          it("returns nothing for nested content with no values", async () => {
            const category = createTestCategoryDescription();
            const field = createTestNestedContentField({
              name: "root-field",
              category,
              nestedFields: [createTestSimpleContentField({ category })],
            });
            const descriptor = createTestContentDescriptor({ fields: [field] });
            const values = {
              [field.name]: [],
            };
            const displayValues = {
              [field.name]: [],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            const data = await provider.getData();
            expect(data.categories.length).to.eq(0);
            expect(data.records.hasOwnProperty(category.name)).to.be.false;
          });

          it("returns nothing for nested content without nested fields", async () => {
            const category = createTestCategoryDescription();
            const field = createTestNestedContentField({
              name: "root-field",
              category,
              nestedFields: [],
            });
            const descriptor = createTestContentDescriptor({ fields: [field] });
            const values = {
              [field.name]: [
                {
                  primaryKeys: [createTestECInstanceKey()],
                  values: {},
                  displayValues: {},
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues = {
              [field.name]: [
                {
                  displayValues: {},
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            const data = await provider.getData();
            expect(data.categories.length).to.eq(0);
            expect(data.records.hasOwnProperty(category.name)).to.be.false;
          });

          it("returns nested content with multiple nested records as struct array", async () => {
            const category = createTestCategoryDescription();
            const nestedField = createPrimitiveField({ name: "nested-field", category });
            const field = createTestNestedContentField({ name: "root-field", category, nestedFields: [nestedField] });
            const descriptor = createTestContentDescriptor({ fields: [field] });
            const values = {
              [field.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [nestedField.name]: "value 1",
                  },
                  displayValues: {
                    [nestedField.name]: "display value 1",
                  },
                  mergedFieldNames: [],
                },
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x2" })],
                  values: {
                    [nestedField.name]: "value 2",
                  },
                  displayValues: {
                    [nestedField.name]: "display value 2",
                  },
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues = {
              [field.name]: [
                {
                  displayValues: {
                    [nestedField.name]: "display value 1",
                  },
                },
                {
                  displayValues: {
                    [nestedField.name]: "display value 2",
                  },
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("returns nothing for deeply nested content with no values", async () => {
            const category = createTestCategoryDescription();
            const primitiveField1 = createPrimitiveField({ name: "primitive-field-1", category });
            const primitiveField2 = createPrimitiveField({ name: "primitive-field-2", category });
            const primitiveField3 = createPrimitiveField({ name: "primitive-field-3", category });
            const middleField = createTestNestedContentField({
              name: "middle-field",
              category,
              nestedFields: [primitiveField3],
              relationshipMeaning: RelationshipMeaning.SameInstance,
            });
            const rootField = createTestNestedContentField({ name: "root-field", category, nestedFields: [primitiveField2, middleField] });
            const descriptor = createTestContentDescriptor({ fields: [primitiveField1, rootField] });
            const values = {
              [primitiveField1.name]: "p1",
              [rootField.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [primitiveField2.name]: "p2",
                    [middleField.name]: [],
                  },
                  displayValues: {
                    [primitiveField2.name]: "p2",
                    [middleField.name]: [],
                  },
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues = {
              [primitiveField1.name]: "p1",
              [rootField.name]: [
                {
                  displayValues: {
                    [primitiveField2.name]: "p2",
                    [middleField.name]: [],
                  },
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("returns nested content with destructured deeply nested content", async () => {
            const category = createTestCategoryDescription();
            const primitiveField1 = createPrimitiveField({ name: "primitive-field-1", category });
            const primitiveField2 = createPrimitiveField({ name: "primitive-field-2", category });
            const primitiveField3 = createPrimitiveField({ name: "primitive-field-3", category });
            const middleField = createTestNestedContentField({
              name: "middle-field",
              category,
              nestedFields: [primitiveField3],
              relationshipMeaning: RelationshipMeaning.SameInstance,
            });
            const rootField = createTestNestedContentField({ name: "root-field", category, nestedFields: [primitiveField2, middleField] });
            const descriptor = createTestContentDescriptor({ fields: [primitiveField1, rootField] });
            const values = {
              [primitiveField1.name]: "test",
              [rootField.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [primitiveField2.name]: "test",
                    [middleField.name]: [
                      {
                        primaryKeys: [createTestECInstanceKey({ id: "0x2" })],
                        values: {
                          [primitiveField3.name]: "value 1",
                        },
                        displayValues: {
                          [primitiveField3.name]: "display value 1",
                        },
                        mergedFieldNames: [],
                      },
                    ],
                  },
                  displayValues: {
                    [primitiveField2.name]: "test",
                    [middleField.name]: [
                      {
                        displayValues: {
                          [primitiveField3.name]: "display value 1",
                        },
                      },
                    ],
                  },
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues = {
              [primitiveField1.name]: "test",
              [rootField.name]: [
                {
                  displayValues: {
                    [primitiveField2.name]: "test",
                    [middleField.name]: [
                      {
                        displayValues: {
                          [primitiveField3.name]: "display value 1",
                        },
                      },
                    ],
                  },
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("returns nested content with deeply nested content as structs array when there are multiple nested content items", async () => {
            const category = createTestCategoryDescription();
            const primitiveField1 = createPrimitiveField({ name: "primitive-field-1", category });
            const primitiveField2 = createPrimitiveField({ name: "primitive-field-2", category });
            const primitiveField3 = createPrimitiveField({ name: "primitive-field-3", category });
            const middleField = createTestNestedContentField({
              name: "middle-field",
              category,
              nestedFields: [primitiveField3],
              relationshipMeaning: RelationshipMeaning.SameInstance,
            });
            const rootField = createTestNestedContentField({ name: "root-field", category, nestedFields: [primitiveField2, middleField] });
            const descriptor = createTestContentDescriptor({ fields: [primitiveField1, rootField] });
            const values = {
              [primitiveField1.name]: "test",
              [rootField.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [primitiveField2.name]: "test",
                    [middleField.name]: [
                      {
                        primaryKeys: [createTestECInstanceKey({ id: "0x2" })],
                        values: {
                          [primitiveField3.name]: "value 1",
                        },
                        displayValues: {
                          [primitiveField3.name]: "display value 1",
                        },
                        mergedFieldNames: [],
                      },
                      {
                        primaryKeys: [createTestECInstanceKey({ id: "0x3" })],
                        values: {
                          [primitiveField3.name]: "value 2",
                        },
                        displayValues: {
                          [primitiveField3.name]: "display value 2",
                        },
                        mergedFieldNames: [],
                      },
                    ],
                  },
                  displayValues: {
                    [primitiveField2.name]: "test",
                    [middleField.name]: [
                      {
                        displayValues: {
                          [primitiveField3.name]: "display value 1",
                        },
                      },
                      {
                        displayValues: {
                          [primitiveField3.name]: "display value 2",
                        },
                      },
                    ],
                  },
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues = {
              [primitiveField1.name]: "test",
              [rootField.name]: [
                {
                  displayValues: {
                    [primitiveField2.name]: "test",
                    [middleField.name]: [
                      {
                        displayValues: {
                          [primitiveField3.name]: "display value 1",
                        },
                      },
                      {
                        displayValues: {
                          [primitiveField3.name]: "display value 2",
                        },
                      },
                    ],
                  },
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("returns nested content with single nested record as struct when there're sibling fields", async () => {
            const category = createTestCategoryDescription();
            const nestedField = createPrimitiveField({ name: "nested-field", category });
            const field = createTestNestedContentField({ name: "root-field", category, nestedFields: [nestedField] });
            const siblingRootField = createPrimitiveField({ name: "sibling-root-field", category });
            const descriptor = createTestContentDescriptor({ fields: [field, siblingRootField] });
            const values = {
              [field.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [nestedField.name]: "value 1",
                  },
                  displayValues: {
                    [nestedField.name]: "display value 1",
                  },
                  mergedFieldNames: [],
                },
              ],
              [siblingRootField.name]: "value 3",
            };
            const displayValues = {
              [field.name]: [
                {
                  displayValues: {
                    [nestedField.name]: "display value 1",
                  },
                },
              ],
              [siblingRootField.name]: "display value 3",
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("returns nested content with single nested record as individual properties when are no sibling fields", async () => {
            const category = createTestCategoryDescription();
            const nestedField = createPrimitiveField({ name: "nested-field", category });
            const field = createTestNestedContentField({ name: "root-field", category, nestedFields: [nestedField] });
            const descriptor = createTestContentDescriptor({ fields: [field] });
            const values = {
              [field.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [nestedField.name]: "value 1",
                  },
                  displayValues: {
                    [nestedField.name]: "display value 1",
                  },
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues = {
              [field.name]: [
                {
                  displayValues: {
                    [nestedField.name]: "display value 1",
                  },
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("moves nested field into separate category and keeps nested content field with remaining nested fields when there are more than 1 nested fields and sibling fields", async () => {
            const category1 = createTestCategoryDescription({ name: "Category1" });
            const category2 = createTestCategoryDescription({ name: "Category2" });
            const nestedField1 = createPrimitiveField({ name: "nested-field-1", category: category1 });
            const nestedField2 = createPrimitiveField({ name: "nested-field-2", category: category2 });
            const field = createTestNestedContentField({ name: "root-field", category: category1, nestedFields: [nestedField1, nestedField2] });
            const siblingRootField = createPrimitiveField({ name: "sibling-root-field", category: category1 });
            const descriptor = createTestContentDescriptor({ fields: [field, siblingRootField] });
            const values = {
              [field.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [nestedField1.name]: "value 1",
                    [nestedField2.name]: "value 2",
                  },
                  displayValues: {
                    [nestedField1.name]: "display value 1",
                    [nestedField2.name]: "display value 2",
                  },
                  mergedFieldNames: [],
                },
              ],
              [siblingRootField.name]: "value 3",
            };
            const displayValues = {
              [field.name]: [
                {
                  displayValues: {
                    [nestedField1.name]: "display value 1",
                    [nestedField2.name]: "display value 2",
                  },
                },
              ],
              [siblingRootField.name]: "display value 3",
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("moves nested field into separate category and keeps nested content field with remaining nested fields when there are more than 1 nested fields and no sibling fields", async () => {
            const category1 = createTestCategoryDescription({ name: "Category1" });
            const category2 = createTestCategoryDescription({ name: "Category2" });
            const nestedField1 = createPrimitiveField({ name: "nested-field-1", category: category1 });
            const nestedField2 = createPrimitiveField({ name: "nested-field-2", category: category2 });
            const field = createTestNestedContentField({ name: "root-field", category: category1, nestedFields: [nestedField1, nestedField2] });
            const descriptor = createTestContentDescriptor({ fields: [field] });
            const values = {
              [field.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [nestedField1.name]: "value 1",
                    [nestedField2.name]: "value 2",
                  },
                  displayValues: {
                    [nestedField1.name]: "display value 1",
                    [nestedField2.name]: "display value 2",
                  },
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues = {
              [field.name]: [
                {
                  displayValues: {
                    [nestedField1.name]: "display value 1",
                    [nestedField2.name]: "display value 2",
                  },
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("moves nested field into separate category and hides nested content field when there's only 1 nested field", async () => {
            const category1 = createTestCategoryDescription({ name: "Category1" });
            const category2 = createTestCategoryDescription({ name: "Category2" });
            const nestedField1 = createPrimitiveField({ name: "nested-field-1", category: category2 });
            const field = createTestNestedContentField({ name: "root-field", category: category1, nestedFields: [nestedField1] });
            const descriptor = createTestContentDescriptor({ fields: [field] });
            const values = {
              [field.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [nestedField1.name]: "value 1",
                  },
                  displayValues: {
                    [nestedField1.name]: "display value 1",
                  },
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues = {
              [field.name]: [
                {
                  displayValues: {
                    [nestedField1.name]: "display value 1",
                  },
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("merges parent field when child field's category is different and parent is merged", async () => {
            const category1 = createTestCategoryDescription({ name: "Category1" });
            const category2 = createTestCategoryDescription({ name: "Category2" });
            const nestedField1 = createPrimitiveField({ name: "nested-field-1", category: category2 });
            const field = createTestNestedContentField({ name: "root-field", category: category1, nestedFields: [nestedField1] });
            const descriptor = createTestContentDescriptor({ categories: [category1, category2], fields: [field] });
            const values = {
              [field.name]: undefined,
            };
            const displayValues = {
              [field.name]: "*** Varies ***",
            };
            const record = createTestContentItem({ values, displayValues, mergedFieldNames: [field.name] });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("moves all nested fields into separate category and hides nested content field when all nested fields are categorized", async () => {
            const category1 = createTestCategoryDescription({ name: "Category1" });
            const category2 = createTestCategoryDescription({ name: "Category2" });
            const nestedField1 = createPrimitiveField({ name: "nested-field-1", category: category2 });
            const nestedField2 = createPrimitiveField({ name: "nested-field-2", category: category2 });
            const field = createTestNestedContentField({ name: "root-field", category: category1, nestedFields: [nestedField1, nestedField2] });
            const descriptor = createTestContentDescriptor({ fields: [field] });
            const values = {
              [field.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [nestedField1.name]: "value 1",
                    [nestedField2.name]: "value 2",
                  },
                  displayValues: {
                    [nestedField1.name]: "display value 1",
                    [nestedField2.name]: "display value 2",
                  },
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues = {
              [field.name]: [
                {
                  displayValues: {
                    [nestedField1.name]: "display value 1",
                    [nestedField2.name]: "display value 2",
                  },
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("moves field into separate category with its grandparent when both are categorized with the same category", async () => {
            const category1 = createTestCategoryDescription({ name: "Category1" });
            const category2 = createTestCategoryDescription({ name: "Category2" });
            const nestedField1 = createPrimitiveField({ name: "nested-field-1", category: category1 });
            const nestedField2 = createPrimitiveField({ name: "nested-field-2", category: category2 });
            const nestedField3 = createPrimitiveField({ name: "nested-field-3", category: category2 });
            const nestedField4 = createPrimitiveField({ name: "nested-field-4", category: category1 });
            const middleField = createTestNestedContentField({ name: "middle-field", category: category2, nestedFields: [nestedField1, nestedField2] });
            const rootField = createTestNestedContentField({ name: "root-field", category: category1, nestedFields: [middleField, nestedField3] });
            const descriptor = createTestContentDescriptor({ fields: [rootField, nestedField4] });
            const values = {
              [rootField.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [middleField.name]: [
                      {
                        primaryKeys: [createTestECInstanceKey({ id: "0x2" })],
                        values: {
                          [nestedField1.name]: "value 1",
                          [nestedField2.name]: "value 2",
                        },
                        displayValues: {
                          [nestedField1.name]: "display value 1",
                          [nestedField2.name]: "display value 2",
                        },
                        mergedFieldNames: [],
                      },
                    ],
                    [nestedField3.name]: "value 3",
                  },
                  displayValues: {
                    [middleField.name]: [
                      {
                        displayValues: {
                          [nestedField1.name]: "display value 1",
                          [nestedField2.name]: "display value 2",
                        },
                      },
                    ],
                    [nestedField3.name]: "display value 3",
                  },
                  mergedFieldNames: [],
                },
              ],
              [nestedField4.name]: "value 4",
            };
            const displayValues = {
              [rootField.name]: [
                {
                  displayValues: {
                    [middleField.name]: [
                      {
                        [nestedField1.name]: "display value 1",
                        [nestedField2.name]: "display value 2",
                      },
                    ],
                    [nestedField3.name]: "display value 3",
                  },
                },
              ],
              [nestedField4.name]: "display value 4",
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });

          it("moves fields into separate category under common ancestor when both are categorized with the same category", async () => {
            const category1 = createTestCategoryDescription({ name: "Category1" });
            const category2 = createTestCategoryDescription({ name: "Category2", expand: true });
            const nestedField1 = createPrimitiveField({ name: "nested-field-1", category: category1 });
            const nestedField2 = createPrimitiveField({ name: "nested-field-2", category: category2 });
            const nestedField3 = createPrimitiveField({ name: "nested-field-3", category: category1 });
            const nestedField4 = createPrimitiveField({ name: "nested-field-4", category: category2 });
            const nestedField5 = createPrimitiveField({ name: "nested-field-5", category: category2 });
            const rootSiblingField = createPrimitiveField({ name: "root-sibling", category: category1 });
            const middleField1 = createTestNestedContentField({ name: "middle-field-1", category: category1, nestedFields: [nestedField1, nestedField2] });
            const middleField2 = createTestNestedContentField({
              name: "middle-field-2",
              category: category1,
              nestedFields: [nestedField3, nestedField4, nestedField5],
            });
            const rootField = createTestNestedContentField({ name: "root-field", category: category1, nestedFields: [middleField1, middleField2] });
            const descriptor = createTestContentDescriptor({ fields: [rootField, rootSiblingField] });
            const values = {
              [rootField.name]: [
                {
                  primaryKeys: [createTestECInstanceKey({ id: "0x1" })],
                  values: {
                    [middleField1.name]: [
                      {
                        primaryKeys: [createTestECInstanceKey({ id: "0x2" })],
                        values: {
                          [nestedField1.name]: "value 1",
                          [nestedField2.name]: "value 2",
                        },
                        displayValues: {
                          [nestedField1.name]: "display value 1",
                          [nestedField2.name]: "display value 2",
                        },
                        mergedFieldNames: [],
                      },
                    ],
                    [middleField2.name]: [
                      {
                        primaryKeys: [createTestECInstanceKey({ id: "0x3" })],
                        values: {
                          [nestedField3.name]: "value 3",
                          [nestedField4.name]: "value 4",
                          [nestedField5.name]: "value 5",
                        },
                        displayValues: {
                          [nestedField3.name]: "display value 3",
                          [nestedField4.name]: "display value 4",
                          [nestedField5.name]: "display value 5",
                        },
                        mergedFieldNames: [],
                      },
                    ],
                  },
                  displayValues: {
                    [middleField1.name]: [
                      {
                        displayValues: {
                          [nestedField1.name]: "display value 1",
                          [nestedField2.name]: "display value 2",
                        },
                      },
                    ],
                    [middleField2.name]: [
                      {
                        displayValues: {
                          [nestedField3.name]: "display value 3",
                          [nestedField4.name]: "display value 4",
                          [nestedField5.name]: "display value 5",
                        },
                      },
                    ],
                  },
                  mergedFieldNames: [],
                },
              ],
              [rootSiblingField.name]: "value",
            };
            const displayValues = {
              [rootField.name]: [
                {
                  displayValues: {
                    [middleField1.name]: [
                      {
                        displayValues: {
                          [nestedField1.name]: "display value 1",
                          [nestedField2.name]: "display value 2",
                        },
                      },
                    ],
                    [middleField2.name]: [
                      {
                        displayValues: {
                          [nestedField3.name]: "display value 3",
                          [nestedField4.name]: "display value 4",
                          [nestedField5.name]: "display value 5",
                        },
                      },
                    ],
                  },
                },
              ],
              [rootSiblingField.name]: "display value",
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            expect(await provider.getData()).to.matchSnapshot();
          });
        });

        describe("[deprecated] includeFieldsWithNoValues handling", () => {
          beforeEach(() => {
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            provider.includeFieldsWithNoValues = false;
          });

          it("doesn't include primitive fields with no values when set", async () => {
            const descriptor = createTestContentDescriptor({
              fields: [createPrimitiveField({ name: "IncludedField" }), createPrimitiveField({ name: "ExcludedField" })],
            });
            const values: ValuesDictionary<any> = {
              IncludedField: "some value",
            };
            const displayValues: ValuesDictionary<any> = {
              IncludedField: "some display value",
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            const data = await provider.getData();
            expect(data.categories.length).to.eq(1);
            expect(data.records[data.categories[0].name].length).to.eq(1);
            expect(data.records[data.categories[0].name]).to.containSubset([
              {
                property: { name: "IncludedField" },
              },
            ]);
          });

          it("doesn't include array fields with no values when set", async () => {
            const descriptor = createTestContentDescriptor({
              fields: [createArrayField({ name: "WithItems" }), createArrayField({ name: "Empty" })],
            });
            const values: ValuesDictionary<any> = {
              WithItems: ["some value"],
              Empty: [],
            };
            const displayValues: ValuesDictionary<any> = {
              WithItems: ["some display value"],
              Empty: [],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            const data = await provider.getData();
            expect(data.categories.length).to.eq(1);
            expect(data.records[data.categories[0].name].length).to.eq(1);
            expect(data.records[data.categories[0].name]).to.containSubset([
              {
                property: { name: "WithItems" },
              },
            ]);
          });

          it("doesn't include struct fields with no values when set", async () => {
            const descriptor = createTestContentDescriptor({
              fields: [
                createStructField({
                  name: "WithMembers",
                  members: [{ name: "TestMember", label: "Test", type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" } }],
                }),
                createStructField({ name: "Empty", members: [] }),
              ],
            });
            const values: ValuesDictionary<any> = {
              WithMembers: {
                TestMember: "some value",
              },
              Empty: {},
            };
            const displayValues: ValuesDictionary<any> = {
              WithMembers: {
                TestMember: "some display value",
              },
              Empty: {},
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            const data = await provider.getData();
            expect(data.categories.length).to.eq(1);
            expect(data.records[data.categories[0].name].length).to.eq(1);
            expect(data.records[data.categories[0].name]).to.containSubset([
              {
                property: { name: "WithMembers" },
              },
            ]);
          });

          it("doesn't include nested fields with no values when set", async () => {
            const category = createTestCategoryDescription({ name: "custom-category" });
            const descriptor = createTestContentDescriptor({
              fields: [
                createTestNestedContentField({
                  name: "nested",
                  nestedFields: [createPrimitiveField({ name: "a", label: "a", category }), createPrimitiveField({ name: "b", label: "b", category })],
                }),
              ],
            });
            const values: ValuesDictionary<Value> = {
              nested: [
                {
                  primaryKeys: [createTestECInstanceKey()],
                  values: {
                    a: "",
                    b: "some value",
                  },
                  displayValues: {
                    a: undefined,
                    b: "some value",
                  },
                  mergedFieldNames: [],
                },
              ],
            };
            const displayValues: ValuesDictionary<DisplayValue> = {
              nested: [
                {
                  displayValues: {
                    a: undefined,
                    b: "some value",
                  },
                },
              ],
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            const data = await provider.getData();
            expect(data.categories.length).to.eq(1);
            expect(data.records[data.categories[0].name].length).to.eq(1);
            expect(data.records[data.categories[0].name]).to.containSubset([
              {
                property: { displayLabel: "b" },
                value: { value: "some value" },
              },
            ]);
          });
        });

        describe("[deprecated] includeFieldsWithCompositeValues handling", () => {
          beforeEach(() => {
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            provider.includeFieldsWithCompositeValues = false;
          });

          it("doesn't include composite fields when set", async () => {
            const primitiveField = createPrimitiveField({ name: "Primitive" });
            const arrayField = createArrayField({ name: "Array" });
            const structField = createStructField({ name: "Struct" });
            const descriptor = createTestContentDescriptor({ fields: [primitiveField, arrayField, structField] });
            const values = {
              Primitive: "some value",
              Array: ["some value 1", "some value 2"],
              Struct: {
                [(structField.type as StructTypeDescription).members[0].name]: "some value",
              },
            };
            const displayValues = {
              Primitive: "some display value",
              Array: ["some display value 1", "some display value 2"],
              Struct: {
                [(structField.type as StructTypeDescription).members[0].name]: "some display value",
              },
            };
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);
            const data = await provider.getData();
            expect(data.categories.length).to.eq(1);
            expect(data.records[data.categories[0].name].length).to.eq(1);
            expect(data.records[data.categories[0].name][0].property.name).to.eq(primitiveField.name);
          });
        });

        describe("favorite properties handling", () => {
          it("doesn't create favorite fields category if `disableFavoritesCategory` is set", async () => {
            provider.dispose();
            provider = new Provider({ imodel, ruleset: rulesetId, disableFavoritesCategory: true });

            favoritePropertiesManager.hasAsync.resetBehavior();
            favoritePropertiesManager.hasAsync.callsFake(async () => true);

            const descriptor = createTestContentDescriptor({
              fields: [
                createTestSimpleContentField({ name: "field1", category: createTestCategoryDescription({ name: "category1" }) }),
                createTestSimpleContentField({ name: "field2", category: createTestCategoryDescription({ name: "category1" }) }),
                createTestSimpleContentField({ name: "field3", category: createTestCategoryDescription({ name: "category2" }) }),
              ],
            });
            const values: ValuesDictionary<any> = {};
            const displayValues: ValuesDictionary<any> = {};
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);

            const data = await provider.getData();
            expect(data.categories.length).to.eq(2);
            data.categories.forEach((category) => {
              expect(category.name).to.not.contain(FAVORITES_CATEGORY_NAME);
            });
          });

          it("makes records favorite according to isFieldFavorite callback", async () => {
            (provider as any).isFieldFavorite = async (_field: Field) => true;
            const descriptor = createTestContentDescriptor({
              fields: [
                createTestSimpleContentField({ name: "field1", category: createTestCategoryDescription({ name: "category1" }) }),
                createTestSimpleContentField({ name: "field2", category: createTestCategoryDescription({ name: "category1" }) }),
                createTestSimpleContentField({ name: "field3", category: createTestCategoryDescription({ name: "category2" }) }),
              ],
            });
            const values: ValuesDictionary<any> = {};
            const displayValues: ValuesDictionary<any> = {};
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);

            const data = await provider.getData();
            expect(data.categories.length).to.eq(3);
            if (provider.isNestedPropertyCategoryGroupingEnabled) {
              expect(data.records[FAVORITES_CATEGORY_NAME]).to.be.undefined;
              expect(data.records[`${FAVORITES_CATEGORY_NAME}-category1`].length).to.eq(2);
              expect(data.records[`${FAVORITES_CATEGORY_NAME}-category1`]).to.containSubset([
                {
                  property: { name: "field1" },
                },
                {
                  property: { name: "field2" },
                },
              ]);
              expect(data.records[`${FAVORITES_CATEGORY_NAME}-category2`].length).to.eq(1);
              expect(data.records[`${FAVORITES_CATEGORY_NAME}-category2`]).to.containSubset([
                {
                  property: { name: "field3" },
                },
              ]);
            } else {
              expect(data.records[FAVORITES_CATEGORY_NAME].length).to.eq(3);
            }
          });

          it("sorts favorite records using `FavoritePropertiesManager.sortFieldsAsync` when it's available", async () => {
            Object.assign(favoritePropertiesManager, {
              hasAsync: () => true,
              sortFieldsAsync: async (_imodel: IModelConnection, fields: Field[]) =>
                fields.sort((lhs: Field, rhs: Field): number => {
                  if (lhs.label < rhs.label) {
                    return -1;
                  }
                  if (lhs.label > rhs.label) {
                    return 1;
                  }
                  return 0;
                }),
            });
            const category = createTestCategoryDescription();
            const descriptor = createTestContentDescriptor({
              fields: [
                createTestSimpleContentField({ category, name: "b", priority: 1, label: "b" }),
                createTestSimpleContentField({ category, name: "c", priority: 2, label: "c" }),
                createTestSimpleContentField({ category, name: "a", priority: 3, label: "a" }),
              ],
            });
            const values: ValuesDictionary<any> = {};
            const displayValues: ValuesDictionary<any> = {};
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);

            const data = await provider.getData();
            const records = data.records[category.name];
            expect(records.length).to.eq(3);
            expect(records).to.containSubset([
              {
                property: { displayLabel: "a" },
              },
              {
                property: { displayLabel: "b" },
              },
              {
                property: { displayLabel: "c" },
              },
            ]);
          });

          it("sorts favorite records using `FavoritePropertiesManager.sortFields` when `sortFieldsAsync` is not available", async () => {
            Object.assign(favoritePropertiesManager, {
              hasAsync: undefined,
              sortFieldsAsync: undefined,
              has: () => true,
              sortFields: (_imodel: IModelConnection, fields: Field[]) =>
                fields.sort((lhs: Field, rhs: Field): number => {
                  if (lhs.label < rhs.label) {
                    return -1;
                  }
                  if (lhs.label > rhs.label) {
                    return 1;
                  }
                  return 0;
                }),
            });
            const category = createTestCategoryDescription();
            const descriptor = createTestContentDescriptor({
              fields: [
                createTestSimpleContentField({ category, name: "b", priority: 1, label: "b" }),
                createTestSimpleContentField({ category, name: "c", priority: 2, label: "c" }),
                createTestSimpleContentField({ category, name: "a", priority: 3, label: "a" }),
              ],
            });
            const values: ValuesDictionary<any> = {};
            const displayValues: ValuesDictionary<any> = {};
            const record = createTestContentItem({ values, displayValues });
            (provider as any).getContent = async () => new Content(descriptor, [record]);

            const data = await provider.getData();
            const records = data.records[category.name];
            expect(records.length).to.eq(3);
            expect(records).to.containSubset([
              {
                property: { displayLabel: "a" },
              },
              {
                property: { displayLabel: "b" },
              },
              {
                property: { displayLabel: "c" },
              },
            ]);
          });

          describe("with nested content", () => {
            it("puts primitive records of nested content fields into favorite category", async () => {
              const parentCategory = createTestCategoryDescription({ name: "parent-category", label: "Parent" });
              const childCategory = createTestCategoryDescription({ name: "child-category", label: "Child", parent: parentCategory });
              const propertiesField = createTestSimpleContentField({ name: "primitive-property", label: "Primitive", category: childCategory });
              const nestedContentField = createTestNestedContentField({
                name: "nested-content-field",
                label: "Nested Content",
                category: parentCategory,
                nestedFields: [propertiesField],
              });
              const descriptor = createTestContentDescriptor({ fields: [nestedContentField] });

              favoritePropertiesManager.hasAsync.callsFake(async (field) => {
                return field.name === "primitive-property";
              });

              const values: ValuesDictionary<any> = {
                [nestedContentField.name]: [
                  {
                    primaryKeys: [createTestECInstanceKey()],
                    values: {
                      [propertiesField.name]: "test value",
                    },
                    displayValues: {
                      [propertiesField.name]: "test display value",
                    },
                    mergedFieldNames: [],
                  },
                ],
              };
              const displayValues: ValuesDictionary<any> = {
                [nestedContentField.name]: [
                  {
                    displayValues: {
                      [propertiesField.name]: "test display value",
                    },
                  },
                ],
              };
              const record = createTestContentItem({ values, displayValues });
              (provider as any).getContent = async () => new Content(descriptor, [record]);

              const data = await provider.getData();
              expect(data.categories.length).to.eq(2);

              if (provider.isNestedPropertyCategoryGroupingEnabled) {
                const favoritesCategory = data.categories.find((c) => c.name === FAVORITES_CATEGORY_NAME)!;
                expect(favoritesCategory.childCategories!.length).to.eq(1);
                expect(favoritesCategory.childCategories).to.containSubset([
                  {
                    label: "Parent",
                    childCategories: [
                      {
                        label: "Child",
                      },
                    ],
                  },
                ]);
                expect(data.records[`${FAVORITES_CATEGORY_NAME}-${childCategory.name}`].length).to.eq(1);
                expect(data.records[`${FAVORITES_CATEGORY_NAME}-${childCategory.name}`]).to.containSubset([
                  {
                    property: { displayLabel: "Primitive" },
                  },
                ]);
              } else {
                expect(data.records[FAVORITES_CATEGORY_NAME].length).to.eq(1);
                expect(data.records[FAVORITES_CATEGORY_NAME]).to.containSubset([
                  {
                    property: { displayLabel: "Primitive" },
                  },
                ]);
              }
            });

            it("puts the whole nested content record into favorite category when both the field and its nested fields are favorite", async () => {
              const category = createTestCategoryDescription({ label: "My Category" });
              const propertiesField1 = createTestSimpleContentField({ name: "primitive-property-1", label: "Primitive 1", category });
              const propertiesField2 = createTestSimpleContentField({ name: "primitive-property-2", label: "Primitive 2", category });
              const propertiesField3 = createTestSimpleContentField({ name: "primitive-property-3", label: "Primitive 3", category });
              const childNestedContentField = createTestNestedContentField({
                name: "child-nested-content-field",
                label: "Child Nested Content",
                category,
                nestedFields: [propertiesField3],
              });
              const nestedContentField = createTestNestedContentField({
                name: "nested-content-field",
                label: "Nested Content",
                category,
                nestedFields: [propertiesField1, childNestedContentField],
              });
              const descriptor = createTestContentDescriptor({ fields: [nestedContentField, propertiesField2] });

              favoritePropertiesManager.hasAsync.callsFake(async (field) => {
                return field.name === nestedContentField.name || field.name === propertiesField1.name || field.name === propertiesField2.name;
              });

              const values: ValuesDictionary<any> = {
                [nestedContentField.name]: [
                  {
                    primaryKeys: [createTestECInstanceKey()],
                    values: {
                      [propertiesField1.name]: "test value 1",
                      [childNestedContentField.name]: [
                        {
                          primaryKeys: [createTestECInstanceKey()],
                          values: {
                            [propertiesField3.name]: "test value 3",
                          },
                          displayValues: {
                            [propertiesField3.name]: "test display value 3",
                          },
                          mergedFieldNames: [],
                        },
                      ],
                    },
                    displayValues: {
                      [propertiesField1.name]: "test display value 1",
                      [childNestedContentField.name]: [
                        {
                          displayValues: {
                            [propertiesField3.name]: "test display value 3",
                          },
                        },
                      ],
                    },
                    mergedFieldNames: [],
                  },
                ],
                [propertiesField2.name]: "test value 2",
              };
              const displayValues: ValuesDictionary<any> = {
                [nestedContentField.name]: [
                  {
                    displayValues: {
                      [propertiesField1.name]: "test display value 1",
                      [childNestedContentField.name]: [
                        {
                          displayValues: {
                            [propertiesField3.name]: "test display value 3",
                          },
                        },
                      ],
                    },
                  },
                ],
                [propertiesField2.name]: "test display value 2",
              };
              const record = createTestContentItem({ values, displayValues });
              (provider as any).getContent = async () => new Content(descriptor, [record]);

              const data = await provider.getData();
              expect(data.categories.length).to.eq(2);

              let favoritesCategory: PropertyCategory;
              if (provider.isNestedPropertyCategoryGroupingEnabled) {
                const rootFavoritesCategory = data.categories.find((c) => c.name === FAVORITES_CATEGORY_NAME)!;
                expect(rootFavoritesCategory.childCategories!.length).to.eq(1);
                expect(rootFavoritesCategory.childCategories).to.containSubset([
                  {
                    label: "My Category",
                  },
                ]);
                favoritesCategory = rootFavoritesCategory.childCategories![0];
              } else {
                favoritesCategory = data.categories.find((c) => c.name === FAVORITES_CATEGORY_NAME)!;
              }

              expect(data.records[favoritesCategory.name].length).to.eq(2);
              expect(data.records[favoritesCategory.name]).to.containSubset([
                {
                  property: { displayLabel: "Nested Content" },
                  value: {
                    members: {
                      [propertiesField1.name]: {
                        property: { displayLabel: "Primitive 1" },
                      },
                      [childNestedContentField.name]: {
                        property: { displayLabel: "Child Nested Content" },
                        value: {
                          items: [
                            {
                              value: {
                                members: {
                                  [propertiesField3.name]: {
                                    property: { displayLabel: "Primitive 3" },
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                },
                {
                  property: { displayLabel: "Primitive 2" },
                },
              ]);
            });

            it("puts nested properties field into favorites category when parent field is merged", async () => {
              const parentCategory = createTestCategoryDescription({ name: "parent-category", label: "Parent" });
              const childCategory = createTestCategoryDescription({ name: "child-category", label: "Child", parent: parentCategory });
              const propertiesField = createTestSimpleContentField({ name: "primitive-property", label: "Primitive", category: childCategory });
              const nestedContentField = createTestNestedContentField({
                name: "nested-content-field",
                label: "Nested Content",
                category: parentCategory,
                nestedFields: [propertiesField],
              });
              const descriptor = createTestContentDescriptor({ fields: [nestedContentField] });

              favoritePropertiesManager.hasAsync.callsFake(async (field) => {
                return field.name === propertiesField.name;
              });

              const values: ValuesDictionary<any> = {
                [nestedContentField.name]: undefined,
              };
              const displayValues: ValuesDictionary<any> = {
                [nestedContentField.name]: "*** Varies ***",
              };
              const record = createTestContentItem({ values, displayValues, mergedFieldNames: [nestedContentField.name] });
              (provider as any).getContent = async () => new Content(descriptor, [record]);

              const data = await provider.getData();
              expect(data.categories.length).to.eq(2);

              if (provider.isNestedPropertyCategoryGroupingEnabled) {
                const favoritesCategory = data.categories.find((c) => c.name === FAVORITES_CATEGORY_NAME)!;
                expect(favoritesCategory).to.containSubset({
                  childCategories: [
                    {
                      label: parentCategory.label,
                      childCategories: [
                        {
                          label: childCategory.label,
                        },
                      ],
                    },
                  ],
                });
                expect(data.records[`${FAVORITES_CATEGORY_NAME}-${childCategory.name}`].length).to.eq(1);
                expect(data.records[`${FAVORITES_CATEGORY_NAME}-${childCategory.name}`]).to.containSubset([
                  {
                    property: { displayLabel: propertiesField.label },
                  },
                ]);
              } else {
                expect(data.records[FAVORITES_CATEGORY_NAME].length).to.eq(1);
                expect(data.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq(propertiesField.label);
              }
            });

            it("doesn't put duplicate records for merged nested content fields that have multiple favorite properties", async () => {
              const parentCategory = createTestCategoryDescription({ name: "parent-category", label: "Parent" });
              const childCategory = createTestCategoryDescription({ name: "child-category", label: "Child", parent: parentCategory });
              const propertiesField1 = createTestSimpleContentField({ name: "primitive-property-1", label: "Primitive 1", category: childCategory });
              const propertiesField2 = createTestSimpleContentField({ name: "primitive-property-2", label: "Primitive 2", category: childCategory });
              const nestedContentField = createTestNestedContentField({
                name: "nested-content-field",
                label: "Nested Content",
                category: parentCategory,
                nestedFields: [propertiesField1, propertiesField2],
              });
              const descriptor = createTestContentDescriptor({ fields: [nestedContentField] });

              favoritePropertiesManager.hasAsync.callsFake(async (field) => {
                return field.name === propertiesField1.name || field.name === propertiesField2.name;
              });

              const values: ValuesDictionary<any> = {
                [nestedContentField.name]: undefined,
              };
              const displayValues: ValuesDictionary<any> = {
                [nestedContentField.name]: "*** Varies ***",
              };
              const record = createTestContentItem({ values, displayValues, mergedFieldNames: [nestedContentField.name] });
              (provider as any).getContent = async () => new Content(descriptor, [record]);

              const data = await provider.getData();
              expect(data.categories.length).to.eq(2);

              if (provider.isNestedPropertyCategoryGroupingEnabled) {
                const favoritesCategory = data.categories.find((c) => c.name === FAVORITES_CATEGORY_NAME)!;
                expect(favoritesCategory.childCategories!.length).to.eq(1);
                expect(favoritesCategory.childCategories).to.containSubset([
                  {
                    label: "Parent",
                  },
                ]);
                expect(data.records[`${FAVORITES_CATEGORY_NAME}-${childCategory.name}`].length).to.eq(1);
                expect(data.records[`${FAVORITES_CATEGORY_NAME}-${childCategory.name}`]).to.containSubset([
                  {
                    property: { displayLabel: "Nested Content" },
                  },
                ]);
              } else {
                expect(data.records[FAVORITES_CATEGORY_NAME].length).to.eq(1);
                expect(data.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.be.eq(nestedContentField.label);
              }
            });
          });
        });

        it("sorts categories according to sortCategories callback", async () => {
          provider.sortCategories = (cats: CategoryDescription[]) => {
            cats.sort((lhs: CategoryDescription, rhs: CategoryDescription): number => {
              if (lhs.label < rhs.label) {
                return -1;
              }
              if (lhs.label > rhs.label) {
                return 1;
              }
              return 0;
            });
          };

          const categoryAA = createTestCategoryDescription({
            priority: 1,
            name: "aa",
            label: "aa",
          });
          const categoryBB = createTestCategoryDescription({
            priority: 1,
            name: "bb",
            label: "bb",
          });
          const categoryB = createTestCategoryDescription({
            priority: 1,
            name: "b",
            label: "b",
            parent: categoryBB,
          });
          const categoryC = createTestCategoryDescription({
            priority: 2,
            name: "c",
            label: "c",
            parent: categoryAA,
          });
          const categoryA = createTestCategoryDescription({
            priority: 3,
            name: "a",
            label: "a",
            parent: categoryAA,
          });
          const descriptor = createTestContentDescriptor({
            fields: [
              createTestSimpleContentField({ category: categoryB }),
              createTestSimpleContentField({ category: categoryC }),
              createTestSimpleContentField({ category: categoryA }),
            ],
          });
          const values: ValuesDictionary<any> = {};
          const displayValues: ValuesDictionary<any> = {};
          const record = createTestContentItem({ values, displayValues });
          (provider as any).getContent = async () => new Content(descriptor, [record]);

          const data = await provider.getData();
          if (provider.isNestedPropertyCategoryGroupingEnabled) {
            expect(data.categories[0].label).to.eq("aa");
            expect(data.categories[0].childCategories![0].label).to.eq("a");
            expect(data.categories[0].childCategories![1].label).to.eq("c");
            expect(data.categories[1].label).to.eq("bb");
            expect(data.categories[1].childCategories![0].label).to.eq("b");
          } else {
            expect(data.categories[0].label).to.eq("a");
            expect(data.categories[1].label).to.eq("b");
            expect(data.categories[2].label).to.eq("c");
          }
        });

        it("sorts records according to sortFields callback", async () => {
          (provider as any).sortFields = async (_cat: CategoryDescription, fields: Field[]) => {
            fields.sort((lhs: Field, rhs: Field): number => {
              if (lhs.label < rhs.label) {
                return -1;
              }
              if (lhs.label > rhs.label) {
                return 1;
              }
              return 0;
            });
          };
          const category = createTestCategoryDescription();
          const descriptor = createTestContentDescriptor({
            fields: [
              createTestSimpleContentField({ category, name: "b", priority: 1, label: "b" }),
              createTestSimpleContentField({ category, name: "c", priority: 2, label: "c" }),
              createTestSimpleContentField({ category, name: "a", priority: 3, label: "a" }),
            ],
          });
          const values: ValuesDictionary<any> = {};
          const displayValues: ValuesDictionary<any> = {};
          const record = createTestContentItem({ values, displayValues });
          (provider as any).getContent = async () => new Content(descriptor, [record]);

          const data = await provider.getData();
          const records = data.records[category.name];
          expect(records.length).to.eq(3);
          expect(records).to.containSubset([
            {
              property: { displayLabel: "a" },
            },
            {
              property: { displayLabel: "b" },
            },
            {
              property: { displayLabel: "c" },
            },
          ]);
        });

        it("hides records according to isFieldHidden callback", async () => {
          provider.isFieldHidden = (_field: Field) => true;
          const descriptor = createTestContentDescriptor({
            fields: [createTestSimpleContentField(), createTestSimpleContentField(), createTestSimpleContentField()],
          });
          const values: ValuesDictionary<any> = {};
          const displayValues: ValuesDictionary<any> = {};
          const record = createTestContentItem({ values, displayValues });
          (provider as any).getContent = async () => new Content(descriptor, [record]);
          const data = await provider.getData();
          expect(data.categories.length).to.eq(0);
        });
      });
    }

    runAllTestCases("with flat categories", () => (provider.isNestedPropertyCategoryGroupingEnabled = false));
    runAllTestCases("with nested categories", () => (provider.isNestedPropertyCategoryGroupingEnabled = true));
  });

  describe("getPropertyRecordInstanceKeys", () => {
    it("returns empty list when there's no content", async () => {
      (provider as any).getContent = async () => undefined;
      const record = PropertyRecord.fromString("test");
      expect(await provider.getPropertyRecordInstanceKeys(record)).to.deep.eq([]);
    });

    it("returns empty list when record is not made from current content", async () => {
      (provider as any).getContent = async () => new Content(createTestContentDescriptor({ fields: [] }), [new Item([], "", "", undefined, {}, {}, [])]);
      const record = PropertyRecord.fromString("test");
      expect(await provider.getPropertyRecordInstanceKeys(record)).to.deep.eq([]);
    });

    it("returns root level field instance keys", async () => {
      const instanceKeys = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
      (provider as any).getContent = async () =>
        new Content(
          createTestContentDescriptor({
            fields: [createTestSimpleContentField({ name: "test-field-name" })],
          }),
          [new Item(instanceKeys, "", "", undefined, { ["test-field-name"]: "value" }, {}, [])],
        );
      const record = PropertyRecord.fromString("value", "test-field-name");
      expect(await provider.getPropertyRecordInstanceKeys(record)).to.deep.eq(instanceKeys);
    });

    it("returns nested field instance keys", async () => {
      const instanceKeys = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" }), createTestECInstanceKey({ id: "0x3" })];
      (provider as any).getContent = async () =>
        new Content(
          createTestContentDescriptor({
            fields: [
              createTestNestedContentField({
                name: "root-field",
                nestedFields: [createTestSimpleContentField({ name: "nested-field" })],
              }),
            ],
          }),
          [
            new Item(
              [],
              "",
              "",
              undefined,
              {
                ["root-field"]: [
                  {
                    primaryKeys: [instanceKeys[0]],
                    values: { ["nested-field"]: "value1" },
                    displayValues: {},
                    mergedFieldNames: [],
                  },
                  {
                    primaryKeys: [instanceKeys[1], instanceKeys[2]],
                    values: { ["nested-field"]: "value2" },
                    displayValues: {},
                    mergedFieldNames: [],
                  },
                ],
              },
              {},
              [],
            ),
          ],
        );
      const record = PropertyRecord.fromString("", combineFieldNames("nested-field", "root-field"));
      expect(await provider.getPropertyRecordInstanceKeys(record)).to.deep.eq(instanceKeys);
    });
  });
});

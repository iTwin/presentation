/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyRecord } from "@itwin/appui-abstract";
import { PropertyData } from "@itwin/components-react";
import { IModelApp, IModelConnection, ITwinIdArg, PreferenceArg, PreferenceKeyArg, TokenArg } from "@itwin/core-frontend";
import { Field, KeySet } from "@itwin/presentation-common";
import { DEFAULT_PROPERTY_GRID_RULESET, PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { createFavoritePropertiesStorage, DefaultFavoritePropertiesStorageTypes, FavoritePropertiesScope, Presentation } from "@itwin/presentation-frontend";
import { TestIModelConnection } from "@itwin/presentation-testing";
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Favorite properties", () => {
  const FAVORITES_CATEGORY_NAME = "Favorite";

  let imodel: IModelConnection;
  function openIModel() {
    imodel = TestIModelConnection.openFile("assets/datasets/Properties_60InstancesWithUrl2.ibim");
    expect(imodel).is.not.null;
  }

  before(async () => {
    await initialize();
    openIModel();
  });

  after(async () => {
    await imodel.close();
    await terminate();
  });

  let propertiesDataProvider: PresentationPropertyDataProvider;

  beforeEach(async () => {
    propertiesDataProvider = new PresentationPropertyDataProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
    propertiesDataProvider.isNestedPropertyCategoryGroupingEnabled = false;
  });

  const getPropertyRecordByLabel = (props: PropertyData, label: string): PropertyRecord | undefined => {
    for (const category of props.categories) {
      const record = props.records[category.name].find((r) => r.property.displayLabel === label);
      if (record) {
        return record;
      }
    }
    return undefined;
  };

  describe("favoriting different types of properties", () => {
    beforeEach(async () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      await Presentation.favoriteProperties.initializeConnection(imodel);

      // note: Presentation is initialized without client services, so favorite properties are stored locally - clearing
      // them doesn't affect what's stored in user settings service
      await Presentation.favoriteProperties.clear(imodel, FavoritePropertiesScope.Global);
      await Presentation.favoriteProperties.clear(imodel, FavoritePropertiesScope.ITwin);
      await Presentation.favoriteProperties.clear(imodel, FavoritePropertiesScope.IModel);
    });

    it("creates Property Data with favorite properties category", async () => {
      propertiesDataProvider.keys = new KeySet([{ className: "PCJ_TestSchema:TestClass", id: "0x38" }]);
      let propertyData = await propertiesDataProvider.getData();
      const categoriesCountBefore = propertyData.categories.length;
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.false;

      // find the property record to make the property favorite
      const record = getPropertyRecordByLabel(propertyData, "Country")!;
      const field = await propertiesDataProvider.getFieldByPropertyDescription(record.property);
      await Presentation.favoriteProperties.add(field!, imodel, FavoritePropertiesScope.Global);

      // verify we have a new favorites category
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.categories.length).to.be.eq(categoriesCountBefore + 1);
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.true;
    });

    it("favorites all properties under nested content field", async () => {
      // request properties for 1 element
      propertiesDataProvider.keys = new KeySet([{ className: "Generic:PhysicalObject", id: "0x74" }]);
      let propertyData = await propertiesDataProvider.getData();
      const categoriesCountBefore = propertyData.categories.length;
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.false;

      // request properties for 2 elements
      propertiesDataProvider.keys = new KeySet([
        { className: "PCJ_TestSchema:TestClass", id: "0x38" },
        { className: "Generic:PhysicalObject", id: "0x74" },
      ]);
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.false;

      // find the property record to make the property favorite
      const record = getPropertyRecordByLabel(propertyData, "area")!;
      const field = await propertiesDataProvider.getFieldByPropertyDescription(record.property);
      await Presentation.favoriteProperties.add(field!, imodel, FavoritePropertiesScope.Global);

      // request properties for 1 element again
      propertiesDataProvider.keys = new KeySet([{ className: "Generic:PhysicalObject", id: "0x74" }]);
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.categories.length).to.eq(categoriesCountBefore + 1);
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.true;
    });

    it("favorites common properties of different element types", async () => {
      propertiesDataProvider.keys = new KeySet([{ className: "Generic:PhysicalObject", id: "0x74" }]);
      let propertyData = await propertiesDataProvider.getData();
      const categoriesCountBefore = propertyData.categories.length;
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.false;

      // find the property record to make the property favorite
      const record = getPropertyRecordByLabel(propertyData, "Model")!;
      const field = await propertiesDataProvider.getFieldByPropertyDescription(record.property);
      await Presentation.favoriteProperties.add(field!, imodel, FavoritePropertiesScope.Global);

      // verify the property is now in favorites group
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.categories.length).to.eq(categoriesCountBefore + 1);
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.true;
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("Model");

      // verify the same property is now in favorites group when requesting content for another type of element
      propertiesDataProvider.keys = new KeySet([{ className: "PCJ_TestSchema:TestClass", id: "0x38" }]);
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.true;
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("Model");
    });

    it("favorites nested content property with the same name as a property on primary instance", async () => {
      propertiesDataProvider.keys = new KeySet([{ className: "Generic:PhysicalObject", id: "0x74" }]);
      let propertyData = await propertiesDataProvider.getData();
      const categoriesCountBefore = propertyData.categories.length;
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.false;

      // find the property record to make the property favorite
      const sourceInfoModelSourceCategory = propertyData.categories.find((c) => c.name.endsWith("model_source"))!;
      const sourceFileNameRecord = propertyData.records[sourceInfoModelSourceCategory.name][0];
      const field = await propertiesDataProvider.getFieldByPropertyDescription(sourceFileNameRecord.property);
      await Presentation.favoriteProperties.add(field!, imodel, FavoritePropertiesScope.Global);

      // verify the property is now in favorites group
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.categories.length).to.eq(categoriesCountBefore + 1);
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.true;
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq(sourceFileNameRecord.property.displayLabel);
    });
  });

  describe("ordering", () => {
    beforeEach(async () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      await Presentation.favoriteProperties.initializeConnection(imodel);

      // note: Presentation is initialized without client services, so favorite properties are stored locally - clearing
      // them doesn't affect what's stored in user settings service
      await Presentation.favoriteProperties.clear(imodel, FavoritePropertiesScope.Global);
      await Presentation.favoriteProperties.clear(imodel, FavoritePropertiesScope.ITwin);
      await Presentation.favoriteProperties.clear(imodel, FavoritePropertiesScope.IModel);
    });

    const makeFieldFavorite = async (propertyData: PropertyData, fieldLabel: string) => {
      const record = getPropertyRecordByLabel(propertyData, fieldLabel)!;
      const field = await propertiesDataProvider.getFieldByPropertyDescription(record.property);
      await Presentation.favoriteProperties.add(field!, imodel, FavoritePropertiesScope.Global);
    };

    it("moves a field to the top", async () => {
      propertiesDataProvider.keys = new KeySet([{ className: "PCJ_TestSchema:TestClass", id: "0x65" }]);

      let propertyData = await propertiesDataProvider.getData();
      await makeFieldFavorite(propertyData, "Model");
      await makeFieldFavorite(propertyData, "Category");

      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.records[FAVORITES_CATEGORY_NAME].length).to.eq(2);
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("Model");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][1].property.displayLabel).to.eq("Category");

      const visibleFavoriteFields = await Promise.all(
        propertyData.records[FAVORITES_CATEGORY_NAME].map(async (r) => propertiesDataProvider.getFieldByPropertyDescription(r.property)),
      );
      expect(visibleFavoriteFields.every((f) => f !== undefined)).to.be.true;

      const record = getPropertyRecordByLabel(propertyData, "Category")!;
      const field = await propertiesDataProvider.getFieldByPropertyDescription(record.property);
      await Presentation.favoriteProperties.changeFieldPriority(imodel, field!, undefined, visibleFavoriteFields as Field[]);

      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("Category");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][1].property.displayLabel).to.eq("Model");
    });

    it("keeps the logical order of non-visible fields when there are relevant fields", async () => {
      propertiesDataProvider.keys = new KeySet([
        { className: "PCJ_TestSchema:TestClass", id: "0x65" },
        { className: "Generic:PhysicalObject", id: "0x74" },
      ]);

      let propertyData = await propertiesDataProvider.getData();
      await makeFieldFavorite(propertyData, "Code");
      await makeFieldFavorite(propertyData, "area");
      await makeFieldFavorite(propertyData, "Model"); // `Model` is relevant for property `area`

      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.records[FAVORITES_CATEGORY_NAME].length).to.eq(3);
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("Code");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][1].property.displayLabel).to.eq("area");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][2].property.displayLabel).to.eq("Model");

      propertiesDataProvider.keys = new KeySet([{ className: "PCJ_TestSchema:TestClass", id: "0x65" }]); // element without `area` property
      propertyData = await propertiesDataProvider.getData();

      const visibleFavoriteFields = await Promise.all(
        propertyData.records[FAVORITES_CATEGORY_NAME].map(async (r) => propertiesDataProvider.getFieldByPropertyDescription(r.property)),
      );
      expect(visibleFavoriteFields.every((f) => f !== undefined)).to.be.true;

      let record = getPropertyRecordByLabel(propertyData, "Code")!;
      const codeField = (await propertiesDataProvider.getFieldByPropertyDescription(record.property))!;
      record = getPropertyRecordByLabel(propertyData, "Model")!;
      const modelField = (await propertiesDataProvider.getFieldByPropertyDescription(record.property))!;
      await Presentation.favoriteProperties.changeFieldPriority(imodel, codeField, modelField, visibleFavoriteFields as Field[]);

      propertiesDataProvider.keys = new KeySet([
        { className: "PCJ_TestSchema:TestClass", id: "0x65" },
        { className: "Generic:PhysicalObject", id: "0x74" },
      ]);
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("area");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][1].property.displayLabel).to.eq("Model");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][2].property.displayLabel).to.eq("Code");
    });

    it("keeps the logical order of non-visible fields when there are no relevant fields", async () => {
      propertiesDataProvider.keys = new KeySet([
        { className: "PCJ_TestSchema:TestClass", id: "0x65" },
        { className: "Generic:PhysicalObject", id: "0x74" },
      ]);

      let propertyData = await propertiesDataProvider.getData();
      await makeFieldFavorite(propertyData, "Code");
      await makeFieldFavorite(propertyData, "area");
      await makeFieldFavorite(propertyData, "Country"); // `Country` is irrelevant for property `area`

      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.records[FAVORITES_CATEGORY_NAME].length).to.eq(3);
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("Code");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][1].property.displayLabel).to.eq("area");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][2].property.displayLabel).to.eq("Country");

      propertiesDataProvider.keys = new KeySet([{ className: "PCJ_TestSchema:TestClass", id: "0x65" }]); // element without `area` property
      propertyData = await propertiesDataProvider.getData();

      const visibleFavoriteFields = await Promise.all(
        propertyData.records[FAVORITES_CATEGORY_NAME].map(async (r) => propertiesDataProvider.getFieldByPropertyDescription(r.property)),
      );
      expect(visibleFavoriteFields.every((f) => f !== undefined)).to.be.true;

      let record = getPropertyRecordByLabel(propertyData, "Code")!;
      const codeField = (await propertiesDataProvider.getFieldByPropertyDescription(record.property))!;
      record = getPropertyRecordByLabel(propertyData, "Country")!;
      const modelField = (await propertiesDataProvider.getFieldByPropertyDescription(record.property))!;
      await Presentation.favoriteProperties.changeFieldPriority(imodel, codeField, modelField, visibleFavoriteFields as Field[]);

      propertiesDataProvider.keys = new KeySet([
        { className: "PCJ_TestSchema:TestClass", id: "0x65" },
        { className: "Generic:PhysicalObject", id: "0x74" },
      ]);
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("Country");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][1].property.displayLabel).to.eq("Code");
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][2].property.displayLabel).to.eq("area");
    });
  });

  describe("re-initialization", () => {
    const storage = new Map<string, any>();
    before(async () => {
      sinon.stub(IModelApp, "userPreferences").get(() => ({
        get: async (arg: PreferenceKeyArg & ITwinIdArg & TokenArg) => storage.get(arg.key),
        save: async (arg: PreferenceArg & ITwinIdArg & TokenArg) => storage.set(arg.key, arg.content),
        delete: async (arg: PreferenceKeyArg & ITwinIdArg & TokenArg) => storage.delete(arg.key),
      }));
      sinon.stub(IModelApp, "authorizationClient").get(() => ({
        getAccessToken: async () => "accessToken",
      }));
      Presentation.terminate();
      await Presentation.initialize({
        favorites: {
          storage: createFavoritePropertiesStorage(DefaultFavoritePropertiesStorageTypes.UserPreferencesStorage),
        },
      });
    });

    after(() => {
      sinon.restore();
    });

    it("favorite properties survive Presentation re-initialization", async () => {
      propertiesDataProvider.keys = new KeySet([{ className: "Generic:PhysicalObject", id: "0x74" }]);
      let propertyData = await propertiesDataProvider.getData();
      expect(propertyData.categories.length).to.be.eq(5);
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.false;

      // find the property record to make the property favorite
      const record = getPropertyRecordByLabel(propertyData, "Model")!;
      const field = await propertiesDataProvider.getFieldByPropertyDescription(record.property);
      await Presentation.favoriteProperties.add(field!, imodel, FavoritePropertiesScope.Global);

      // verify the property is now in favorites group
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.categories.length).to.eq(6);
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.true;
      expect(propertyData.records[FAVORITES_CATEGORY_NAME].length).to.eq(1);
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("Model");

      // refresh Presentation
      Presentation.terminate();
      await Presentation.initialize({
        favorites: {
          storage: createFavoritePropertiesStorage(DefaultFavoritePropertiesStorageTypes.UserPreferencesStorage),
        },
      });

      propertiesDataProvider = new PresentationPropertyDataProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
      propertiesDataProvider.isNestedPropertyCategoryGroupingEnabled = false;
      propertiesDataProvider.keys = new KeySet([{ className: "Generic:PhysicalObject", id: "0x74" }]);

      // verify the property is still in favorites group
      propertyData = await propertiesDataProvider.getData();
      expect(propertyData.categories.length).to.eq(6);
      expect(propertyData.categories.some((category) => category.name === FAVORITES_CATEGORY_NAME)).to.be.true;
      expect(propertyData.records[FAVORITES_CATEGORY_NAME].length).to.eq(1);
      expect(propertyData.records[FAVORITES_CATEGORY_NAME][0].property.displayLabel).to.eq("Model");
    });
  });
});

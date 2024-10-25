/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyDescription, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { FavoritePropertiesManager, FavoritePropertiesScope, Presentation } from "@itwin/presentation-frontend";
import { IPresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider";
import { FavoritePropertiesDataFilterer } from "../../presentation-components/propertygrid/FavoritePropertiesDataFilterer";
import { createTestSimpleContentField } from "../_helpers/Content";
import { createArrayProperty, createPrimitiveStringProperty, createStructProperty } from "../_helpers/Properties";
import { createStub } from "../TestUtils";

describe("FavoritePropertiesDataFilterer", () => {
  const imodel = {} as IModelConnection;
  const dataProvider = {
    getFieldByPropertyDescription: createStub<IPresentationPropertyDataProvider["getFieldByPropertyDescription"]>(),
    imodel,
  };

  function getProvider() {
    return dataProvider as unknown as IPresentationPropertyDataProvider;
  }

  beforeEach(() => {
    dataProvider.getFieldByPropertyDescription.reset();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("uses `FavoritePropertiesManager.hasAsync` to determine favorites if it's available and callback is not provided through props", async () => {
    const record = createPrimitiveStringProperty("Property", "Value");
    const matchingField = createTestSimpleContentField();

    dataProvider.getFieldByPropertyDescription.resolves(matchingField);

    const manager = sinon.createStubInstance(FavoritePropertiesManager);
    manager.hasAsync.callsFake(async (field) => field === matchingField);

    sinon.stub(Presentation, "favoriteProperties").get(() => manager);

    const filterer = new FavoritePropertiesDataFilterer({
      source: getProvider(),
      favoritesScope: FavoritePropertiesScope.Global,
      isActive: true,
    });
    const matchResult = await filterer.recordMatchesFilter(record, []);
    expect(manager.hasAsync).to.be.called;
    expect(matchResult).to.deep.eq({ matchesFilter: true, shouldExpandNodeParents: true });
  });

  it("uses `FavoritePropertiesManager.has` to determine favorites if `hasAsync` is not available and callback is not provided through props", async () => {
    const record = createPrimitiveStringProperty("Property", "Value");
    const matchingField = createTestSimpleContentField();

    dataProvider.getFieldByPropertyDescription.resolves(matchingField);

    const manager = sinon.createStubInstance(FavoritePropertiesManager);
    Object.assign(manager, { hasAsync: undefined });
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    manager.has.callsFake((field) => field === matchingField);

    sinon.stub(Presentation, "favoriteProperties").get(() => manager);

    const filterer = new FavoritePropertiesDataFilterer({
      source: getProvider(),
      favoritesScope: FavoritePropertiesScope.Global,
      isActive: true,
    });
    const matchResult = await filterer.recordMatchesFilter(record, []);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(manager.has).to.be.called;
    expect(matchResult).to.deep.eq({ matchesFilter: true, shouldExpandNodeParents: true });
  });

  it("raises `onFilterChanged` event when filterer is enabled / disabled", () => {
    const filterer = new FavoritePropertiesDataFilterer({
      source: getProvider(),
      favoritesScope: FavoritePropertiesScope.Global,
    });
    const spy = sinon.spy();
    filterer.onFilterChanged.addListener(spy);

    filterer.isActive = false;
    expect(spy).to.not.be.called;

    filterer.isActive = true;
    expect(spy).to.be.calledOnce;

    filterer.isActive = true;
    expect(spy).to.be.calledOnce;

    filterer.isActive = false;
    expect(spy).to.be.calledTwice;
  });

  describe("when filtering is disabled", () => {
    const recordsToTest: PropertyRecord[] = [
      createPrimitiveStringProperty("Property", "value1", undefined),
      createPrimitiveStringProperty("Property", "value1", ""),
      createPrimitiveStringProperty("Property", "value1", "test_value"),
      createArrayProperty("Array"),
      createStructProperty("Struct"),
    ];

    let filterer: FavoritePropertiesDataFilterer;
    beforeEach(() => {
      filterer = new FavoritePropertiesDataFilterer({
        source: getProvider(),
        favoritesScope: FavoritePropertiesScope.IModel,
        isFavorite: () => false,
      });
      expect(filterer.isActive).to.be.false;
    });

    for (const record of recordsToTest) {
      const recordType = PropertyValueFormat[record.value.valueFormat];
      it(`should always match \`propertyRecord\` (type: ${recordType})`, async () => {
        const matchResult = await filterer.recordMatchesFilter(record, []);
        expect(matchResult).to.deep.eq({ matchesFilter: true });
      });
    }

    it(`should always return \`'matchesFilter: true\` when calling \`categoryMatchesFilter\``, async () => {
      const matchResult = await filterer.categoryMatchesFilter();
      expect(matchResult).to.deep.eq({ matchesFilter: true });
    });
  });

  describe("when filtering is enabled", () => {
    const recordsToTest: PropertyRecord[] = [createPrimitiveStringProperty("Property", "value1"), createArrayProperty("Array"), createStructProperty("Struct")];

    const isFavoriteStub = sinon.stub();
    let filterer: FavoritePropertiesDataFilterer;
    beforeEach(() => {
      isFavoriteStub.reset();
      filterer = new FavoritePropertiesDataFilterer({
        source: getProvider(),
        favoritesScope: FavoritePropertiesScope.IModel,
        isActive: true,
        isFavorite: isFavoriteStub,
      });
    });

    for (const record of recordsToTest) {
      const recordType = PropertyValueFormat[record.value.valueFormat];

      it(`should not match propertyRecord when \`getFieldByPropertyDescription\` cannot find record field (type: ${recordType})`, async () => {
        dataProvider.getFieldByPropertyDescription.resolves(undefined);
        const matchResult = await filterer.recordMatchesFilter(record, []);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it(`should not match \`propertyRecord\` when record is not favorite and has no parents (type: ${recordType})`, async () => {
        isFavoriteStub.returns(false);
        dataProvider.getFieldByPropertyDescription.resolves(createTestSimpleContentField());
        const matchResult = await filterer.recordMatchesFilter(record, []);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it(`should not match \`propertyRecord\` when record is not favorite and has non favorite parents (type: ${recordType})`, async () => {
        isFavoriteStub.returns(false);
        dataProvider.getFieldByPropertyDescription.resolves(createTestSimpleContentField());
        const matchResult = await filterer.recordMatchesFilter(record, [createStructProperty("Struct"), createArrayProperty("Array")]);
        expect(matchResult).to.deep.eq({ matchesFilter: false });
      });

      it(`should match \`propertyRecord\` when record is favorite and has no parents (type: ${recordType})`, async () => {
        isFavoriteStub.returns(true);
        dataProvider.getFieldByPropertyDescription.resolves(createTestSimpleContentField());
        const matchResult = await filterer.recordMatchesFilter(record, []);
        expect(matchResult).to.deep.eq({ matchesFilter: true, shouldExpandNodeParents: true });
      });

      it(`should match \`propertyRecord\` when record is not favorite and has favorite parents (type: ${recordType})`, async () => {
        const favoriteParentRecord = createStructProperty("FavoriteStruct");
        const favoriteParentField = createTestSimpleContentField();

        dataProvider.getFieldByPropertyDescription.callsFake(async (arg: PropertyDescription) => {
          if (arg.name === favoriteParentRecord.property.name) {
            return favoriteParentField;
          }
          return createTestSimpleContentField();
        });

        isFavoriteStub.returns(false);
        isFavoriteStub.withArgs(favoriteParentField, sinon.match.any, sinon.match.any).returns(true);

        const matchResult = await filterer.recordMatchesFilter(record, [favoriteParentRecord]);
        expect(matchResult).to.deep.eq({ matchesFilter: true });
      });
    }

    it("should not match when calling `categoryMatchesFilter`", async () => {
      const matchResult = await filterer.categoryMatchesFilter();
      expect(matchResult).to.deep.eq({ matchesFilter: false });
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyDescription, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { FavoritePropertiesManager, FavoritePropertiesScope, Presentation } from "@itwin/presentation-frontend";
import { IPresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider.js";
import { FavoritePropertiesDataFilterer } from "../../presentation-components/propertygrid/FavoritePropertiesDataFilterer.js";
import { createTestSimpleContentField } from "../_helpers/Content.js";
import { createArrayProperty, createPrimitiveStringProperty, createStructProperty } from "../_helpers/Properties.js";
import { createMocked, createStub } from "../TestUtils.js";

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
    dataProvider.getFieldByPropertyDescription.mockReset();
  });

  it("uses `FavoritePropertiesManager.hasAsync` to determine favorites if it's available and callback is not provided through props", async () => {
    const record = createPrimitiveStringProperty("Property", "Value");
    const matchingField = createTestSimpleContentField();

    dataProvider.getFieldByPropertyDescription.mockResolvedValue(matchingField);

    const manager = createMocked(FavoritePropertiesManager);
    manager.hasAsync.mockImplementation(async (field) => field === matchingField);

    vi.spyOn(Presentation, "favoriteProperties", "get").mockReturnValue(manager);

    const filterer = new FavoritePropertiesDataFilterer({
      source: getProvider(),
      favoritesScope: FavoritePropertiesScope.Global,
      isActive: true,
    });
    const matchResult = await filterer.recordMatchesFilter(record, []);
    expect(manager.hasAsync).toHaveBeenCalled();
    expect(matchResult).toEqual({ matchesFilter: true, shouldExpandNodeParents: true });
  });

  it("uses `FavoritePropertiesManager.has` to determine favorites if `hasAsync` is not available and callback is not provided through props", async () => {
    const record = createPrimitiveStringProperty("Property", "Value");
    const matchingField = createTestSimpleContentField();

    dataProvider.getFieldByPropertyDescription.mockResolvedValue(matchingField);

    const manager = createMocked(FavoritePropertiesManager);
    Object.assign(manager, { hasAsync: undefined });
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    manager.has.mockImplementation((field) => field === matchingField);

    vi.spyOn(Presentation, "favoriteProperties", "get").mockReturnValue(manager);

    const filterer = new FavoritePropertiesDataFilterer({
      source: getProvider(),
      favoritesScope: FavoritePropertiesScope.Global,
      isActive: true,
    });
    const matchResult = await filterer.recordMatchesFilter(record, []);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(manager.has).toHaveBeenCalled();
    expect(matchResult).toEqual({ matchesFilter: true, shouldExpandNodeParents: true });
  });

  it("raises `onFilterChanged` event when filterer is enabled / disabled", () => {
    const filterer = new FavoritePropertiesDataFilterer({
      source: getProvider(),
      favoritesScope: FavoritePropertiesScope.Global,
    });
    const spy = vi.fn();
    filterer.onFilterChanged.addListener(spy);

    filterer.isActive = false;
    expect(spy).not.toHaveBeenCalled();

    filterer.isActive = true;
    expect(spy).toHaveBeenCalledOnce();

    filterer.isActive = true;
    expect(spy).toHaveBeenCalledOnce();

    filterer.isActive = false;
    expect(spy).toHaveBeenCalledTimes(2);
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
      expect(filterer.isActive).toBe(false);
    });

    for (const record of recordsToTest) {
      const recordType = PropertyValueFormat[record.value.valueFormat];
      it(`should always match \`propertyRecord\` (type: ${recordType})`, async () => {
        const matchResult = await filterer.recordMatchesFilter(record, []);
        expect(matchResult).toEqual({ matchesFilter: true });
      });
    }

    it(`should always return \`'matchesFilter: true\` when calling \`categoryMatchesFilter\``, async () => {
      const matchResult = await filterer.categoryMatchesFilter();
      expect(matchResult).toEqual({ matchesFilter: true });
    });
  });

  describe("when filtering is enabled", () => {
    const recordsToTest: PropertyRecord[] = [
      createPrimitiveStringProperty("Property", "value1"),
      createArrayProperty("Array"),
      createStructProperty("Struct"),
    ];

    const isFavoriteStub = vi.fn();
    let filterer: FavoritePropertiesDataFilterer;
    beforeEach(() => {
      isFavoriteStub.mockReset();
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
        dataProvider.getFieldByPropertyDescription.mockResolvedValue(undefined);
        const matchResult = await filterer.recordMatchesFilter(record, []);
        expect(matchResult).toEqual({ matchesFilter: false });
      });

      it(`should not match \`propertyRecord\` when record is not favorite and has no parents (type: ${recordType})`, async () => {
        isFavoriteStub.mockReturnValue(false);
        dataProvider.getFieldByPropertyDescription.mockResolvedValue(createTestSimpleContentField());
        const matchResult = await filterer.recordMatchesFilter(record, []);
        expect(matchResult).toEqual({ matchesFilter: false });
      });

      it(`should not match \`propertyRecord\` when record is not favorite and has non favorite parents (type: ${recordType})`, async () => {
        isFavoriteStub.mockReturnValue(false);
        dataProvider.getFieldByPropertyDescription.mockResolvedValue(createTestSimpleContentField());
        const matchResult = await filterer.recordMatchesFilter(record, [
          createStructProperty("Struct"),
          createArrayProperty("Array"),
        ]);
        expect(matchResult).toEqual({ matchesFilter: false });
      });

      it(`should match \`propertyRecord\` when record is favorite and has no parents (type: ${recordType})`, async () => {
        isFavoriteStub.mockReturnValue(true);
        dataProvider.getFieldByPropertyDescription.mockResolvedValue(createTestSimpleContentField());
        const matchResult = await filterer.recordMatchesFilter(record, []);
        expect(matchResult).toEqual({ matchesFilter: true, shouldExpandNodeParents: true });
      });

      it(`should match \`propertyRecord\` when record is not favorite and has favorite parents (type: ${recordType})`, async () => {
        const favoriteParentRecord = createStructProperty("FavoriteStruct");
        const favoriteParentField = createTestSimpleContentField();

        dataProvider.getFieldByPropertyDescription.mockImplementation(async (arg: PropertyDescription) => {
          if (arg.name === favoriteParentRecord.property.name) {
            return favoriteParentField;
          }
          return createTestSimpleContentField();
        });

        isFavoriteStub.mockImplementation((field, ..._rest) => field === favoriteParentField);

        const matchResult = await filterer.recordMatchesFilter(record, [favoriteParentRecord]);
        expect(matchResult).toEqual({ matchesFilter: true });
      });
    }

    it("should not match when calling `categoryMatchesFilter`", async () => {
      const matchResult = await filterer.categoryMatchesFilter();
      expect(matchResult).toEqual({ matchesFilter: false });
    });
  });
});

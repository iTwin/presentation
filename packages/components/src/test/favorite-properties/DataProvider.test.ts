/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyData } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { Ruleset } from "@itwin/presentation-common";
import { FavoritePropertiesManager, Presentation, PresentationManager, SelectionManager, SelectionScopesManager } from "@itwin/presentation-frontend";
import { FavoritePropertiesDataProvider } from "../../presentation-components/favorite-properties/DataProvider.js";
import { getFavoritesCategory } from "../../presentation-components/favorite-properties/Utils.js";
import { PresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider.js";

describe("FavoritePropertiesDataProvider", () => {
  let provider: FavoritePropertiesDataProvider;
  const elementId = "0x11";
  const imodel = {
    async *createQueryReader() {
      yield { toRow: () => ({ ECInstanceId: elementId, ClassName: "BisCore.Element" }) };
    },
  } as unknown as IModelConnection;
  let presentationManager: sinon.SinonStubbedInstance<PresentationManager>;
  let selectionManager: SelectionManager;
  let presentationPropertyDataProvider: {
    getData: sinon.SinonStub<[], PropertyData>;
    [Symbol.dispose]: sinon.SinonStub<[], void>;
  };
  let favoritePropertiesManager: sinon.SinonStubbedInstance<FavoritePropertiesManager>;

  beforeEach(() => {
    presentationManager = sinon.createStubInstance(PresentationManager);
    selectionManager = {
      scopes: {} as SelectionScopesManager,
    } as SelectionManager;
    presentationPropertyDataProvider = {
      getData: sinon.stub(),
      [Symbol.dispose]: sinon.stub(),
    };
    favoritePropertiesManager = sinon.createStubInstance(FavoritePropertiesManager);

    const localization = new EmptyLocalization();
    sinon.stub(Presentation, "presentation").get(() => presentationManager);
    sinon.stub(Presentation, "favoriteProperties").get(() => favoritePropertiesManager);
    sinon.stub(Presentation, "selection").get(() => selectionManager);
    sinon.stub(Presentation, "localization").get(() => localization);

    provider = new FavoritePropertiesDataProvider();
    (provider as any).createPropertyDataProvider = () => presentationPropertyDataProvider;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("constructor", () => {
    it("sets `includeFieldsWithNoValues` to true", () => {
      expect(provider.includeFieldsWithNoValues).to.be.true;
    });

    it("sets `includeFieldsWithCompositeValues` to true", () => {
      expect(provider.includeFieldsWithCompositeValues).to.be.true;
    });
  });

  describe("getData", () => {
    it("passes `customRulesetId` to PropertyDataProvider if set", async () => {
      presentationPropertyDataProvider.getData.resolves({
        label: PropertyRecord.fromString("Test Item"),
        categories: [],
        records: {},
      });
      const factorySpy = sinon
        .stub<[IModelConnection, Ruleset | string | undefined], PresentationPropertyDataProvider>()
        .returns(presentationPropertyDataProvider as unknown as PresentationPropertyDataProvider);

      const customRulesetId = "custom_ruleset_id";
      provider = new FavoritePropertiesDataProvider({ ruleset: customRulesetId });
      (provider as any).createPropertyDataProvider = factorySpy;

      await provider.getData(imodel, elementId);
      expect(factorySpy).to.be.calledWith(imodel, customRulesetId);
    });

    it("returns empty property data when there is no favorite category", async () => {
      const dataToReturn: PropertyData = {
        label: PropertyRecord.fromString("Test Item"),
        categories: [{ label: "Test Category", name: "test", expand: true }],
        records: {
          test: [
            new PropertyRecord(
              { valueFormat: PropertyValueFormat.Primitive, displayValue: "Test Value" },
              { typename: "string", name: "test_prop", displayLabel: "Test Property" },
            ),
          ],
        },
      };
      presentationPropertyDataProvider.getData.resolves(dataToReturn);

      const data = await provider.getData(imodel, elementId);
      expect(data.categories.length).to.eq(0);
      expect(Object.keys(data.records).length).to.eq(0);
    });

    it("filters out only favorite category", async () => {
      const favoritesCategory = getFavoritesCategory();
      const favoritePropertyName = "favoriteProp";
      const regularPropertyName = "regularProp";

      const dataToReturn: PropertyData = {
        label: PropertyRecord.fromString("Test Item"),
        categories: [favoritesCategory, { label: "Test Category", name: "test", expand: true }],
        records: {
          [favoritesCategory.name]: [
            new PropertyRecord(
              { valueFormat: PropertyValueFormat.Primitive, displayValue: "SomeString" },
              { typename: "string", name: favoritePropertyName, displayLabel: "Favorite Property" },
            ),
          ],
          test: [
            new PropertyRecord(
              { valueFormat: PropertyValueFormat.Primitive, displayValue: "1" },
              { typename: "int", name: regularPropertyName, displayLabel: "Regular Property" },
            ),
          ],
        },
      };
      presentationPropertyDataProvider.getData.resolves(dataToReturn);

      const data = await provider.getData(imodel, elementId);
      expect(data.categories.length).to.eq(1);
      expect(data.records[favoritesCategory.name]).to.be.not.undefined;
      expect(data.records[favoritesCategory.name].length).to.eq(1);
      expect(data.records[favoritesCategory.name][0].property.name).to.eq(favoritePropertyName);
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyData } from "@itwin/components-react";
import { Id64String } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet, Ruleset } from "@itwin/presentation-common";
import {
  FavoritePropertiesManager,
  Presentation,
  PresentationManager,
  RulesetManager,
  SelectionManager,
  SelectionScopesManager,
} from "@itwin/presentation-frontend";
import { FavoritePropertiesDataProvider, getFavoritesCategory } from "../../presentation-components/favorite-properties/DataProvider";
import { PresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider";

describe("FavoritePropertiesDataProvider", () => {
  let provider: FavoritePropertiesDataProvider;
  let elementId: Id64String;
  const imodelMock = moq.Mock.ofType<IModelConnection>();
  const presentationManagerMock = moq.Mock.ofType<PresentationManager>();
  const selectionManagerMock = moq.Mock.ofType<SelectionManager>();
  const rulesetsManagerMock = moq.Mock.ofType<RulesetManager>();
  const presentationPropertyDataProviderMock = moq.Mock.ofType<PresentationPropertyDataProvider>();
  const favoritePropertiesManagerMock = moq.Mock.ofType<FavoritePropertiesManager>();
  const factoryMock = moq.Mock.ofType<(imodel: IModelConnection, ruleset?: Ruleset | string) => PresentationPropertyDataProvider>();

  beforeEach(() => {
    elementId = "0x11";
    const localization = new EmptyLocalization();
    sinon.stub(Presentation, "presentation").get(() => presentationManagerMock.object);
    sinon.stub(Presentation, "favoriteProperties").get(() => favoritePropertiesManagerMock.object);
    sinon.stub(Presentation, "selection").get(() => selectionManagerMock.object);
    sinon.stub(Presentation, "localization").get(() => localization);

    presentationManagerMock.setup((x) => x.rulesets()).returns(() => rulesetsManagerMock.object);
    factoryMock.setup((x) => x(moq.It.isAny(), moq.It.isAny())).returns(() => presentationPropertyDataProviderMock.object);
    provider = new FavoritePropertiesDataProvider({ propertyDataProviderFactory: factoryMock.object });
  });

  afterEach(() => {
    presentationManagerMock.reset();
    selectionManagerMock.reset();
    rulesetsManagerMock.reset();
    presentationPropertyDataProviderMock.reset();
    favoritePropertiesManagerMock.reset();
    sinon.restore();
    Presentation.terminate();
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
    beforeEach(() => {
      const selectionScopesManager = moq.Mock.ofType<SelectionScopesManager>();
      selectionScopesManager.setup(async (x) => x.computeSelection(moq.It.isAny(), elementId, moq.It.isAny())).returns(async () => new KeySet());
      selectionManagerMock.setup((x) => x.scopes).returns(() => selectionScopesManager.object);
    });

    it("passes `customRulesetId` to PropertyDataProvider if set", async () => {
      presentationPropertyDataProviderMock
        .setup(async (x) => x.getData())
        .returns(async () => ({
          label: PropertyRecord.fromString("Test Item"),
          categories: [],
          records: {},
        }));

      const customRulesetId = "custom_ruleset_id";
      provider = new FavoritePropertiesDataProvider({ propertyDataProviderFactory: factoryMock.object, ruleset: customRulesetId });

      await provider.getData(imodelMock.object, elementId);
      factoryMock.verify((x) => x(imodelMock.object, customRulesetId), moq.Times.once());
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
      presentationPropertyDataProviderMock.setup(async (x) => x.getData()).returns(async () => dataToReturn);

      const data = await provider.getData(imodelMock.object, elementId);
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
      presentationPropertyDataProviderMock.setup(async (x) => x.getData()).returns(async () => dataToReturn);

      const data = await provider.getData(imodelMock.object, elementId);
      expect(data.categories.length).to.eq(1);
      expect(data.records[favoritesCategory.name]).to.be.not.undefined;
      expect(data.records[favoritesCategory.name].length).to.eq(1);
      expect(data.records[favoritesCategory.name][0].property.name).to.eq(favoritePropertyName);
    });
  });
});

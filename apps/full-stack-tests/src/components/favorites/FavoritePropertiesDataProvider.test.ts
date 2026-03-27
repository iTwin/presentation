/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PropertyRecord } from "@itwin/appui-abstract";
import { PropertyData } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { DEFAULT_PROPERTY_GRID_RULESET, FavoritePropertiesDataProvider, PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { FavoritePropertiesScope, Presentation } from "@itwin/presentation-frontend";
import { initialize, terminate } from "../../IntegrationTests.js";
import { TestIModelConnection } from "../../TestIModelSetup.js";

describe("FavoritePropertiesDataProvider", async () => {
  let imodel: IModelConnection;
  let provider: FavoritePropertiesDataProvider;
  const scope = FavoritePropertiesScope.IModel;

  beforeAll(async () => {
    await initialize();
    const testIModelName: string = "assets/datasets/Properties_60InstancesWithUrl2.ibim";
    imodel = TestIModelConnection.openFile(testIModelName);
  });

  beforeEach(() => {
    provider = new FavoritePropertiesDataProvider({ ruleset: DEFAULT_PROPERTY_GRID_RULESET, activeScopeProvider: () => ({ id: "element" }) });
  });

  afterAll(async () => {
    await imodel.close();
    await terminate();
  });

  afterEach(async () => {
    await Presentation.favoriteProperties.clear(imodel, scope);
  });

  describe("getData", () => {
    it("returns favorite properties", async () => {
      // make a couple of properties favorited
      const propertyProvider = new PresentationPropertyDataProvider({ imodel, ruleset: DEFAULT_PROPERTY_GRID_RULESET });
      propertyProvider.isNestedPropertyCategoryGroupingEnabled = false;
      propertyProvider.keys = new KeySet([{ className: "PCJ_TestSchema:TestClass", id: "0x38" }]);
      const propertyData = await propertyProvider.getData();

      let record = getPropertyRecordByLabel(propertyData, "Country")!;
      let field = await propertyProvider.getFieldByPropertyDescription(record.property);
      await Presentation.favoriteProperties.add(field!, imodel, scope);
      record = getPropertyRecordByLabel(propertyData, "Model")!;
      field = await propertyProvider.getFieldByPropertyDescription(record.property);
      await Presentation.favoriteProperties.add(field!, imodel, scope);

      const tooltipData = await provider.getData(imodel, "0x38");

      expect(tooltipData.categories.length).toBe(1);
      const favoritesCategory = tooltipData.categories[0];
      expect(tooltipData.records[favoritesCategory.name].length).toBe(2);
      expect(tooltipData.records[favoritesCategory.name].some((r) => r.property.displayLabel === "Model")).toBe(true);
      expect(tooltipData.records[favoritesCategory.name].some((r) => r.property.displayLabel === "Country")).toBe(true);
    });
  });
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

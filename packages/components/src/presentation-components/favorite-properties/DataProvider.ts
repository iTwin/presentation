/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module FavoriteProperties
 */

import { PropertyData } from "@itwin/components-react";
import { Id64Arg } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet, Ruleset } from "@itwin/presentation-common";
import { createSelectionScopeProps, Presentation } from "@itwin/presentation-frontend";
import { PresentationPropertyDataProvider } from "../propertygrid/DataProvider.js";
import { getFavoritesCategory } from "./Utils.js";

/**
 * An data provider interface for returning favorite properties for the given elements
 * @public
 */
export interface IFavoritePropertiesDataProvider {
  /** Returns property data for an element. */
  getData: (imodel: IModelConnection, elementIds: Id64Arg | KeySet) => Promise<PropertyData>;
}

/**
 * Props for [[FavoritePropertiesDataProvider]]
 * @public
 */
export interface FavoritePropertiesDataProviderProps {
  /**
   * Id of the ruleset to use when requesting properties or a ruleset itself. If not
   * set, default presentation rules are used which return content for the selected elements.
   */
  ruleset?: Ruleset | string;
}

/**
 * Presentation Rules-driven element favorite properties data provider implementation.
 * @public
 */
export class FavoritePropertiesDataProvider implements IFavoritePropertiesDataProvider {
  private _customRuleset?: Ruleset | string;

  /**
   * Should fields with no values be included in the property list. No value means:
   * - For *primitive* fields: `null`, `undefined`, `""` (empty string)
   * - For *array* fields: `[]` (empty array)
   * - For *struct* fields: `{}` (object with no members)
   */
  public includeFieldsWithNoValues: boolean;

  /**
   * Should fields with composite values be included in the property list.
   * Fields with composite values:
   * - *array* fields.
   * - *struct* fields.
   */
  public includeFieldsWithCompositeValues: boolean;

  /** Constructor. */
  constructor(props?: FavoritePropertiesDataProviderProps) {
    this.includeFieldsWithNoValues = true;
    this.includeFieldsWithCompositeValues = true;
    this._customRuleset = /* c8 ignore next */ props?.ruleset;
  }

  /**
   * Returns PropertyData for the specified elements.
   * PropertyData only contains a single category for favorite properties (if there are any).
   */
  public async getData(imodel: IModelConnection, elementIds: Id64Arg | KeySet): Promise<PropertyData> {
    if (elementIds instanceof KeySet) {
      using propertyDataProvider = this.createPropertyDataProvider(imodel, this._customRuleset);
      propertyDataProvider.keys = elementIds;
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      propertyDataProvider.includeFieldsWithNoValues = this.includeFieldsWithNoValues;
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      propertyDataProvider.includeFieldsWithCompositeValues = this.includeFieldsWithCompositeValues;
      const propertyData = await propertyDataProvider.getData();

      // leave only favorite properties
      const favoritesCategory = getFavoritesCategory();
      propertyData.categories = propertyData.categories.filter((c) => c.name === favoritesCategory.name);
      propertyData.records = propertyData.records.hasOwnProperty(favoritesCategory.name)
        ? { [favoritesCategory.name]: propertyData.records[favoritesCategory.name] }
        : {};
      return propertyData;
    }

    const keys = await Presentation.selection.scopes.computeSelection(imodel, elementIds, createSelectionScopeProps(Presentation.selection.scopes.activeScope));
    return this.getData(imodel, keys);
  }

  /* c8 ignore start */
  private createPropertyDataProvider(imodel: IModelConnection, ruleset?: Ruleset | string) {
    const provider = new PresentationPropertyDataProvider({ imodel, ruleset });
    provider.isNestedPropertyCategoryGroupingEnabled = false;
    return provider;
  }
  /* c8 ignore end */
}

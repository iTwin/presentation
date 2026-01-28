/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module FavoriteProperties
 */

import { KeySet } from "@itwin/presentation-common";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { Presentation } from "@itwin/presentation-frontend";
import { computeSelection } from "@itwin/unified-selection";
import { mapPresentationFrontendSelectionScopeToUnifiedSelectionScope } from "../common/Utils.js";
import { PresentationPropertyDataProvider } from "../propertygrid/DataProvider.js";
import { getFavoritesCategory } from "./Utils.js";

import type { PropertyData } from "@itwin/components-react";
import type { Id64Arg } from "@itwin/core-bentley";
import type { IModelConnection } from "@itwin/core-frontend";
import type { Ruleset } from "@itwin/presentation-common";

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

  /**
   * Active selection scope provider.
   * Takes active scope from `Presentation.selection.scopes.activeScope` if not provided.
   */
  activeScopeProvider?: () => Parameters<typeof computeSelection>[0]["scope"];
}

/**
 * Presentation Rules-driven element favorite properties data provider implementation.
 * @public
 */
export class FavoritePropertiesDataProvider implements IFavoritePropertiesDataProvider {
  private _customRuleset?: Ruleset | string;
  private _getActiveScope: () => Parameters<typeof computeSelection>[0]["scope"];

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
    /* c8 ignore start */
    this._getActiveScope =
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      props?.activeScopeProvider ?? (() => mapPresentationFrontendSelectionScopeToUnifiedSelectionScope(Presentation.selection.scopes.activeScope));
    /* c8 ignore end */
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

    const iter = computeSelection({
      queryExecutor: createECSqlQueryExecutor(imodel),
      scope: this._getActiveScope(),
      elementIds,
    });
    const keys = new KeySet();
    for await (const key of iter) {
      keys.add(key);
    }
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

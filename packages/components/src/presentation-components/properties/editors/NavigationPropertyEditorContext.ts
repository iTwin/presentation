/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module Properties
 */

import { createContext, useMemo } from "react";
import { PropertyDescription } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { NavigationPropertyInfo } from "@itwin/presentation-common";
import { IContentDataProvider } from "../../common/ContentDataProvider";

/**
 * Data structure that describes [[navigationPropertyEditorContext]] value.
 * @beta
 */
export interface NavigationPropertyEditorContextProps {
  /** iModel connection to pull data from. */
  imodel: IModelConnection;
  /** Getter to get [NavigationPropertyInfo]($presentation-common) for specific property. */
  getNavigationPropertyInfo: (property: PropertyDescription) => Promise<NavigationPropertyInfo | undefined>;
}

/**
 * Context used to store data for [[NavigationPropertyEditor]].
 * @beta
 */
export const navigationPropertyEditorContext = createContext<NavigationPropertyEditorContextProps | undefined>(undefined);

/**
 * Custom hook that creates value for [[navigationPropertyEditorContext]].
 * @beta
 */
export function useNavigationPropertyEditingContext(imodel: IModelConnection, dataProvider: IContentDataProvider): NavigationPropertyEditorContextProps {
  return useMemo<NavigationPropertyEditorContextProps>(
    () => ({
      imodel,
      getNavigationPropertyInfo: async (property) => {
        const field = await dataProvider.getFieldByPropertyDescription(property);
        if (!field || !field.isPropertiesField()) {
          return undefined;
        }
        return field.properties[0].property.navigationPropertyInfo;
      },
    }),
    [imodel, dataProvider],
  );
}

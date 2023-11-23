/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { CategoryDescription } from "@itwin/presentation-common";
import { translate } from "../common/Utils";

/** @internal */
export const FAVORITES_CATEGORY_NAME = "Favorite";

/** @internal */
export const getFavoritesCategory = (): CategoryDescription => {
  return {
    name: FAVORITES_CATEGORY_NAME,
    label: translate("categories.favorite.label"),
    description: translate("categories.favorite.description"),
    priority: Number.MAX_VALUE,
    expand: true,
  };
};

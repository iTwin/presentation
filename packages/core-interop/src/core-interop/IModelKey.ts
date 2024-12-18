/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Defines input for `createIModelKey`. Generally, this is an instance of either [IModelDb](https://www.itwinjs.org/reference/core-backend/imodels/imodeldb/)
 * or [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/).
 * @public
 */
interface CoreIModel {
  key: string;
  name: string;
}

/**
 * Attempts to create a unique identifier for the given iModel. In majority of cases that's going to be the `key` property, but if it's not
 * set (e.g. when using [BlankConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/blankconnection/)) - `name` property
 * is used instead. Finally, if both are empty - the function will throw an error.
 *
 * Example:
 *
 * ```ts
 * import { IModelConnection } from "@itwin/core-frontend";
 * import { createIModelKey } from "@itwin/presentation-core-interop";
 *
 * IModelConnection.onOpen.addListener((imodel: IModelConnection) => {
 *   const key = createIModelKey(imodel);
 *   console.log(`IModel opened: "${key}"`);
 * });
 * ```
 *
 * @public
 */
export function createIModelKey(imodel: CoreIModel): string {
  if (imodel.key.length) {
    return imodel.key;
  }
  if (imodel.name.length) {
    return imodel.name;
  }
  throw new Error(`Provided iModel doesn't have a key or name.`);
}

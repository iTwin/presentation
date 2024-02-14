/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECClass, IMetadataProvider } from "./ECMetadata";
import { getClass } from "./internal/Common";

/**
 * This is an utility `Omit` type which works with union types.
 * @beta
 */
export type OmitOverUnion<T, K extends PropertyKey> = T extends T ? Omit<T, K> : never;

/** @beta */
export class BaseClassChecker {
  private _map = new Map<string, boolean>();

  public async isECClassOfBaseECClass(metadata: IMetadataProvider, ecClassNameToCheck: string, baseECClass: ECClass): Promise<boolean> {
    let isCurrentNodeClassOfBase = this._map.get(ecClassNameToCheck);
    if (isCurrentNodeClassOfBase === undefined) {
      const currentNodeECClass = await getClass(metadata, ecClassNameToCheck);
      if (await currentNodeECClass.is(baseECClass)) {
        this._map.set(ecClassNameToCheck, true);
        isCurrentNodeClassOfBase = true;
      } else {
        this._map.set(ecClassNameToCheck, false);
        isCurrentNodeClassOfBase = false;
      }
    }
    return isCurrentNodeClassOfBase;
  }
}

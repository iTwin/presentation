/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { compareStrings, Dictionary } from "@itwin/core-bentley";
import { ECClass, IMetadataProvider } from "./ECMetadata";
import { getClass } from "./internal/Common";

/**
 * This is an utility `Omit` type which works with union types.
 * @beta
 */
export type OmitOverUnion<T, K extends PropertyKey> = T extends T ? Omit<T, K> : never;

interface BaseClassCheckerDictionaryKey {
  ecClassNameToCheck: string;
  baseECClass: ECClass;
}

/** @beta */
export class BaseClassChecker {
  private _map = new Dictionary<BaseClassCheckerDictionaryKey, boolean>((lhs, rhs) => this.compareKeys(lhs, rhs));

  private compareKeys(lhs: BaseClassCheckerDictionaryKey, rhs: BaseClassCheckerDictionaryKey) {
    const classNameCompareResult = compareStrings(lhs.ecClassNameToCheck, rhs.ecClassNameToCheck);
    if (classNameCompareResult !== 0) {
      return classNameCompareResult;
    }
    return compareStrings(lhs.baseECClass.fullName, rhs.baseECClass.fullName);
  }

  public async isECClassOfBaseECClass(metadata: IMetadataProvider, ecClassNameToCheck: string, baseECClass: ECClass): Promise<boolean> {
    let isCurrentNodeClassOfBase = this._map.get({ ecClassNameToCheck, baseECClass });
    if (isCurrentNodeClassOfBase === undefined) {
      const currentNodeECClass = await getClass(metadata, ecClassNameToCheck);
      if (await currentNodeECClass.is(baseECClass)) {
        this._map.set({ ecClassNameToCheck, baseECClass }, true);
        isCurrentNodeClassOfBase = true;
      } else {
        this._map.set({ ecClassNameToCheck, baseECClass }, false);
        isCurrentNodeClassOfBase = false;
      }
    }
    return isCurrentNodeClassOfBase;
  }
}

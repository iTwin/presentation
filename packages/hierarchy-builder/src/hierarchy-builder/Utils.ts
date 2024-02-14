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
  baseECClassName: string;
}

/** @beta */
export class BaseClassChecker {
  private _map = new Dictionary<BaseClassCheckerDictionaryKey, boolean>((lhs, rhs) => this.compareKeys(lhs, rhs));
  private _metadataProvider: IMetadataProvider;
  public constructor(metadataProvider: IMetadataProvider) {
    this._metadataProvider = metadataProvider;
  }

  private compareKeys(lhs: BaseClassCheckerDictionaryKey, rhs: BaseClassCheckerDictionaryKey) {
    const classNameCompareResult = compareStrings(lhs.ecClassNameToCheck, rhs.ecClassNameToCheck);
    if (classNameCompareResult !== 0) {
      return classNameCompareResult;
    }
    return compareStrings(lhs.baseECClassName, rhs.baseECClassName);
  }

  public async isECClassOfBaseECClass(ecClassNameToCheck: string, baseECClass: ECClass): Promise<boolean> {
    let isCurrentNodeClassOfBase = this._map.get({ ecClassNameToCheck, baseECClassName: baseECClass.fullName });
    if (isCurrentNodeClassOfBase === undefined) {
      const currentNodeECClass = await getClass(this._metadataProvider, ecClassNameToCheck);
      if (await currentNodeECClass.is(baseECClass)) {
        this._map.set({ ecClassNameToCheck, baseECClassName: baseECClass.fullName }, true);
        isCurrentNodeClassOfBase = true;
      } else {
        this._map.set({ ecClassNameToCheck, baseECClassName: baseECClass.fullName }, false);
        isCurrentNodeClassOfBase = false;
      }
    }
    return isCurrentNodeClassOfBase;
  }
}

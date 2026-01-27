/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DisplayLabels
 */

import { bufferCount, from, map, mergeAll, mergeMap, reduce } from "rxjs";
import { DEFAULT_KEYS_BATCH_SIZE } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { memoize } from "../common/Utils.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { InstanceKey } from "@itwin/presentation-common";

/**
 * Interface for presentation rules-driven labels provider.
 * @public
 */
export interface IPresentationLabelsProvider {
  /** [IModelConnection]($core-frontend) used by this data provider */
  readonly imodel: IModelConnection;
  /**
   * Get label for instance identified with the given key.
   */
  getLabel(key: InstanceKey): Promise<string>;
  /**
   * Get labels for instances identified with the given keys.
   */
  getLabels(keys: InstanceKey[]): Promise<string[]>;
}

/**
 * Properties for creating a `LabelsProvider` instance.
 * @public
 */
export interface PresentationLabelsProviderProps {
  /** IModel to pull data from. */
  imodel: IModelConnection;
}

/**
 * Presentation Rules-driven labels provider implementation.
 * @public
 */
export class PresentationLabelsProvider implements IPresentationLabelsProvider {
  public readonly imodel: IModelConnection;

  /** Constructor. */
  constructor(props: PresentationLabelsProviderProps) {
    this.imodel = props.imodel;
  }

  private async getLabelInternal(key: InstanceKey) {
    return (await Presentation.presentation.getDisplayLabelDefinition({ imodel: this.imodel, key })).displayValue; // WIP
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  private getMemoizedLabel = memoize(this.getLabelInternal, { isMatchingKey: areLabelRequestsEqual as any });

  /**
   * Returns label for the specified instance key. Memoizes *the last* response.
   * @param key Key of instance to get label for
   */
  public async getLabel(key: InstanceKey): Promise<string> {
    return this.getMemoizedLabel(key);
  }

  private async getLabelsInternal(keys: InstanceKey[]) {
    return new Promise<string[]>((resolve, reject) => {
      from(keys)
        .pipe(
          bufferCount(DEFAULT_KEYS_BATCH_SIZE),
          mergeMap((keysBatch, batchIndex) => {
            if (Presentation.presentation.getDisplayLabelDefinitionsIterator) {
              return from(Presentation.presentation.getDisplayLabelDefinitionsIterator({ imodel: this.imodel, keys: keysBatch })).pipe(
                mergeMap((result) => result.items),
                map((item, itemIndex) => ({ value: item.displayValue, index: batchIndex * DEFAULT_KEYS_BATCH_SIZE + itemIndex })),
              );
            }
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            return from(Presentation.presentation.getDisplayLabelDefinitions({ imodel: this.imodel, keys: keysBatch })).pipe(
              mergeAll(),
              map((item, valueIndex) => ({ value: item.displayValue, index: batchIndex * DEFAULT_KEYS_BATCH_SIZE + valueIndex })),
            );
          }),
          reduce((result, { value, index }) => {
            result[index] = value;
            return result;
          }, new Array<string>(keys.length)),
        )
        .subscribe({
          next: resolve,
          error: reject,
        });
    });
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  private getMemoizedLabels = memoize(this.getLabelsInternal, { isMatchingKey: areLabelsRequestsEqual as any });

  /**
   * Returns labels for the specified instance keys. Memoizes *the last* response.
   * @param keys Keys of instances to get labels for
   */
  public async getLabels(keys: InstanceKey[]): Promise<string[]> {
    return this.getMemoizedLabels(keys);
  }
}

function areInstanceKeysEqual(lhs: InstanceKey, rhs: InstanceKey) {
  return lhs.className === rhs.className && lhs.id === rhs.id;
}

function areLabelRequestsEqual(lhsArgs: [InstanceKey], rhsArgs: [InstanceKey]): boolean {
  return areInstanceKeysEqual(lhsArgs[0], rhsArgs[0]);
}

function areLabelsRequestsEqual(lhsArgs: [InstanceKey[]], rhsArgs: [InstanceKey[]]): boolean {
  return lhsArgs[0].length === rhsArgs[0].length && lhsArgs[0].every((key, index) => areInstanceKeysEqual(key, rhsArgs[0][index]));
}

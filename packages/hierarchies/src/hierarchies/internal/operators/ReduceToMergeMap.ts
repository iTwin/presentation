/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ObservableInput } from "rxjs";
import { from, reduce } from "rxjs";

/**
 * Reduces the source observable into a `Map<string, TMapItem[]>`, where all input items are grouped based on their key
 * and placed into arrays.
 *
 * @param key A function to calculate map key for the item.
 * @param value A function to calculate entry value for the item.
 *
 * @internal
 */
export function reduceToMergeMapList<TSourceItem, TMapItem>(key: (item: TSourceItem) => string, value: (item: TSourceItem) => TMapItem) {
  return reduceToMergeMapItem<TSourceItem, TMapItem[]>(key, (item, list) => {
    if (!list) {
      list = [];
    }
    list.push(value(item));
    return list;
  });
}

/**
 * Reduces the source observable into a `Map<string, TMapItem>`, where all input items are grouped based on their key
 * and merged into a single value using provided merge function.
 *
 * @param key A function to calculate map key for the item.
 * @param value A function to create map value using the _current_ item and an item already _existing_ in the map with the same key.
 *
 * @internal
 */
export function reduceToMergeMapItem<TSourceItem, TMapItem>(
  key: (item: TSourceItem) => string,
  mergeFunc: (sourceItem: TSourceItem, mapItem: TMapItem | undefined) => TMapItem,
) {
  return (source: ObservableInput<TSourceItem>) =>
    from(source).pipe(
      reduce<TSourceItem, Map<string, TMapItem>>((mergedMap, item) => {
        if (mergedMap === EMPTY_MAP) {
          // this helps us avoid creating an empty map for cases when source observable
          // doesn't emit any values
          mergedMap = new Map();
        }
        const mergeKey = key(item);
        mergedMap.set(mergeKey, mergeFunc(item, mergedMap.get(mergeKey)));
        return mergedMap;
      }, EMPTY_MAP),
    );
}
const EMPTY_MAP = new Map();

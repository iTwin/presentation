/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache, LRUDictionary, LRUMap } from "@itwin/core-bentley";
import { InstanceKey } from "@itwin/presentation-shared";
import { HierarchyNodeKey } from "../HierarchyNodeKey";
import { GetHierarchyNodesProps } from "../HierarchyProvider";

interface HierarchyCacheEntry<T> {
  /** Stores observables for the default case - no instance filter or custom limit for the hierarchy level. */
  primary: T | undefined;
  /** Stores a limited number of variations with custom instance filter and/or custom limit for the hierarchy level. */
  variations: LRUCache<string, T>;
}

interface ChildNodeObservablesCacheProps {
  size: number;
  variationsCount?: number;
}

/** @internal */
export class HierarchyCache<T> {
  private _map: LRUDictionary<HierarchyNodeKey[], HierarchyCacheEntry<T>>;
  private _props: ChildNodeObservablesCacheProps;

  public constructor(props: ChildNodeObservablesCacheProps) {
    this._props = props;
    this._map = new LRUDictionary<HierarchyNodeKey[], HierarchyCacheEntry<T>>(props.size, compareHierarchyNodeKeys);
  }

  private createCacheKeys(
    props: Omit<GetHierarchyNodesProps, "parentNode"> & {
      parentNode: { key: HierarchyNodeKey; parentKeys: HierarchyNodeKey[] } | undefined;
      filteredInstanceKeys?: InstanceKey[];
    },
  ) {
    function createVariationKey() {
      const { instanceFilter, hierarchyLevelSizeLimit, filteredInstanceKeys } = props;
      if (instanceFilter === undefined && hierarchyLevelSizeLimit === undefined && filteredInstanceKeys === undefined) {
        return undefined;
      }
      return JSON.stringify({ instanceFilter, hierarchyLevelSizeLimit, filteredInstanceKeys });
    }

    if (!props.parentNode) {
      return { primaryKey: [], variationKey: createVariationKey() };
    }

    const parentKeys = props.parentNode.parentKeys;

    return {
      primaryKey: [...parentKeys, props.parentNode.key],
      variationKey: createVariationKey(),
    };
  }

  private getCacheAccessors(primaryKey: HierarchyNodeKey[], variationKey?: string) {
    const getMapEntry = (create: boolean) => {
      let entry = this._map.get(primaryKey);
      if (!entry && create) {
        entry = { primary: undefined, variations: new LRUMap(this._props.variationsCount ?? 1) };
        this._map.set(primaryKey, entry);
      }
      return entry;
    };
    if (variationKey) {
      return {
        get: () => getMapEntry(false)?.variations.get(variationKey),
        set: (value: T) => {
          getMapEntry(true)!.variations.set(variationKey, value);
        },
      };
    }
    return {
      get: () => getMapEntry(false)?.primary,
      set: (value: T) => {
        getMapEntry(true)!.primary = value;
      },
    };
  }

  public set(requestProps: GetHierarchyNodesProps, value: T) {
    const { primaryKey, variationKey } = this.createCacheKeys(requestProps);
    this.getCacheAccessors(primaryKey, variationKey).set(value);
  }

  public get(requestProps: GetHierarchyNodesProps): T | undefined {
    const { primaryKey, variationKey } = this.createCacheKeys(requestProps);
    return this.getCacheAccessors(primaryKey, variationKey).get();
  }

  public clear() {
    this._map.clear();
  }
}

function compareHierarchyNodeKeys(lhs: HierarchyNodeKey[], rhs: HierarchyNodeKey[]) {
  if (lhs.length !== rhs.length) {
    return lhs.length - rhs.length;
  }
  for (let i = 0; i < lhs.length; ++i) {
    const keysCompareResult = HierarchyNodeKey.compare(lhs[i], rhs[i]);
    if (keysCompareResult !== 0) {
      return keysCompareResult;
    }
  }
  return 0;
}

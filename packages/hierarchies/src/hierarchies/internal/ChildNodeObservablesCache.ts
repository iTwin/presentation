/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import { LRUCache, LRUDictionary, LRUMap } from "@itwin/core-bentley";
import { HierarchyNodeKey, ParsedHierarchyNode, ProcessedHierarchyNode } from "../HierarchyNode";
import { GetHierarchyNodesProps } from "../HierarchyProvider";

/** @internal */
export type ParsedQueryNodesObservable = Observable<ParsedHierarchyNode>;

/** @internal */
export type ProcessedNodesObservable = Observable<ProcessedHierarchyNode>;

/** @internal */
export type CachedNodesObservableEntry =
  | { observable: ParsedQueryNodesObservable; processingStatus: "none" }
  | { observable: ProcessedNodesObservable; processingStatus: "pre-processed" };

/** @internal */
export interface ChildNodesCacheEntry {
  /** Stores observables for the default case - no instance filter or custom limit for the hierarchy level. */
  primary: CachedNodesObservableEntry | undefined;
  /** Stores a limited number of variations with custom instance filter and/or custom limit for the hierarchy level. */
  variations: LRUCache<string, CachedNodesObservableEntry>;
}

/** @internal */
export interface ChildNodeObservablesCacheProps {
  size: number;
  variationsCount?: number;
}

/** @internal */
export class ChildNodeObservablesCache {
  private _map: LRUDictionary<HierarchyNodeKey[], ChildNodesCacheEntry>;
  private _props: ChildNodeObservablesCacheProps;

  public constructor(props: ChildNodeObservablesCacheProps) {
    this._props = props;
    this._map = new LRUDictionary<HierarchyNodeKey[], ChildNodesCacheEntry>(props.size, compareHierarchyNodeKeys);
  }

  private createCacheKeys(
    props: Omit<GetHierarchyNodesProps, "parentNode"> & { parentNode: { key: HierarchyNodeKey; parentKeys: HierarchyNodeKey[] } | undefined },
  ) {
    function createVariationKey() {
      const { instanceFilter, hierarchyLevelSizeLimit } = props;
      if (instanceFilter === undefined && hierarchyLevelSizeLimit === undefined) {
        return undefined;
      }
      return JSON.stringify({ instanceFilter, hierarchyLevelSizeLimit });
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
        set: (value: CachedNodesObservableEntry) => {
          getMapEntry(true)!.variations.set(variationKey, value);
        },
      };
    }
    return {
      get: () => getMapEntry(false)?.primary,
      set: (value: CachedNodesObservableEntry) => {
        getMapEntry(true)!.primary = value;
      },
    };
  }

  public set(requestProps: GetHierarchyNodesProps, value: CachedNodesObservableEntry) {
    const { primaryKey, variationKey } = this.createCacheKeys(requestProps);
    this.getCacheAccessors(primaryKey, variationKey).set(value);
  }

  public get(requestProps: GetHierarchyNodesProps): CachedNodesObservableEntry | undefined {
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

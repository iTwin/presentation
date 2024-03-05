/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import { assert, Dictionary, LRUCache, LRUDictionary, LRUMap } from "@itwin/core-bentley";
import {
  HierarchyNode,
  HierarchyNodeKey,
  InstancesNodeKey,
  ParentNodeKey,
  ParsedHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
} from "../HierarchyNode";
import { GetHierarchyNodesProps } from "../HierarchyProvider";

/** @internal */
export type ParsedQueryNodesObservable = Observable<ParsedHierarchyNode>;

/** @internal */
export type ProcessedNodesObservable = Observable<ProcessedHierarchyNode>;

/** @internal */
export type CachedNodesObservableEntry =
  | { observable: ParsedQueryNodesObservable; needsProcessing: true }
  | { observable: ProcessedNodesObservable; needsProcessing: false };

/** @internal */
export interface HierarchyLevelWithGroupingsObservables {
  parsedNodes: ParsedQueryNodesObservable;
  groupings: Dictionary<ParentNodeKey[], ProcessedNodesObservable>;
}

/** @internal */
export interface ChildNodesCacheEntry {
  /** Stores observables for the default case - no instance filter or custom limit for the hierarchy level. */
  primary: HierarchyLevelWithGroupingsObservables | undefined;
  /** Stores a limited number of variations with custom instance filter and/or custom limit for the hierarchy level. */
  variations: LRUCache<string, HierarchyLevelWithGroupingsObservables>;
}

/** @internal */
export interface ChildNodeObservablesCacheProps {
  size: number;
  variationsCount?: number;
}

/** @internal */
export class ChildNodeObservablesCache {
  private _map: LRUDictionary<ParentNodeKey[], ChildNodesCacheEntry>;
  private _props: ChildNodeObservablesCacheProps;

  public constructor(props: ChildNodeObservablesCacheProps) {
    this._props = props;
    this._map = new LRUDictionary<ParentNodeKey[], ChildNodesCacheEntry>(props.size, compareHierarchyNodeKeys);
  }

  private createCacheKeys(
    props: Omit<GetHierarchyNodesProps, "parentNode"> & { parentNode: { key: HierarchyNodeKey; parentKeys: ParentNodeKey[] } | undefined },
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

    if (HierarchyNode.isGroupingNode(props.parentNode)) {
      if (parentKeys.length === 0) {
        return { primaryKey: [], variationKey: createVariationKey(), groupingKey: [props.parentNode.key] };
      }
      let parentKeysSplitPosition = parentKeys.length;
      while (parentKeysSplitPosition > 0) {
        const parentKey = parentKeys[parentKeysSplitPosition - 1];
        if (typeof parentKey === "string" || parentKey.type === "instances") {
          break;
        }
        --parentKeysSplitPosition;
      }
      const split =
        parentKeysSplitPosition === 0
          ? { primaryKey: [], groupingKey: parentKeys }
          : parentKeysSplitPosition === parentKeys.length
            ? { primaryKey: parentKeys, groupingKey: [] }
            : { primaryKey: parentKeys.slice(0, parentKeysSplitPosition), groupingKey: parentKeys.slice(parentKeysSplitPosition) };
      return {
        primaryKey: split.primaryKey,
        variationKey: createVariationKey(),
        groupingKey: [...split.groupingKey, props.parentNode.key],
      };
    }

    return {
      primaryKey: [...parentKeys, props.parentNode.key],
      variationKey: createVariationKey(),
    };
  }

  private getCacheAccessors(primaryKey: ParentNodeKey[], variationKey?: string) {
    const getMapEntry = (create: boolean) => {
      let entry = this._map.get(primaryKey);
      if (!entry && create) {
        entry = { primary: undefined, variations: new LRUMap(this._props.variationsCount ?? 1) };
        this._map.set(primaryKey, entry);
      }
      return entry;
    };
    const getObservableAccessor = () => {
      if (variationKey) {
        return {
          get: () => getMapEntry(false)?.variations.get(variationKey),
          set: (parsedNodes: ParsedQueryNodesObservable) => {
            getMapEntry(true)!.variations.set(variationKey, { parsedNodes, groupings: new Dictionary(compareHierarchyNodeKeys) });
          },
        };
      }
      return {
        get: () => getMapEntry(false)?.primary,
        set: (parsedNodes: ParsedQueryNodesObservable) => {
          getMapEntry(true)!.primary = { parsedNodes, groupings: new Dictionary(compareHierarchyNodeKeys) };
        },
      };
    };
    return {
      getEntry: (groupingKey?: ParentNodeKey[]): CachedNodesObservableEntry | undefined => {
        const source = getObservableAccessor().get();
        if (!source) {
          return undefined;
        }
        if (groupingKey) {
          const groupedNodesObservable = source.groupings.get(groupingKey);
          return groupedNodesObservable ? { observable: groupedNodesObservable, needsProcessing: false } : undefined;
        }
        return { observable: source.parsedNodes, needsProcessing: true };
      },
      setParseResult: (parsedNodes: ParsedQueryNodesObservable) => {
        getObservableAccessor().set(parsedNodes);
      },
      setGrouped: (groupingKey: ParentNodeKey[], processedNodes: ProcessedNodesObservable) => {
        const source = getObservableAccessor().get();
        if (!source) {
          return false;
        }
        source.groupings.set(groupingKey, processedNodes);
        return true;
      },
    };
  }

  public addParseResult(
    requestProps: Omit<GetHierarchyNodesProps, "parentNode"> & { parentNode: { key: string | InstancesNodeKey; parentKeys: ParentNodeKey[] } | undefined },
    observable: ParsedQueryNodesObservable,
  ) {
    const { primaryKey, variationKey } = this.createCacheKeys(requestProps);
    const { setParseResult } = this.getCacheAccessors(primaryKey, variationKey);
    setParseResult(observable);
  }

  public addGrouped(
    requestProps: Omit<GetHierarchyNodesProps, "parentNode"> & { parentNode: ProcessedGroupingHierarchyNode },
    observable: ProcessedNodesObservable,
  ) {
    const { primaryKey, variationKey, groupingKey } = this.createCacheKeys(requestProps);
    assert(groupingKey !== undefined && groupingKey.length > 0);
    const { setGrouped } = this.getCacheAccessors(primaryKey, variationKey);
    return setGrouped(groupingKey, observable);
  }

  public get(requestProps: GetHierarchyNodesProps): CachedNodesObservableEntry | undefined {
    const { primaryKey, variationKey, groupingKey } = this.createCacheKeys(requestProps);
    const { getEntry } = this.getCacheAccessors(primaryKey, variationKey);
    return getEntry(groupingKey);
  }

  public clear() {
    this._map.clear();
  }
}

function compareHierarchyNodeKeys(lhs: ParentNodeKey[], rhs: ParentNodeKey[]) {
  if (lhs.length !== rhs.length) {
    return lhs.length - rhs.length;
  }
  for (let i = 0; i < lhs.length; ++i) {
    const keysCompareResult = ParentNodeKey.compare(lhs[i], rhs[i]);
    if (keysCompareResult !== 0) {
      return keysCompareResult;
    }
  }
  return 0;
}

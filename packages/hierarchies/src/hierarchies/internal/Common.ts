/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import naturalCompare from "natural-compare-lite";
import { assert, LRUMap } from "@itwin/core-bentley";
import { ECClass, IMetadataProvider } from "../ECMetadata";
import {
  HierarchyNode,
  HierarchyNodeKey,
  HierarchyNodeLabelGroupingParams,
  InstanceHierarchyNodeProcessingParams,
  InstancesNodeKey,
  ParentHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../HierarchyNode";
import { getClass } from "./GetClass";

/** @internal */
export const LOGGING_NAMESPACE = "Presentation.HierarchyBuilder";

function mergeNodeHandlingParams(
  lhs: InstanceHierarchyNodeProcessingParams | undefined,
  rhs: InstanceHierarchyNodeProcessingParams | undefined,
): InstanceHierarchyNodeProcessingParams | undefined {
  if (!lhs && !rhs) {
    return undefined;
  }
  const params = {
    ...(lhs?.hideIfNoChildren || rhs?.hideIfNoChildren ? { hideIfNoChildren: true } : undefined),
    ...(lhs?.hideInHierarchy || rhs?.hideInHierarchy ? { hideInHierarchy: true } : undefined),
    ...mergeByLabelParams(lhs?.grouping?.byLabel, rhs?.grouping?.byLabel),
  };
  return Object.keys(params).length > 0 ? params : undefined;
}

function mergeByLabelParams(
  lhs: HierarchyNodeLabelGroupingParams | undefined,
  rhs: HierarchyNodeLabelGroupingParams | undefined,
): InstanceHierarchyNodeProcessingParams | undefined {
  if (lhs && typeof lhs === "object" && lhs.action === "merge" && rhs && typeof rhs === "object" && rhs.action === "merge" && lhs.groupId === rhs.groupId) {
    return {
      grouping: { byLabel: lhs },
    };
  }
  return undefined;
}

function mergeNodeKeys<TKey extends string | InstancesNodeKey>(lhs: TKey, rhs: TKey): TKey {
  if (HierarchyNodeKey.isCustom(lhs)) {
    assert(HierarchyNodeKey.isCustom(rhs));
    return lhs === rhs ? lhs : (`${lhs}+${rhs}` as TKey);
  }
  // istanbul ignore else
  if (HierarchyNodeKey.isInstances(lhs)) {
    assert(HierarchyNodeKey.isInstances(rhs));
    return { type: "instances", instanceKeys: [...lhs.instanceKeys, ...rhs.instanceKeys] } as TKey;
  }
  // https://github.com/microsoft/TypeScript/issues/21985
  // istanbul ignore next
  return ((x: never) => x)(lhs);
}

function mergeParentNodeKeys(lhsKeys: HierarchyNodeKey[], rhsKeys: HierarchyNodeKey[]): HierarchyNodeKey[] {
  const res = new Array<HierarchyNodeKey>();
  for (let i = 0; i < lhsKeys.length && i < rhsKeys.length; ++i) {
    if (!HierarchyNodeKey.equals(lhsKeys[i], rhsKeys[i])) {
      break;
    }
    res.push(lhsKeys[i]);
  }
  return res;
}

/** @internal */
export function mergeNodes<TNode extends ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode>(lhs: TNode, rhs: TNode): TNode {
  assert(typeof lhs.key === typeof rhs.key);
  const mergedProcessingParams = mergeNodeHandlingParams(lhs.processingParams, rhs.processingParams);
  const mergedChildren = lhs.children === true || rhs.children === true ? true : lhs.children === false && rhs.children === false ? false : undefined;
  const mergedNode = {
    ...lhs,
    ...rhs,
    label: lhs.label,
    key: mergeNodeKeys(lhs.key, rhs.key),
    parentKeys: mergeParentNodeKeys(lhs.parentKeys, rhs.parentKeys),
  } as TNode;
  // Remove specific properties or change their values based on lhs and rhs nodes
  mergedChildren !== undefined ? (mergedNode.children = mergedChildren) : delete mergedNode.children;
  mergedProcessingParams ? (mergedNode.processingParams = mergedProcessingParams) : delete mergedNode.processingParams;
  lhs.autoExpand || rhs.autoExpand ? (mergedNode.autoExpand = true) : delete mergedNode.autoExpand;
  lhs.extendedData || rhs.extendedData ? (mergedNode.extendedData = { ...lhs.extendedData, ...rhs.extendedData }) : delete mergedNode.extendedData;
  lhs.supportsFiltering && rhs.supportsFiltering ? (mergedNode.supportsFiltering = true) : delete mergedNode.supportsFiltering;
  return mergedNode;
}

/** @internal */
export function hasChildren<TNode extends { children?: boolean | Array<unknown> }>(node: TNode) {
  return node.children === true || (Array.isArray(node.children) && node.children.length > 0);
}

/** @internal */
export function createOperatorLoggingNamespace(operatorName: string) {
  return `${LOGGING_NAMESPACE}.Operators.${operatorName}`;
}

/** @internal */
export function julianToDateTime(julianDate: number): Date {
  const millis = (julianDate - 2440587.5) * 86400000;
  return new Date(millis);
}

/** @internal */
export function compareNodesByLabel<TLhsNode extends { label: string }, TRhsNode extends { label: string }>(lhs: TLhsNode, rhs: TRhsNode): number {
  return naturalCompare(lhs.label.toLocaleLowerCase(), rhs.label.toLocaleLowerCase());
}

/** @internal */
export class BaseClassChecker {
  private _map: LRUMap<string, Promise<boolean> | boolean>;
  private _metadataProvider: IMetadataProvider;

  public constructor(metadataProvider: IMetadataProvider, cacheSize: number = 0) {
    this._map = new LRUMap(cacheSize);
    this._metadataProvider = metadataProvider;
  }

  private createCacheKey(className: string, baseClassName: string) {
    return `${className}${baseClassName}`;
  }

  public isECClassOfBaseECClass(ecClassNameToCheck: string, baseECClass: ECClass): Promise<boolean> | boolean {
    const cacheKey = this.createCacheKey(ecClassNameToCheck, baseECClass.fullName);
    let isCurrentNodeClassOfBase = this._map.get(cacheKey);
    if (isCurrentNodeClassOfBase === undefined) {
      isCurrentNodeClassOfBase = getClass(this._metadataProvider, ecClassNameToCheck).then(async (currentNodeECClass) => {
        const result = await currentNodeECClass.is(baseECClass);
        this._map.set(cacheKey, result);
        return result;
      });
      this._map.set(cacheKey, isCurrentNodeClassOfBase);
    }
    return isCurrentNodeClassOfBase;
  }
}

/** @internal */
// istanbul ignore next
export function createNodeIdentifierForLogging(node: ParentHierarchyNode | HierarchyNode | undefined) {
  if (!node) {
    return "<root>";
  }
  const { label, key, parentKeys } = node;
  return JSON.stringify({ label, key, parentKeys });
}

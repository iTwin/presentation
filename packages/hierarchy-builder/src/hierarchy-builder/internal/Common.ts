/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import naturalCompare from "natural-compare-lite";
import { assert } from "@itwin/core-bentley";
import { ECClass, ECSchema, IMetadataProvider } from "../ECMetadata";
import {
  HierarchyNodeKey,
  HierarchyNodeLabelGroupingParams,
  InstanceHierarchyNodeProcessingParams,
  InstancesNodeKey,
  ProcessedCustomHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../HierarchyNode";
import { getLogger } from "../Logging";
import { parseFullClassName } from "../Metadata";

/** @internal */
export const LOGGING_NAMESPACE = "Presentation.HierarchyBuilder";

/** @internal */
export async function getClass(metadata: IMetadataProvider, fullClassName: string): Promise<ECClass> {
  const { schemaName, className } = parseFullClassName(fullClassName);
  let schema: ECSchema | undefined;
  try {
    schema = await metadata.getSchema(schemaName);
  } catch (e) {
    assert(e instanceof Error);
    getLogger().logError(`${LOGGING_NAMESPACE}`, `Failed to get schema "${schemaName} with error ${e.message}."`);
  }
  if (!schema) {
    throw new Error(`Invalid schema "${schemaName}"`);
  }

  let nodeClass: ECClass | undefined;
  try {
    nodeClass = await schema.getClass(className);
  } catch (e) {
    assert(e instanceof Error);
    getLogger().logError(`${LOGGING_NAMESPACE}`, `Failed to get schema "${schemaName} with error ${e.message}."`);
  }
  if (!nodeClass) {
    throw new Error(`Invalid class "${className}" in schema "${schemaName}"`);
  }

  return nodeClass;
}

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
export function mergeSortedArrays<TLhsItem, TRhsItem>(
  lhs: TLhsItem[],
  rhs: TRhsItem[],
  comparer: (lhs: TLhsItem, rhs: TRhsItem) => number,
): Array<TLhsItem | TRhsItem> {
  const sorted = new Array<TLhsItem | TRhsItem>();
  let indexLhs = 0;
  let indexRhs = 0;
  while (indexLhs < lhs.length && indexRhs < rhs.length) {
    if (comparer(lhs[indexLhs], rhs[indexRhs]) > 0) {
      sorted.push(rhs[indexRhs]);
      ++indexRhs;
      continue;
    }
    sorted.push(lhs[indexLhs]);
    ++indexLhs;
  }

  if (indexRhs < rhs.length) {
    return sorted.concat(rhs.slice(indexRhs));
  }
  return sorted.concat(lhs.slice(indexLhs));
}

/** @internal */
export function compareNodesByLabel<TLhsNode extends { label: string }, TRhsNode extends { label: string }>(lhs: TLhsNode, rhs: TRhsNode): number {
  return naturalCompare(lhs.label.toLocaleLowerCase(), rhs.label.toLocaleLowerCase());
}

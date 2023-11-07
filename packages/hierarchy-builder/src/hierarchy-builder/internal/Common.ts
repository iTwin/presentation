/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import { assert } from "@itwin/core-bentley";
import {
  BaseGroupingParams,
  GroupingParams,
  HierarchyNode,
  HierarchyNodeKey,
  InstanceHierarchyNodeProcessingParams,
  InstancesNodeKey,
  ParentHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../HierarchyNode";
import { getLogger } from "../Logging";
import { ECClass, ECSchema, IMetadataProvider, parseFullClassName } from "../Metadata";

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
    ...(lhs?.grouping || rhs?.grouping ? { grouping: mergeNodeGroupingParams(lhs?.grouping, rhs?.grouping) } : undefined),
    ...(lhs?.mergeByLabelId || rhs?.mergeByLabelId ? { mergeByLabelId: lhs?.mergeByLabelId ?? rhs?.mergeByLabelId } : undefined),
  };
  return Object.keys(params).length > 0 ? params : undefined;
}

function mergeNodeGroupingParams(lhsGrouping: GroupingParams | undefined, rhsGrouping: GroupingParams | undefined): GroupingParams {
  return {
    ...(lhsGrouping?.byClass || rhsGrouping?.byClass
      ? {
          byClass:
            typeof lhsGrouping?.byClass !== "boolean" && typeof rhsGrouping?.byClass !== "boolean"
              ? mergeBaseGroupingParams(lhsGrouping?.byClass, rhsGrouping?.byClass)
              : true,
        }
      : undefined),
    ...(lhsGrouping?.byLabel || rhsGrouping?.byLabel
      ? {
          byLabel:
            typeof lhsGrouping?.byLabel !== "boolean" && typeof rhsGrouping?.byLabel !== "boolean"
              ? mergeBaseGroupingParams(lhsGrouping?.byLabel, rhsGrouping?.byLabel)
              : true,
        }
      : undefined),
    ...(lhsGrouping?.byBaseClasses || rhsGrouping?.byBaseClasses
      ? {
          byBaseClasses: {
            // Create an array from both: lhs and rhs fullClassNames arrays without adding duplicates
            fullClassNames: [...new Set([...(lhsGrouping?.byBaseClasses?.fullClassNames ?? []), ...(rhsGrouping?.byBaseClasses?.fullClassNames ?? [])])],
            ...mergeBaseGroupingParams(lhsGrouping?.byBaseClasses, rhsGrouping?.byBaseClasses),
          },
        }
      : undefined),
  };
}

function mergeBaseGroupingParams(
  lhsBaseGroupingParams: BaseGroupingParams | undefined,
  rhsBaseGroupingParams: BaseGroupingParams | undefined,
): BaseGroupingParams {
  return {
    ...(lhsBaseGroupingParams?.hideIfOneGroupedNode || rhsBaseGroupingParams?.hideIfOneGroupedNode ? { hideIfOneGroupedNode: true } : undefined),
    ...(lhsBaseGroupingParams?.hideIfNoSiblings || rhsBaseGroupingParams?.hideIfNoSiblings ? { hideIfNoSiblings: true } : undefined),
  };
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
  return {
    label: lhs.label,
    key: mergeNodeKeys(lhs.key, rhs.key),
    parentKeys: mergeParentNodeKeys(lhs.parentKeys, rhs.parentKeys),
    ...(mergedChildren !== undefined ? { children: mergedChildren } : undefined),
    ...(mergedProcessingParams ? { processingParams: mergedProcessingParams } : undefined),
    ...(lhs.autoExpand || rhs.autoExpand ? { autoExpand: lhs.autoExpand || rhs.autoExpand } : undefined),
    ...(lhs.extendedData || rhs.extendedData ? { extendedData: { ...lhs.extendedData, ...rhs.extendedData } } : undefined),
  } as TNode;
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
// export function omit<T extends {}>(obj: T, attrs: Array<keyof T>) {
//   const copy = { ...obj };
//   attrs.forEach((attr) => delete copy[attr]);
//   return copy;
// }

/** @internal */
export interface ChildNodesObservables {
  processedNodes: Observable<ProcessedHierarchyNode>;
  finalizedNodes: Observable<HierarchyNode>;
  hasNodes: Observable<boolean>;
}

/** @internal */
export class ChildNodesCache {
  private _map = new Map<string, ChildNodesObservables>();

  private createKey(node: ParentHierarchyNode | undefined): string {
    return node ? `${JSON.stringify(node.parentKeys)}+${JSON.stringify(node.key)}` : "";
  }

  public add(parentNode: ParentHierarchyNode | undefined, value: ChildNodesObservables) {
    const key = this.createKey(parentNode);
    assert(!this._map.has(key));
    this._map.set(key, value);
  }

  public get(parentNode: ParentHierarchyNode | undefined): ChildNodesObservables | undefined {
    return this._map.get(this.createKey(parentNode));
  }
}

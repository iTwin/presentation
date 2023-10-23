/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import { assert } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyNodeKey, HierarchyNodeProcessingParams, ProcessedHierarchyNode } from "../HierarchyNode";
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
  lhs: HierarchyNodeProcessingParams | undefined,
  rhs: HierarchyNodeProcessingParams | undefined,
): HierarchyNodeProcessingParams | undefined {
  if (!lhs && !rhs) {
    return undefined;
  }
  const params = {
    ...(lhs?.hideIfNoChildren || rhs?.hideIfNoChildren ? { hideIfNoChildren: true } : undefined),
    ...(lhs?.hideInHierarchy || rhs?.hideInHierarchy ? { hideInHierarchy: true } : undefined),
    ...(lhs?.groupByClass || rhs?.groupByClass ? { groupByClass: true } : undefined),
    ...(lhs?.groupByLabel || rhs?.groupByLabel ? { groupByLabel: true } : undefined),
    ...(lhs?.mergeByLabelId || rhs?.mergeByLabelId ? { mergeByLabelId: lhs?.mergeByLabelId ?? rhs?.mergeByLabelId } : undefined),
  };
  return Object.keys(params).length > 0 ? params : undefined;
}

function mergeNodeKeys(lhs: HierarchyNodeKey, rhs: HierarchyNodeKey): HierarchyNodeKey {
  if (HierarchyNodeKey.isCustom(lhs)) {
    assert(HierarchyNodeKey.isCustom(rhs));
    return lhs === rhs ? lhs : `${lhs}+${rhs}`;
  }
  assert(HierarchyNodeKey.isStandard(lhs) && HierarchyNodeKey.isStandard(rhs) && lhs.type === rhs.type);
  if (HierarchyNodeKey.isInstances(lhs)) {
    assert(HierarchyNodeKey.isInstances(rhs));
    return { type: "instances", instanceKeys: [...lhs.instanceKeys, ...rhs.instanceKeys] };
  }
  if (HierarchyNodeKey.isClassGrouping(lhs)) {
    assert(HierarchyNodeKey.isClassGrouping(rhs));
    assert(lhs.class.name === rhs.class.name);
    return { ...lhs };
  }
  // istanbul ignore else
  if (HierarchyNodeKey.isLabelGrouping(lhs)) {
    assert(HierarchyNodeKey.isLabelGrouping(rhs));
    assert(lhs.label === rhs.label);
    return { ...lhs };
  }
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
export function mergeNodes(lhs: ProcessedHierarchyNode, rhs: ProcessedHierarchyNode): ProcessedHierarchyNode {
  const mergedProcessingParams = mergeNodeHandlingParams(lhs.processingParams, rhs.processingParams);
  const mergedChildren =
    Array.isArray(lhs.children) && Array.isArray(rhs.children)
      ? [...lhs.children, ...rhs.children]
      : lhs.children === true || rhs.children === true
      ? true
      : lhs.children === false && rhs.children === false
      ? false
      : undefined;
  return {
    label: lhs.label,
    key: mergeNodeKeys(lhs.key, rhs.key),
    parentKeys: mergeParentNodeKeys(lhs.parentKeys, rhs.parentKeys),
    ...(mergedChildren !== undefined ? { children: mergedChildren } : undefined),
    ...(mergedProcessingParams ? { processingParams: mergedProcessingParams } : undefined),
    ...(lhs.autoExpand || rhs.autoExpand ? { autoExpand: lhs.autoExpand || rhs.autoExpand } : undefined),
    ...(lhs.extendedData || rhs.extendedData ? { extendedData: { ...lhs.extendedData, ...rhs.extendedData } } : undefined),
  };
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
export interface ChildNodesObservables {
  processedNodes: Observable<ProcessedHierarchyNode>;
  finalizedNodes: Observable<HierarchyNode>;
  hasNodes: Observable<boolean>;
}

/** @internal */
export class ChildNodesCache {
  private _map = new Map<string, ChildNodesObservables>();

  private createKey(node: ProcessedHierarchyNode | undefined): string {
    return node ? `${JSON.stringify(node.parentKeys)}+${JSON.stringify(node.key)}` : "";
  }

  public add(parentNode: ProcessedHierarchyNode | undefined, value: ChildNodesObservables) {
    const key = this.createKey(parentNode);
    assert(!this._map.has(key));
    this._map.set(key, value);
  }

  public get(parentNode: ProcessedHierarchyNode | undefined): ChildNodesObservables | undefined {
    return this._map.get(this.createKey(parentNode));
  }
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { merge, Observable } from "rxjs";
import { assert } from "@itwin/core-bentley";
import { QueryBinder } from "@itwin/core-common";
import { ECClass, Schema, SchemaContext, SchemaKey } from "@itwin/ecschema-metadata";
import { ECSqlBinding } from "../ECSql";
import { HierarchyNode, HierarchyNodeHandlingParams, HierarchyNodeKey } from "../HierarchyNode";

/** @internal */
export async function getClass(schemas: SchemaContext, fullClassName: string) {
  const [schemaName, className] = fullClassName.split(/[\.:]/);
  let schema: Schema | undefined;
  try {
    schema = await schemas.getSchema(new SchemaKey(schemaName));
  } catch {}
  if (!schema) {
    throw new Error(`Invalid schema: ${schemaName}`);
  }

  let nodeClass: ECClass | undefined;
  try {
    nodeClass = await schema.getItem<ECClass>(className);
  } catch {}
  if (!nodeClass) {
    throw new Error(`Invalid class: ${nodeClass}`);
  }

  return nodeClass;
}

function mergeNodeHandlingParams(
  lhs: HierarchyNodeHandlingParams | undefined,
  rhs: HierarchyNodeHandlingParams | undefined,
): HierarchyNodeHandlingParams | undefined {
  if (!lhs && !rhs) {
    return undefined;
  }
  return {
    ...(lhs?.hideIfNoChildren && rhs?.hideIfNoChildren ? { hideIfNoChildren: true } : undefined),
    ...(lhs?.hideInHierarchy && rhs?.hideInHierarchy ? { hideInHierarchy: true } : undefined),
    ...(lhs?.groupByClass || rhs?.groupByClass ? { groupByClass: true } : undefined),
    ...(lhs?.mergeByLabelId ? { mergeByLabelId: lhs.mergeByLabelId } : undefined),
  };
}

function mergeNodeKeys(lhs: HierarchyNodeKey, rhs: HierarchyNodeKey): HierarchyNodeKey {
  if (HierarchyNodeKey.isCustom(lhs) && HierarchyNodeKey.isCustom(rhs)) {
    assert(lhs === rhs);
    return lhs;
  }
  assert(HierarchyNodeKey.isStandard(lhs) && HierarchyNodeKey.isStandard(rhs) && lhs.type === rhs.type);
  if (HierarchyNodeKey.isInstances(lhs)) {
    assert(HierarchyNodeKey.isInstances(rhs));
    return { type: "instances", instanceKeys: [...lhs.instanceKeys, ...rhs.instanceKeys] };
  }
  if (HierarchyNodeKey.isClassGrouping(lhs)) {
    assert(HierarchyNodeKey.isClassGrouping(rhs));
    assert(lhs.class.id === rhs.class.id);
    return { ...lhs };
  }
  throw new Error(`Unable to merge given node keys`);
}

/** @internal */
export function mergeNodes(lhs: HierarchyNode, rhs: HierarchyNode): HierarchyNode {
  const mergedParams = mergeNodeHandlingParams(lhs.params, rhs.params);
  return {
    label: lhs.label,
    key: mergeNodeKeys(lhs.key, rhs.key),
    children:
      Array.isArray(lhs.children) && Array.isArray(rhs.children)
        ? [...lhs.children, ...rhs.children]
        : lhs.children === true || rhs.children === true
        ? true
        : lhs.children === false && rhs.children === false
        ? false
        : undefined,
    ...(lhs.autoExpand || rhs.autoExpand ? { autoExpand: lhs.autoExpand || rhs.autoExpand } : undefined),
    ...(lhs.extendedData || rhs.extendedData ? { extendedData: { ...lhs.extendedData, ...rhs.extendedData } } : undefined),
    ...(mergedParams ? { params: mergedParams } : undefined),
  };
}

/** @internal */
export function hasChildren<TNode extends { children?: boolean | Array<unknown> }>(node: TNode) {
  return node.children === true || (Array.isArray(node.children) && node.children.length > 0);
}

/** @internal */
export function mergeNodesObs(lhs: HierarchyNode, rhs: HierarchyNode, directNodesCache: Map<string, Observable<HierarchyNode>>) {
  const merged = mergeNodes(lhs, rhs);
  mergeDirectNodeObservables(lhs, rhs, merged, directNodesCache);
  return merged;
}

/** @internal */
export function mergeDirectNodeObservables(a: HierarchyNode, b: HierarchyNode, m: HierarchyNode, cache: Map<string, Observable<HierarchyNode>>) {
  const cachedA = cache.get(JSON.stringify(a.key));
  if (!cachedA) {
    return;
  }
  const cachedB = cache.get(JSON.stringify(b.key));
  if (!cachedB) {
    return;
  }
  const merged = merge(cachedA, cachedB);
  cache.set(JSON.stringify(m.key), merged);
}

/** @internal */
export function bind(bindings: ECSqlBinding[]): QueryBinder {
  const binder = new QueryBinder();
  bindings.forEach((b, i) => {
    switch (b.type) {
      case "boolean":
        binder.bindBoolean(i + 1, b.value);
        break;
      case "double":
        binder.bindDouble(i + 1, b.value);
        break;
      case "id":
        binder.bindId(i + 1, b.value);
        break;
      case "idset":
        binder.bindIdSet(i + 1, b.value);
        break;
      case "int":
        binder.bindInt(i + 1, b.value);
        break;
      case "long":
        binder.bindLong(i + 1, b.value);
        break;
      case "point2d":
        binder.bindPoint2d(i + 1, b.value);
        break;
      case "point3d":
        binder.bindPoint3d(i + 1, b.value);
        break;
      case "string":
        binder.bindString(i + 1, b.value);
        break;
    }
  });
  return binder;
}

/** @internal */
export function createOperatorLoggingNamespace(operatorName: string) {
  return `Presentation.HierarchyBuilder.Operators.${operatorName}`;
}

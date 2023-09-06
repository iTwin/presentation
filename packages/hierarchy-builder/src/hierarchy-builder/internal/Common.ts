/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { merge, Observable } from "rxjs";
import { QueryBinder } from "@itwin/core-common";
import { ECClass, Schema, SchemaContext, SchemaKey } from "@itwin/ecschema-metadata";
import { ECSqlBinding } from "../ECSql";
import { HierarchyNode } from "../HierarchyNode";

/** @internal */
export interface HierarchyNodeHandlingParams {
  hideIfNoChildren?: boolean;
  hideInHierarchy?: boolean;
  groupByClass?: boolean;
  mergeByLabelId?: string;
}

/** @internal */
export type InProgressHierarchyNode = HierarchyNode & HierarchyNodeHandlingParams;

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

/** @internal */
export function mergeInstanceNodes(lhs: InProgressHierarchyNode, rhs: InProgressHierarchyNode): InProgressHierarchyNode {
  if (lhs.key.type !== "instances" || rhs.key.type !== "instances") {
    throw new Error("Only instance nodes allowed");
  }
  return {
    label: lhs.label,
    key: {
      type: "instances",
      instanceKeys: [...lhs.key.instanceKeys, ...rhs.key.instanceKeys],
    },
    mergeByLabelId: lhs.mergeByLabelId,
    children:
      Array.isArray(lhs.children) && Array.isArray(rhs.children)
        ? [...lhs.children, ...rhs.children]
        : lhs.children === true || rhs.children === true
        ? true
        : lhs.children === false && rhs.children === false
        ? false
        : undefined,
    ...(lhs.hideIfNoChildren && rhs.hideIfNoChildren ? { hideIfNoChildren: lhs.hideIfNoChildren && rhs.hideIfNoChildren } : undefined),
    ...(lhs.hideInHierarchy && rhs.hideInHierarchy ? { hideInHierarchy: lhs.hideInHierarchy && rhs.hideInHierarchy } : undefined),
    ...(lhs.groupByClass || rhs.groupByClass ? { groupByClass: lhs.groupByClass || rhs.groupByClass } : undefined),
    ...(lhs.autoExpand || rhs.autoExpand ? { autoExpand: lhs.autoExpand || rhs.autoExpand } : undefined),
    ...(lhs.extendedData || rhs.extendedData ? { extendedData: { ...lhs.extendedData, ...rhs.extendedData } } : undefined),
  };
}

/** @internal */
export function hasChildren<TNode extends { children?: boolean | Array<unknown> }>(node: TNode) {
  return node.children === true || (Array.isArray(node.children) && node.children.length > 0);
}

/** @internal */
export function mergeInstanceNodesObs(
  lhs: InProgressHierarchyNode,
  rhs: InProgressHierarchyNode,
  directNodesCache: Map<string, Observable<InProgressHierarchyNode>>,
) {
  const merged = mergeInstanceNodes(lhs, rhs);
  mergeDirectNodeObservables(lhs, rhs, merged, directNodesCache);
  return merged;
}

/** @internal */
export function mergeDirectNodeObservables(
  a: InProgressHierarchyNode,
  b: InProgressHierarchyNode,
  m: InProgressHierarchyNode,
  cache: Map<string, Observable<InProgressHierarchyNode>>,
) {
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

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECClass, Schema, SchemaContext, SchemaKey } from "@itwin/ecschema-metadata";
import { InProgressTreeNode } from "./TreeNode";

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
export function mergeInstanceNodes<TDirectChildren>(
  lhs: InProgressTreeNode,
  rhs: InProgressTreeNode,
  directChildrenMerger: (lhsChildren: TDirectChildren, rhsChildren: TDirectChildren) => TDirectChildren,
): InProgressTreeNode {
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
    ...(lhs.directChildren || rhs.directChildren ? { directChildren: directChildrenMerger(lhs.directChildren, rhs.directChildren) } : undefined),
  };
}

/** @internal */
export function hasChildren<TNode extends { children?: boolean | Array<unknown> }>(node: TNode) {
  return node.children === true || (Array.isArray(node.children) && node.children.length > 0);
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode, HierarchyNodeKey } from "@itwin/presentation-hierarchies";

export function createNodeId(node: Pick<HierarchyNode, "key" | "parentKeys">) {
  return [...node.parentKeys.map(serializeNodeKey), serializeNodeKey(node.key)].join(";");
}

function serializeNodeKey(key: HierarchyNodeKey): string {
  return HierarchyNodeKey.isCustom(key) ? key : convertObjectValuesToString(key);
}

function convertObjectValuesToString(obj: object): string {
  return Object.entries(obj)
    .map(([, value]) => {
      if (typeof value === "object") {
        return convertObjectValuesToString(value);
      }
      return String(value);
    })
    .join(",");
}

export function sameNodes(lhs: HierarchyNode, rhs: HierarchyNode): boolean {
  if (HierarchyNodeKey.compare(lhs.key, rhs.key) !== 0) {
    return false;
  }

  if (lhs.parentKeys.length !== rhs.parentKeys.length) {
    return false;
  }

  for (let i = lhs.parentKeys.length - 1; i >= 0; --i) {
    if (HierarchyNodeKey.compare(lhs.parentKeys[i], rhs.parentKeys[i]) !== 0) {
      return false;
    }
  }
  return true;
}

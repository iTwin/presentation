/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./DisposePolyfill.js";

import { HierarchyNode, HierarchyNodeKey } from "@itwin/presentation-hierarchies";

/** @internal */
export function createNodeId(node: Pick<HierarchyNode, "key" | "parentKeys">) {
  return [...node.parentKeys.map(serializeNodeKey), serializeNodeKey(node.key)].join(";");
}

function serializeNodeKey(key: HierarchyNodeKey): string {
  return convertObjectValuesToString(key);
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

/** @internal */
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

/** @internal */
export const MAX_LIMIT_OVERRIDE = 10000;

/**
 * A helper that disposes the given object, if it's disposable.
 *
 * The first option is to dispose using the deprecated `dispose` method if it exists on the object.
 * If not, we use the new `Symbol.dispose` method. If that doesn't exist either, the object is
 * considered as non-disposable and nothing is done with it.
 *
 * @internal
 */
export function safeDispose(disposable: {} | { [Symbol.dispose]: () => void } | { dispose: () => void }) {
  if ("dispose" in disposable) {
    disposable.dispose();
  } else if (Symbol.dispose in disposable) {
    disposable[Symbol.dispose]();
  }
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import naturalCompare from "natural-compare-lite";
import { ConcatenatedValue } from "@itwin/presentation-shared";
import { HierarchyNodeKey } from "../HierarchyNodeKey.js";

/**
 * This is a logging namespace for public log messages that may be interesting to consumers.
 * @internal
 */
export const LOGGING_NAMESPACE = "Presentation.Hierarchies";

/**
 * This is a logging namespace for public performance-related log messages that may be interesting to consumers.
 * @internal
 */
export const LOGGING_NAMESPACE_PERFORMANCE = `${LOGGING_NAMESPACE}.Performance`;

/**
 * This is a logging namespace for internal log messages that are only interesting to package contributors,
 * but not the consumers.
 * @internal
 */
export const LOGGING_NAMESPACE_INTERNAL = "Presentation.HierarchiesInternal";

/**
 * This is a logging namespace for internal performance-related log messages that are only interesting
 * to package contributors, but not the consumers.
 * @internal
 */
export const LOGGING_NAMESPACE_PERFORMANCE_INTERNAL = `${LOGGING_NAMESPACE_INTERNAL}.Performance`;

/** @internal */
export function createOperatorLoggingNamespace(
  operatorName: string,
  baseCategory:
    | typeof LOGGING_NAMESPACE
    | typeof LOGGING_NAMESPACE_PERFORMANCE
    | typeof LOGGING_NAMESPACE_INTERNAL
    | typeof LOGGING_NAMESPACE_PERFORMANCE_INTERNAL,
) {
  return `${baseCategory}.Operators.${operatorName}`;
}

/** @internal */
/* c8 ignore start */
export function createNodeIdentifierForLogging(
  node: { label: string | ConcatenatedValue; key: HierarchyNodeKey; parentKeys?: HierarchyNodeKey[] } | undefined,
) {
  if (!node) {
    return "<root>";
  }
  const { label, key } = node;
  const parentKeys = "parentKeys" in node ? node.parentKeys : "<unknown>";
  return JSON.stringify({ label, key, parentKeys });
}
/* c8 ignore end */

/** @internal */
export function hasChildren<TNode extends { children?: boolean | Array<unknown> }>(node: TNode) {
  return node.children === true || (Array.isArray(node.children) && node.children.length > 0);
}

/** @internal */
export function compareNodesByLabel<TLhsNode extends { label: string }, TRhsNode extends { label: string }>(lhs: TLhsNode, rhs: TRhsNode): number {
  return naturalCompare(lhs.label.toLocaleLowerCase(), rhs.label.toLocaleLowerCase());
}

/**
 * A helper that disposes the given object, if it's disposable. The first option is to dispose
 * using the `Symbol.dispose` method if it exists on the object. If not, fall back to the deprecated
 * `dispose` method if it exists. If not, the object is considered as non-disposable and nothing
 * is done with it.
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

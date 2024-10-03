/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import naturalCompare from "natural-compare-lite";
import { ConcatenatedValue } from "@itwin/presentation-shared";
import { HierarchyNodeKey } from "../HierarchyNodeKey";

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
// istanbul ignore next
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

/** @internal */
export function hasChildren<TNode extends { children?: boolean | Array<unknown> }>(node: TNode) {
  return node.children === true || (Array.isArray(node.children) && node.children.length > 0);
}

/** @internal */
export function compareNodesByLabel<TLhsNode extends { label: string }, TRhsNode extends { label: string }>(lhs: TLhsNode, rhs: TRhsNode): number {
  return naturalCompare(lhs.label.toLocaleLowerCase(), rhs.label.toLocaleLowerCase());
}

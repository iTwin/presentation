/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createClassSelector } from "./ECSqlValueSelectorSnippets.js";

import type { DeepReadonly } from "../MappedTypes.js";
import type { HiddenClassesTreeNode } from "../Metadata.js";

/**
 * Creates an ECSQL condition that selects only instances visible according to the given hidden classes tree. The
 * condition is meant to be used in a `WHERE` clause (without the `WHERE` keyword) of a query selecting from the
 * class, for which the tree was created.
 *
 * Returns an empty string when the tree doesn't restrict any instances.
 *
 * Usage example:
 *
 * ```ts
 * const whereClause = ECSql.createHiddenClassesWhereClause({
 *   tree: await schemaProvider.getHiddenClassesTree("BisCore.GeometricElement3d"),
 *   classAlias: "e",
 * });
 * const ecsql = `SELECT e.ECInstanceId FROM bis.GeometricElement3d e ${whereClause ? `WHERE ${whereClause}` : ""}`;
 * ```
 *
 * @see `ECSchemaProvider.getHiddenClassesTree`
 * @public
 */
export function createHiddenClassesWhereClause(props: {
  /** Hidden classes tree of the selected class. */
  tree: DeepReadonly<HiddenClassesTreeNode[]>;
  /** Alias of the selected class in the query. */
  classAlias: string;
}): string {
  // Instances of the selected class are visible by default, so root `show` nodes are redundant - only their
  // hidden descendants restrict anything.
  const rootNodes = getRestrictingRootNodes(props.tree);
  return createHideClause(rootNodes, props.classAlias) ?? "";
}

function getRestrictingRootNodes(
  nodes: DeepReadonly<HiddenClassesTreeNode[]>,
): DeepReadonly<Extract<HiddenClassesTreeNode, { state: "hide" }>[]> {
  return nodes.flatMap((node) => (node.state === "show" ? getRestrictingRootNodes(node.children) : [node]));
}

/** Creates a clause that excludes the given hidden nodes, except for their shown descendants. */
function createHideClause(
  nodes: DeepReadonly<Extract<HiddenClassesTreeNode, { state: "hide" }>[]>,
  classAlias: string,
): string | undefined {
  if (nodes.length === 0) {
    return undefined;
  }
  const hideClause = `[${classAlias}].[ECClassId] IS NOT (${createClassesList(nodes)})`;
  const showClause = createShowClause(
    nodes.flatMap(({ children }) => children),
    classAlias,
  );
  return showClause ? `(${hideClause} OR ${showClause})` : hideClause;
}

/** Creates a clause that includes the given shown nodes, except for their hidden descendants. */
function createShowClause(
  nodes: DeepReadonly<Extract<HiddenClassesTreeNode, { state: "show" }>[]>,
  classAlias: string,
): string | undefined {
  if (nodes.length === 0) {
    return undefined;
  }
  const showClause = `[${classAlias}].[ECClassId] IS (${createClassesList(nodes)})`;
  const hideClause = createHideClause(
    nodes.flatMap(({ children }) => children),
    classAlias,
  );
  return hideClause ? `(${showClause} AND ${hideClause})` : showClause;
}

function createClassesList(nodes: DeepReadonly<HiddenClassesTreeNode[]>) {
  return nodes.map(({ fullName }) => createClassSelector(fullName)).join(", ");
}

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
  return createClauses(rootNodes, props.classAlias).hideClause ?? "";
}

function getRestrictingRootNodes(nodes: DeepReadonly<HiddenClassesTreeNode[]>): DeepReadonly<HiddenClassesTreeNode[]> {
  return nodes.flatMap((node) => (node.state === "show" ? getRestrictingRootNodes(node.children) : [node]));
}

function createClauses(
  nodes: DeepReadonly<HiddenClassesTreeNode[]>,
  classAlias: string,
): { showClause?: string; hideClause?: string } {
  const result: { showClause?: string; hideClause?: string } = {};

  const shownNodes = nodes.filter(({ state }) => state === "show");
  if (shownNodes.length > 0) {
    let showClause = `[${classAlias}].[ECClassId] IS (${createClassesList(shownNodes)})`;
    const childClauses = createClauses(
      shownNodes.flatMap(({ children }) => children),
      classAlias,
    );
    if (childClauses.hideClause) {
      showClause = `(${showClause} AND ${childClauses.hideClause})`;
    }
    result.showClause = showClause;
  }

  const hiddenNodes = nodes.filter(({ state }) => state === "hide");
  if (hiddenNodes.length > 0) {
    let hideClause = `[${classAlias}].[ECClassId] IS NOT (${createClassesList(hiddenNodes)})`;
    const childClauses = createClauses(
      hiddenNodes.flatMap(({ children }) => children),
      classAlias,
    );
    if (childClauses.showClause) {
      hideClause = `(${hideClause} OR ${childClauses.showClause})`;
    }
    result.hideClause = hideClause;
  }

  return result;
}

function createClassesList(nodes: DeepReadonly<HiddenClassesTreeNode[]>) {
  return nodes.map(({ fullName }) => createClassSelector(fullName)).join(", ");
}

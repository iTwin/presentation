/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createClassSelector } from "./ECSqlValueSelectorSnippets.js";

import type { DeepReadonly } from "../MappedTypes.js";
import type { EC, ECSchemaProvider, HiddenClassesTreeNode } from "../Metadata.js";

/**
 * Creates a filter that excludes instances of classes hidden through `CoreCustomAttributes.HiddenClass` or
 * `CoreCustomAttributes.HiddenSchema` custom attributes, relative to the given base class:
 * - The base class itself is not excluded, even if it's hidden. Its derived classes are excluded or included
 *   according to the rules described by `HiddenClassesTreeNode`.
 * - Classes outside the base class' hierarchy are not affected, so the filter may be applied to queries selecting
 *   the base class, its derived class, or a broader class.
 * - The base class should be the class the query is meant to select. When the query's `FROM` class gets specialized,
 *   e.g. by an instance filter, still pass the original class - otherwise, specializing to a hidden class would
 *   include its instances.
 *
 * The hidden classes tree is requested from `schemaProvider` once, when creating the filter, and errors are
 * propagated. Caching the tree is the provider's responsibility, so create the filter when building queries and
 * reuse it for all aliases within the same operation, rather than holding on to it.
 *
 * Usage example:
 *
 * ```ts
 * const filter = await ECSql.createHiddenClassesFilter({ schemaProvider, baseClassName: "BisCore.GeometricElement3d" });
 * const whereClause = filter.createWhereClause("e");
 * const ecsql = `SELECT e.ECInstanceId FROM bis.GeometricElement3d e ${whereClause ? `WHERE ${whereClause}` : ""}`;
 * ```
 *
 * @public
 */
export async function createHiddenClassesFilter(props: {
  /** Schema provider used to get the hidden classes tree of the base class. */
  schemaProvider: Pick<ECSchemaProvider, "getHiddenClassesTree">;
  /** Full name of the class, relative to which classes are hidden. */
  baseClassName: EC.FullClassNameDotNotation;
}): Promise<{
  /**
   * Creates an ECSQL condition (without the `WHERE` keyword) that excludes instances of hidden classes, selected
   * under the given alias. Returns an empty string when nothing needs to be excluded.
   */
  createWhereClause(classAlias: string): string;
}> {
  const tree = await props.schemaProvider.getHiddenClassesTree(props.baseClassName);
  return { createWhereClause: (classAlias) => createHiddenClassesWhereClause({ tree, classAlias }) };
}

function createHiddenClassesWhereClause(props: {
  tree: DeepReadonly<HiddenClassesTreeNode[]>;
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

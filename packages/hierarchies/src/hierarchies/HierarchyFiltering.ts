/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { NonGroupingHierarchyNode } from "./HierarchyNode.js";
import { HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier.js";
import { GroupingNodeKey } from "./HierarchyNodeKey.js";

/** @public */
export interface FilterTargetGroupingNodeInfo {
  /** Key of the grouping node. */
  key: GroupingNodeKey;

  /**
   * Depth of the grouping node in the hierarchy.
   * Generally, it can be retrieved from `parentKeys.length`.
   */
  depth: number;
}

/** @public */
export interface HierarchyFilteringPathOptions {
  /**
   * This option specifies the way `autoExpand` flag should be assigned to nodes in the filtered hierarchy.
   * - If it's `false` or `undefined`, nodes have no 'autoExpand' flag.
   * - If it's `true`, then all nodes up to the filter target will have `autoExpand` flag.
   * - If it's an instance of `FilterTargetGroupingNodeInfo`, then all nodes up to the grouping node that matches this property,
   * will have `autoExpand` flag.
   */
  autoExpand?: boolean | FilterTargetGroupingNodeInfo;
}

/**
 * A path of hierarchy node identifiers for filtering the hierarchy with additional options.
 * @public
 */
export type HierarchyFilteringPath = HierarchyNodeIdentifiersPath | { path: HierarchyNodeIdentifiersPath; options?: HierarchyFilteringPathOptions };
/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyFilteringPath {
  /**
   * Normalizes the hierarchy filtering path to the object form.
   * @public
   */
  export function normalize(source: HierarchyFilteringPath): Exclude<HierarchyFilteringPath, HierarchyNodeIdentifiersPath> {
    if (Array.isArray(source)) {
      return { path: source, options: undefined };
    }
    return source;
  }

  /**
   * Merges two given `HierarchyFilteringPathOptions` objects.
   * - if both inputs are `undefined`, `undefined` is returned,
   * - else if one of the inputs is `undefined`, the other one is returned.
   * - else, merge each option individually.
   *
   * For the `autoExpand` attribute, the merge chooses to auto-expand as deep as the deepest input:
   * - if any one of the inputs is `true`, return `true`,
   * - else if both inputs are objects, return the one with the greater `depth` attribute.
   * - else if one input is an object, return it.
   * - else, return `false` or `undefined`.
   *
   * @public
   */
  export function mergeOptions(
    lhs: HierarchyFilteringPathOptions | undefined,
    rhs: HierarchyFilteringPathOptions | undefined,
  ): HierarchyFilteringPathOptions | undefined {
    if (!lhs || !rhs) {
      return lhs ?? rhs;
    }

    return {
      autoExpand: ((): HierarchyFilteringPathOptions["autoExpand"] => {
        if (rhs.autoExpand === true || lhs.autoExpand === true) {
          return true;
        }
        if (typeof lhs.autoExpand === "object") {
          if (typeof rhs.autoExpand === "object" && rhs.autoExpand.depth > lhs.autoExpand.depth) {
            return rhs.autoExpand;
          }
          return lhs.autoExpand;
        }
        return rhs.autoExpand;
      })(),
    };
  }
}

/**
 * An utility that extracts filtering properties from given root level filtering props or
 * the parent node. Returns `undefined` if filtering props are not present.
 * @public
 */
export function extractFilteringProps(
  rootLevelFilteringProps: HierarchyFilteringPath[],
  parentNode: Pick<NonGroupingHierarchyNode, "filtering"> | undefined,
):
  | {
      filteredNodePaths: HierarchyFilteringPath[];
      hasFilterTargetAncestor: boolean;
    }
  | undefined {
  if (!parentNode) {
    return { filteredNodePaths: rootLevelFilteringProps, hasFilterTargetAncestor: false };
  }
  return parentNode.filtering?.filteredChildrenIdentifierPaths
    ? {
        filteredNodePaths: parentNode.filtering.filteredChildrenIdentifierPaths,
        hasFilterTargetAncestor: !!parentNode.filtering.hasFilterTargetAncestor || !!parentNode.filtering.isFilterTarget,
      }
    : undefined;
}

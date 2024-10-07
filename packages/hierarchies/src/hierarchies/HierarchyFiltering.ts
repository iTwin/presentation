/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { NonGroupingHierarchyNode } from "./HierarchyNode";
import { HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier";
import { GroupingNodeKey } from "./HierarchyNodeKey";

/** @beta */
export interface FilterTargetGroupingNodeInfo {
  /** Key of the grouping node. */
  key: GroupingNodeKey;

  /**
   * Depth of the grouping node in the hierarchy.
   * Generally, it can be retrieved from `parentKeys.length`.
   */
  depth: number;
}

/** @beta */
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
 * @beta
 */
export type HierarchyFilteringPath = HierarchyNodeIdentifiersPath | { path: HierarchyNodeIdentifiersPath; options?: HierarchyFilteringPathOptions };
/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyFilteringPath {
  /**
   * Normalizes the hierarchy filtering path to the object form.
   * @beta
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
   * - if one of the inputs is `true`, return `true`,
   * - else if both inputs are objects, return the one with the greater `depth` attribute.
   * - else, return `false` or `undefined`.
   *
   * @beta
   */
  export function mergeOptions(
    lhs: HierarchyFilteringPathOptions | undefined,
    rhs: HierarchyFilteringPathOptions | undefined,
  ): HierarchyFilteringPathOptions | undefined {
    // istanbul ignore next
    if (!lhs && !rhs) {
      return undefined;
    }
    // istanbul ignore next
    if (!lhs) {
      return rhs;
    }
    // istanbul ignore next
    if (!rhs) {
      return lhs;
    }
    return {
      autoExpand: ((): HierarchyFilteringPathOptions["autoExpand"] => {
        if (rhs.autoExpand === true) {
          return rhs.autoExpand;
        }
        if (typeof lhs.autoExpand === "object" && typeof rhs.autoExpand === "object" && rhs.autoExpand.depth > lhs.autoExpand.depth) {
          return rhs.autoExpand;
        }
        return lhs.autoExpand;
      })(),
    };
  }
}

/**
 * An utility that extracts filtering properties from given root level filtering props or
 * the parent node. Returns `undefined` if filtering props are not present.
 * @beta
 */
export function extractFilteringProps(
  rootLevelFilteringProps: HierarchyFilteringPath[],
  parentNode: Pick<NonGroupingHierarchyNode, "filtering"> | undefined,
):
  | {
      filterPathsIdentifierPositions?: Array<[number, number]>;
      nodeIdentifierPaths: HierarchyFilteringPath[];
      hasFilterTargetAncestor: boolean;
    }
  | undefined {
  if (!parentNode) {
    return { hasFilterTargetAncestor: false, nodeIdentifierPaths: rootLevelFilteringProps };
  }
  return parentNode.filtering?.filterPathsIdentifierPositions
    ? {
        filterPathsIdentifierPositions: parentNode.filtering.filterPathsIdentifierPositions,
        hasFilterTargetAncestor: !!parentNode.filtering.hasFilterTargetAncestor || !!parentNode.filtering.isFilterTarget,
        nodeIdentifierPaths: rootLevelFilteringProps,
      }
    : undefined;
}

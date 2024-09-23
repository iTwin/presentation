/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

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
export type HierarchyFilteringPath = HierarchyNodeIdentifiersPath | { path: HierarchyNodeIdentifiersPath; options: HierarchyFilteringPathOptions };

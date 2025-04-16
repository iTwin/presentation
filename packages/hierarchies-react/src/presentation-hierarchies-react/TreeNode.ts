/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "@itwin/presentation-hierarchies";

/**
 * A type that defines an actual expandable node in a UI tree component, built with `useTree` hook.
 * @public
 */
export interface PresentationHierarchyNode {
  id: string;
  label: string;
  children: true | Array<PresentationTreeNode>;
  isExpanded: boolean;
  isLoading: boolean;
  isFilterable: boolean;
  isFiltered: boolean;
  /** UI-agnostic source of this node object. */
  nodeData: HierarchyNode;
}

/**
 * A type of `PresentationInfoNode` that is returned as the single child of a filtered parent node,
 * when none of the child nodes match the filter.
 *
 * @public
 */
export interface PresentationNoFilterMatchesInfoNode {
  id: string;
  parentNodeId: string | undefined;
  type: "NoFilterMatches";
}

/**
 * A type of `PresentationInfoNode` that is returned as the single child of a parent node, when the
 * number of child nodes exceeds the limit set on the tree nodes loader. The limit is also included
 * on this node as `resultSetSizeLimit` attribute.
 *
 * @public
 */
export interface PresentationResultSetTooLargeInfoNode {
  id: string;
  parentNodeId: string | undefined;
  type: "ResultSetTooLarge";
  resultSetSizeLimit: number;
}

/**
 * A type of `PresentationInfoNode` that contains a user-friendly message to be displayed in the UI.
 * Generally, this is the only child of a parent node, created in cases like an error loading children. The
 * renderer may offer users to re-load the children or the whole component in such cases.
 *
 * @public
 */
export interface PresentationGenericInfoNode {
  id: string;
  parentNodeId: string | undefined;
  type: "Unknown";
  message: string;
}

/**
 * A type that defines a non-expandable, non-selectable informational node in a UI tree component, built
 * with `useTree` hook.
 *
 * @public
 */
export type PresentationInfoNode = PresentationGenericInfoNode | PresentationResultSetTooLargeInfoNode | PresentationNoFilterMatchesInfoNode;

/**
 * A type that defines a node in a UI tree component, built with `useTree` hook.
 * @public
 */
export type PresentationTreeNode = PresentationHierarchyNode | PresentationInfoNode;

/**
 * An utility function to check if a node is a `PresentationHierarchyNode`.
 * @public
 */
export function isPresentationHierarchyNode(node: PresentationTreeNode): node is PresentationHierarchyNode {
  return "children" in node;
}

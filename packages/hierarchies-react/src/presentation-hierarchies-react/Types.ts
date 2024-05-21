/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "@itwin/presentation-hierarchies";

/** @beta */
export interface PresentationHierarchyNode {
  id: string;
  label: string;
  children: true | Array<PresentationTreeNode>;
  isExpanded: boolean;
  isLoading: boolean;
  isFilterable: boolean;
  isFiltered: boolean;
  nodeData: HierarchyNode;
  /** Additional data that may be assigned to this node. */
  extendedData?: { [key: string]: any };
}

/** @beta */
export interface PresentationGenericInfoNode {
  id: string;
  parentNodeId: string | undefined;
  type: "ChildrenPlaceholder" | "NoFilterMatchingNodes" | "Unknown";
  message: string;
}

/** @beta */
export interface PresentationResultSetTooLargeInfoNode {
  id: string;
  parentNodeId: string | undefined;
  type: "ResultSetTooLarge";
  resultSetSizeLimit: number;
}

/** @beta */
export type PresentationInfoNode = PresentationGenericInfoNode | PresentationResultSetTooLargeInfoNode;

/** @beta */
export type PresentationTreeNode = PresentationHierarchyNode | PresentationInfoNode;

/** @beta */
export function isPresentationHierarchyNode(node: PresentationTreeNode): node is PresentationHierarchyNode {
  return "children" in node;
}

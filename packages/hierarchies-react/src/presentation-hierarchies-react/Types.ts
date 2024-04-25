/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "@itwin/presentation-hierarchies";

/** @beta */
export type InfoNodeTypes = "ResultSetTooLarge" | "ChildrenPlaceholder" | "NoFilterMatchingNodes" | "Unknown";

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
export interface PresentationInfoNode {
  id: string;
  parentNodeId: string | undefined;
  type: InfoNodeTypes;
  message: string;
}

/** @beta */
export type PresentationTreeNode = PresentationHierarchyNode | PresentationInfoNode;

/** @beta */
export function isPresentationHierarchyNode(node: PresentationTreeNode): node is PresentationHierarchyNode {
  return "children" in node;
}

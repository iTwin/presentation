/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PresentationInstanceFilterInfo } from "@itwin/presentation-components";

/** @beta */
export type InfoNodeTypes = "ResultSetTooLarge" | "Unknown";

/** @beta */
export interface PresentationHierarchyNode {
  id: string;
  label: string;
  children: true | Array<PresentationTreeNode>;
  isExpanded: boolean;
  isLoading: boolean;
  hierarchyLimit?: number | "unbounded";
  appliedFilter?: PresentationInstanceFilterInfo;
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

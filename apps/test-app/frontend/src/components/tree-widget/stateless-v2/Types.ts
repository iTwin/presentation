/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { GenericInstanceFilter, HierarchyNode } from "@itwin/presentation-hierarchy-builder";

/** @beta */
export interface PresentationHierarchyNodeIdentifier {
  id: string;
  nodeData: HierarchyNode;
  hierarchyLimit?: number | "unbounded";
  instanceFilter?: GenericInstanceFilter;
}

/** @beta */
export type InfoNodeTypes = "ResultSetTooLarge" | "Unknown";

/** @beta */
export interface PresentationHierarchyNode extends PresentationHierarchyNodeIdentifier {
  label: string;
  children: true | Array<PresentationTreeNode>;
  isExpanded: boolean;
  isLoading: boolean;
}

/** @beta */
export interface PresentationInfoNode {
  id: string;
  parentNode: PresentationHierarchyNode | undefined;
  type: InfoNodeTypes;
  message: string;
}

/** @beta */
export type PresentationTreeNode = PresentationHierarchyNode | PresentationInfoNode;

/** @beta */
export function isPresentationHierarchyNode(node: PresentationTreeNode): node is PresentationHierarchyNode {
  return "children" in node;
}

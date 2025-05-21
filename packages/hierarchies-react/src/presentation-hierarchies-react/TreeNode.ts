/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode } from "@itwin/presentation-hierarchies";

/**
 * A type that defines an node in a UI tree component, built with `useTree` hook.
 * @public
 */
export interface PresentationHierarchyNode {
  id: string;
  label: string;
  children: true | Array<PresentationHierarchyNode>;
  isExpanded: boolean;
  isLoading: boolean;
  isFilterable: boolean;
  isFiltered: boolean;
  /** UI-agnostic source of this node object. */
  nodeData: HierarchyNode;
  /** Contains error encountered from expanding the node */
  error?: ErrorInfo;
}

/**
 * A type of `ErrorInfo` that is returned,
 * when none of the child nodes match the filter.
 *
 * @public
 */
export interface NoFilterMatchesErrorInfo {
  id: string;
  type: "NoFilterMatches";
}

/**
 * A type of `ErrorInfo` that is returned, when the
 * number of child nodes exceeds the limit set on the tree nodes loader. The limit is also included
 * on this error as `resultSetSizeLimit` attribute.
 *
 * @public
 */
export interface ResultSetTooLargeErrorInfo {
  id: string;
  type: "ResultSetTooLarge";
  resultSetSizeLimit: number;
}

/**
 * A type of `ErrorInfo` that contains a user-friendly message to be displayed in the UI.
 * Created in cases like an error loading children. The
 * renderer may offer users to re-load the children or the whole component in such cases.
 *
 * @public
 */
export interface GenericErrorInfo {
  id: string;
  type: "Unknown";
  message: string;
}

/**
 * A collection of types that defines an error state for `PresentationHierarchyNode` node in a UI tree component, built
 * with `useTree` hook.
 *
 * @public
 */
export type ErrorInfo = GenericErrorInfo | ResultSetTooLargeErrorInfo | NoFilterMatchesErrorInfo;

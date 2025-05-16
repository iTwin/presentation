/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { GenericInstanceFilter, HierarchyNode } from "@itwin/presentation-hierarchies";
import { InstanceKey } from "@itwin/presentation-shared";
import { ErrorInfo, PresentationHierarchyNode } from "./TreeNode.js";
import { SelectionChangeType } from "./UseSelectionHandler.js";

/**
 * Type definition used to render tree rendering UI component.
 * @alpha
 */
export type TreeRendererProps = {
  /**
   * Array containing root tree nodes.
   */
  rootNodes: PresentationHierarchyNode[];
  /**
   * A function that should be called to either expand or collapse the given node.
   */
  expandNode: (nodeId: string, isExpanded: boolean) => void;
  /**
   * A function that should be called to select nodes in the tree.
   * @param nodeIds Ids of the nodes that are selected.
   * @param changeType Type of change that occurred for the selection.
   */
  selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
  /** Determines whether a given node is selected. */
  isNodeSelected: (nodeId: string) => boolean;
} & CommonRendererProps;

/**
 * Type definition used to render root error handling UI component.
 * @alpha
 */
export type RootErrorRendererProps = {
  /** Object containing root error information */
  error: ErrorInfo;
} & CommonRendererProps;

/**
 * @alpha
 */
interface CommonRendererProps {
  /**
   * A function that should be called to reload the tree.
   */
  reloadTree: (options?: ReloadTreeOptions) => void;
  /** Returns hierarchy level details for a given node ID. */
  getHierarchyLevelDetails: (nodeId: string | undefined) => HierarchyLevelDetails | undefined;
}

/**
 * Options for doing either full or a sub tree reload.
 * @public
 */
interface ReloadTreeOptions {
  /** Specifies parent node under which sub tree should be reloaded. */
  parentNodeId: string | undefined;

  /**
   * Specifies how current tree state should be handled:
   * - `keep` - try to keep current tree state (expanded/collapsed nodes, instance filters, etc.).
   * - `discard` - do not try to keep current tree state. Tree model will be update after nodes are reloaded.
   * - `reset` - remove subtree from the model before reloading and reload nodes ignoring cache.
   *
   * Defaults to `"keep"`.
   */
  state?: "keep" | "discard" | "reset";
}

/**
 * A data structure that contains information about a single hierarchy level.
 * @public
 */
export interface HierarchyLevelDetails {
  /** The parent node whose hierarchy level's information is contained in this data structure */
  hierarchyNode: HierarchyNode | undefined;

  /** A function to get instance keys of the hierarchy level. */
  getInstanceKeysIterator: (props?: {
    instanceFilter?: GenericInstanceFilter;
    hierarchyLevelSizeLimit?: number | "unbounded";
  }) => AsyncIterableIterator<InstanceKey>;

  /** Get the limit of how many nodes can be loaded in this hierarchy level. */
  sizeLimit?: number | "unbounded";
  /** Set the limit of how many nodes can be loaded in this hierarchy level. */
  setSizeLimit: (value: undefined | number | "unbounded") => void;

  /** Get the active instance filter applied to this hierarchy level. */
  instanceFilter?: GenericInstanceFilter;
  /** Set the instance filter to apply to this hierarchy level */
  setInstanceFilter: (filter: GenericInstanceFilter | undefined) => void;
}

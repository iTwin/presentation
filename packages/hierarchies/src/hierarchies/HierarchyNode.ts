/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { OmitOverUnion } from "@itwin/presentation-shared";
import {
  ClassGroupingNodeKey,
  GenericNodeKey,
  GroupingNodeKey,
  HierarchyNodeKey,
  IModelHierarchyNodeKey,
  IModelInstanceKey,
  InstancesNodeKey,
  LabelGroupingNodeKey,
  PropertyGroupingNodeKey,
  PropertyOtherValuesGroupingNodeKey,
  PropertyValueGroupingNodeKey,
  PropertyValueRangeGroupingNodeKey,
} from "./HierarchyNodeKey.js";
import { HierarchySearchPath, HierarchySearchPathOptions } from "./HierarchySearch.js";

/** @public */
export type HierarchyNodeSearchProps = {
  /** If set to true, then one of the ancestor nodes in the hierarchy is the search target. */
  hasSearchTargetAncestor?: boolean;
  /** Paths to node's children that are search targets. */
  searchedChildrenIdentifierPaths?: HierarchySearchPath[];
} & (
  | {
      /** Whether or not this node is a search target. */
      isSearchTarget?: false;
    }
  | {
      /** Whether or not this node is a search target. */
      isSearchTarget: true;
      /** Options that were used to search the node. */
      searchTargetOptions?: HierarchySearchPathOptions;
    }
);
/** @public */

/**
 * A data structure that defines attributes that are common to all types of hierarchy nodes.
 * @public
 */
interface BaseHierarchyNode {
  /** Identifiers of all node ancestors. Can be used to identify a node in the hierarchy. */
  parentKeys: HierarchyNodeKey[];
  /** Node's display label. */
  label: string;
  /** A flag indicating whether the node has children or not. */
  children: boolean;
  /** A flag indicating whether this node should be auto-expanded in the UI. */
  autoExpand?: boolean;
  /** Additional data that may be assigned to this node. */
  extendedData?: { [key: string]: any };
  /** Data that is assigned to the node if hierarchy search is enabled */
  search?: HierarchyNodeSearchProps;
}

/**
 * A data structure that represents a single non-grouping hierarchy node.
 * @public
 */
export interface NonGroupingHierarchyNode extends BaseHierarchyNode {
  /** An identifier to identify the node in its hierarchy level. */
  key: GenericNodeKey | InstancesNodeKey;
  /**
   * Identifies whether the hierarchy level below this node supports filtering. If not, supplying an instance
   * filter when requesting child hierarchy level will have no effect.
   */
  supportsFiltering?: boolean;
}

/**
 * A data structure that represents a grouping node that groups other nodes.
 * @public
 */
export interface GroupingHierarchyNode extends BaseHierarchyNode {
  /** An identifier to identify this grouping node in its hierarchy level. */
  key: GroupingNodeKey;

  /**
   * Keys of all instances grouped by this node, including deeply nested under
   * other grouping nodes.
   */
  groupedInstanceKeys: IModelInstanceKey[];

  /** The closest ancestor node that is not a grouping node. May be `undefined` if the grouping node grouped root level nodes. */
  nonGroupingAncestor?: ParentHierarchyNode<NonGroupingHierarchyNode>;
}

/**
 * A data structure that represents a single hierarchy node.
 * @public
 */
export type HierarchyNode = NonGroupingHierarchyNode | GroupingHierarchyNode;

/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNode {
  /** Checks whether the given node is a generic node */
  export function isGeneric<TNode extends { key: HierarchyNodeKey }>(node: TNode): node is TNode & NonGroupingHierarchyNode & { key: GenericNodeKey } {
    return HierarchyNodeKey.isGeneric(node.key);
  }
  /** Checks whether the given node is a standard (iModel content based) node */
  export function isIModelNode<TNode extends { key: HierarchyNodeKey }>(node: TNode): node is TNode & { key: IModelHierarchyNodeKey } {
    return HierarchyNodeKey.isIModelNodeKey(node.key);
  }
  /** Checks whether the given node is an ECInstances-based node */
  export function isInstancesNode<TNode extends { key: HierarchyNodeKey }>(node: TNode): node is TNode & NonGroupingHierarchyNode & { key: InstancesNodeKey } {
    return HierarchyNodeKey.isInstances(node.key);
  }
  /** Checks whether the given node is a grouping node */
  export function isGroupingNode<TNode extends { key: HierarchyNodeKey }>(node: TNode): node is TNode & GroupingHierarchyNode {
    return HierarchyNodeKey.isGrouping(node.key);
  }
  /** Checks whether the given node is a class grouping node */
  export function isClassGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: ClassGroupingNodeKey; supportsFiltering?: undefined } & GroupingHierarchyNode {
    return HierarchyNodeKey.isClassGrouping(node.key);
  }
  /** Checks whether the given node is a label grouping node */
  export function isLabelGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: LabelGroupingNodeKey; supportsFiltering?: undefined } & GroupingHierarchyNode {
    return HierarchyNodeKey.isLabelGrouping(node.key);
  }
  /** Checks whether the given node is property grouping node for other values  */
  export function isPropertyOtherValuesGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyOtherValuesGroupingNodeKey; supportsFiltering?: undefined } & GroupingHierarchyNode {
    return HierarchyNodeKey.isPropertyOtherValuesGrouping(node.key);
  }
  /** Checks whether the given node is a property value grouping node */
  export function isPropertyValueGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyValueGroupingNodeKey; supportsFiltering?: undefined } & GroupingHierarchyNode {
    return HierarchyNodeKey.isPropertyValueGrouping(node.key);
  }
  /** Checks whether the given node is a property value range grouping node */
  export function isPropertyValueRangeGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyValueRangeGroupingNodeKey; supportsFiltering?: undefined } & GroupingHierarchyNode {
    return HierarchyNodeKey.isPropertyValueRangeGrouping(node.key);
  }
  /** Checks whether the given node is a property grouping node */
  export function isPropertyGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyGroupingNodeKey; supportsFiltering?: undefined } & GroupingHierarchyNode {
    return HierarchyNodeKey.isPropertyGrouping(node.key);
  }
}

/**
 * A type of `HierarchyNode` that doesn't know about its children and is an input when requesting
 * them using `HierarchyProvider.getNodes`.
 * @public
 */
export type ParentHierarchyNode<TBase = HierarchyNode> = OmitOverUnion<TBase, "children">;

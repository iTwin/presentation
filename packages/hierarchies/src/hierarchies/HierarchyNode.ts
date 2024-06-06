/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ConcatenatedValue, InstanceKey, OmitOverUnion, PrimitiveValue } from "@itwin/presentation-shared";
import { HierarchyNodeIdentifiersPath } from "./HierarchyNodeIdentifier";
import {
  ClassGroupingNodeKey,
  GroupingNodeKey,
  HierarchyNodeKey,
  InstancesNodeKey,
  LabelGroupingNodeKey,
  PropertyGroupingNodeKey,
  PropertyOtherValuesGroupingNodeKey,
  PropertyValueGroupingNodeKey,
  PropertyValueRangeGroupingNodeKey,
  StandardHierarchyNodeKey,
} from "./HierarchyNodeKey";

/**
 * A data structure that represents a single non-grouping hierarchy node.
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
  /** Data that may be assigned to the node if filtering is enabled */
  filtering?: {
    isFilterTarget?: boolean;
    hasFilterTargetAncestor?: boolean;
    filteredChildrenIdentifierPaths?: HierarchyNodeIdentifiersPath[];
  };
}

/**
 * A data structure that represents a single non-grouping hierarchy node.
 * @beta
 */
export interface NonGroupingHierarchyNode extends BaseHierarchyNode {
  /** An identifier to identify the node in its hierarchy level. */
  key: string | InstancesNodeKey;
  /**
   * Identifies whether the hierarchy level below this node supports filtering. If not, supplying an instance
   * filter when requesting child hierarchy level will have no effect.
   */
  supportsFiltering?: boolean;
}

/**
 * A data structure that represents a grouping node that groups other nodes.
 * @beta
 */
export interface GroupingHierarchyNode extends BaseHierarchyNode {
  /** An identifier to identify this grouping node in its hierarchy level. */
  key: GroupingNodeKey;

  /**
   * Keys of all instances grouped by this node, including deeply nested under
   * other grouping nodes.
   */
  groupedInstanceKeys: InstanceKey[];

  /** The closest ancestor node that is not a grouping node. May be `undefined` if the grouping node grouped root level nodes. */
  nonGroupingAncestor?: ParentHierarchyNode<NonGroupingHierarchyNode>;
}

/**
 * A data structure that represents a single hierarchy node.
 * @beta
 */
export type HierarchyNode = NonGroupingHierarchyNode | GroupingHierarchyNode;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNode {
  /** Checks whether the given node is a custom node */
  export function isCustom<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & (TNode extends ProcessedHierarchyNode ? ProcessedCustomHierarchyNode : NonGroupingHierarchyNode) & { key: string } {
    return HierarchyNodeKey.isCustom(node.key);
  }
  /** Checks whether the given node is a standard (iModel content based) node */
  export function isStandard<TNode extends { key: HierarchyNodeKey }>(node: TNode): node is TNode & { key: StandardHierarchyNodeKey } {
    return HierarchyNodeKey.isStandard(node.key);
  }
  /** Checks whether the given node is an ECInstances-based node */
  export function isInstancesNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & (TNode extends ProcessedHierarchyNode ? ProcessedInstanceHierarchyNode : NonGroupingHierarchyNode) & { key: InstancesNodeKey } {
    return HierarchyNodeKey.isInstances(node.key);
  }
  /** Checks whether the given node is a grouping node */
  export function isGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & (TNode extends ProcessedHierarchyNode ? ProcessedGroupingHierarchyNode : GroupingHierarchyNode) {
    return HierarchyNodeKey.isGrouping(node.key);
  }
  /** Checks whether the given node is a class grouping node */
  export function isClassGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: ClassGroupingNodeKey; supportsFiltering?: undefined } & (TNode extends ProcessedHierarchyNode
      ? ProcessedGroupingHierarchyNode
      : GroupingHierarchyNode) {
    return HierarchyNodeKey.isClassGrouping(node.key);
  }
  /** Checks whether the given node is a label grouping node */
  export function isLabelGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: LabelGroupingNodeKey; supportsFiltering?: undefined } & (TNode extends ProcessedHierarchyNode
      ? ProcessedGroupingHierarchyNode
      : GroupingHierarchyNode) {
    return HierarchyNodeKey.isLabelGrouping(node.key);
  }
  /** Checks whether the given node is property grouping node for other values  */
  export function isPropertyOtherValuesGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyOtherValuesGroupingNodeKey; supportsFiltering?: undefined } & (TNode extends ProcessedHierarchyNode
      ? ProcessedGroupingHierarchyNode
      : GroupingHierarchyNode) {
    return HierarchyNodeKey.isPropertyOtherValuesGrouping(node.key);
  }
  /** Checks whether the given node is a property value grouping node */
  export function isPropertyValueGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyValueGroupingNodeKey; supportsFiltering?: undefined } & (TNode extends ProcessedHierarchyNode
      ? ProcessedGroupingHierarchyNode
      : GroupingHierarchyNode) {
    return HierarchyNodeKey.isPropertyValueGrouping(node.key);
  }
  /** Checks whether the given node is a property value range grouping node */
  export function isPropertyValueRangeGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyValueRangeGroupingNodeKey; supportsFiltering?: undefined } & (TNode extends ProcessedHierarchyNode
      ? ProcessedGroupingHierarchyNode
      : GroupingHierarchyNode) {
    return HierarchyNodeKey.isPropertyValueRangeGrouping(node.key);
  }
  /** Checks whether the given node is a property grouping node */
  export function isPropertyGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyGroupingNodeKey; supportsFiltering?: undefined } & (TNode extends ProcessedHierarchyNode
      ? ProcessedGroupingHierarchyNode
      : GroupingHierarchyNode) {
    return HierarchyNodeKey.isPropertyGrouping(node.key);
  }
}

/**
 * A type of `HierarchyNode` that doesn't know about its children and is an input when requesting
 * them using `HierarchyProvider.getNodes`.
 */
export type ParentHierarchyNode<TBase = HierarchyNode> = OmitOverUnion<TBase, "children">;

/**
 * Base processing parameters that apply to every node.
 */
interface HierarchyNodeProcessingParamsBase {
  /** Indicates if this node should be hidden if it has no child nodes. */
  hideIfNoChildren?: boolean;
  /** Indicates that this node should always be hidden and its children should be loaded in its place. */
  hideInHierarchy?: boolean;
}

/**
 * A data structure for defining nodes' grouping requirements.
 */
interface HierarchyNodeGroupingParams {
  byLabel?: HierarchyNodeLabelGroupingParams;
  byClass?: boolean | HierarchyNodeGroupingParamsBase;
  byBaseClasses?: HierarchyNodeBaseClassGroupingParams;
  byProperties?: HierarchyNodePropertiesGroupingParams;
}

/**
 * A data structure for defining params specifically used for label grouping.
 */
interface HierarchyNodeLabelGroupingBaseParams {
  /** Label grouping option that determines whether to group nodes or to merge them. Defaults to "group".*/
  action?: "group" | "merge";
  /** Value that needs to match in order for nodes to be grouped or merged.*/
  groupId?: string;
}

/**
 * A data structure for defining label merging.
 */
interface HierarchyNodeLabelGroupingMergeParams extends HierarchyNodeLabelGroupingBaseParams {
  action: "merge";
}

/**
 * A data structure for defining label grouping with additional parameters.
 */
interface HierarchyNodeLabelGroupingGroupParams extends HierarchyNodeLabelGroupingBaseParams, HierarchyNodeGroupingParamsBase {
  action?: "group";
}

/** A data structure for defining possible label grouping types. */
export type HierarchyNodeLabelGroupingParams = boolean | HierarchyNodeLabelGroupingMergeParams | HierarchyNodeLabelGroupingGroupParams;

/** Grouping parameters that are shared across all types of groupings. */
export interface HierarchyNodeGroupingParamsBase {
  /** Hiding option that determines whether to hide group nodes which have no siblings at the same hierarchy level. */
  hideIfNoSiblings?: boolean;
  /** Hiding option that determines whether to hide group nodes which have only one node as its children. */
  hideIfOneGroupedNode?: boolean;
  /** Option which auto expands grouping nodes' children when it has single child or always. */
  autoExpand?: HierarchyNodeAutoExpandProp;
}

/**
 * Defines possible values for `BaseGroupingParams.autoExpand` attribute:
 * - `single-child` - set the grouping node to auto-expand if it groups a single node.
 * - `always` - always set the grouping node to auto-expand.
 */
export type HierarchyNodeAutoExpandProp = "single-child" | "always";

/**
 * A data structure that represents base class grouping.
 */
interface HierarchyNodeBaseClassGroupingParams extends HierarchyNodeGroupingParamsBase {
  /**
   * Full names of classes, which should be used to group the node. Only has effect if the node
   * represents an instance of that class.
   *
   * Full class name format: `SchemaName.ClassName`.
   */
  fullClassNames: string[];
}

/** A data structure that represents properties grouping. */
export interface HierarchyNodePropertiesGroupingParams extends HierarchyNodeGroupingParamsBase {
  /**
   * Full name of a class whose properties are used to group the node. Only has effect if the node
   * represents an instance of that class.
   *
   * Full class name format: `SchemaName.ClassName`.
   */
  propertiesClassName: string;
  /**
   * Property grouping option that determines whether to group nodes whose grouping value is not set or is set to an empty string.
   *
   * Label of the created grouping node will be `Not Specified`.
   */
  createGroupForUnspecifiedValues?: boolean;
  /**
   * Property grouping option that determines whether to group nodes whose grouping value doesn't fit within any of the provided
   * ranges, or is not a numeric value.
   *
   * Label of the created grouping node will be `Other`.
   */
  createGroupForOutOfRangeValues?: boolean;
  /**
   * Properties of the specified class, by which the nodes should be grouped. Each provided group definition results in a
   * grouping hierarchy level.
   *
   * Example usage:
   * ```ts
   * propertyGroups: [
   *   {
   *     propertyName: "type",
   *     propertyValue: "Wall"
   *   },
   *   {
   *     propertyName: "length",
   *     propertyValue: 15,
   *     ranges: [
   *       { fromValue: 1, toValue: 10, rangeLabel: "Small" },
   *       { fromValue: 11, toValue: 20, rangeLabel: "Medium" }
   *     ]
   *   },
   * ]
   * ```
   */
  propertyGroups: HierarchyNodePropertyGroup[];
}

/** A data structure that represents specific properties' grouping params. */
export interface HierarchyNodePropertyGroup {
  /** A string indicating the name of the property to group by. */
  propertyName: string;
  /**  Value of the property, which will be used to group the node. */
  propertyValue?: PrimitiveValue;
  /** Ranges are used to group nodes by numeric properties which are within specified bounds. */
  ranges?: HierarchyNodePropertyValueRange[];
}

/** A data structure that represents boundaries for a value. */
export interface HierarchyNodePropertyValueRange {
  /** Defines the lower bound of the range. */
  fromValue: number;
  /** Defines the upper bound of the range. */
  toValue: number;
  /** Defines the range label. Will be used as `PropertyValueRangeGroupingNode` node's display label. */
  rangeLabel?: string;
}

/** Processing parameters that apply to instance nodes. */
export interface InstanceHierarchyNodeProcessingParams extends HierarchyNodeProcessingParamsBase {
  grouping?: HierarchyNodeGroupingParams;
}

/** A custom (not based on data in an iModel) node that has processing parameters. */
export type ProcessedCustomHierarchyNode = Omit<NonGroupingHierarchyNode, "key" | "children"> & {
  key: string;
  children?: boolean;
  processingParams?: HierarchyNodeProcessingParamsBase;
};
/** An instances' (based on data in an iModel) node that has processing parameters. */
export type ProcessedInstanceHierarchyNode = Omit<NonGroupingHierarchyNode, "key" | "children"> & {
  key: InstancesNodeKey;
  children?: boolean;
  processingParams?: InstanceHierarchyNodeProcessingParams;
};
/** A grouping node that groups either instance nodes or other grouping nodes. */
export type ProcessedGroupingHierarchyNode = Omit<GroupingHierarchyNode, "children"> & {
  children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode>;
};

/**
 * A `HierarchyNode` that may have processing parameters defining whether it should be hidden under some conditions,
 * how it should be grouped, sorted, etc.
 *
 * Type guards under `HierarchyNode` namespace can be used to differentiate between different sub-types of
 * `ProcessedHierarchyNode`.
 *
 * @beta
 */
export type ProcessedHierarchyNode = ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode | ProcessedGroupingHierarchyNode;

/**
 * A `ProcessedHierarchyNode` that has an unformatted label in a form of `ConcatenatedValue`. Generally this is
 * returned when the node is just parsed from query results.
 * @beta
 */
export type ParsedHierarchyNode<TBase = ParsedCustomHierarchyNode | ParsedInstanceHierarchyNode> = OmitOverUnion<TBase, "label" | "parentKeys"> & {
  label: string | ConcatenatedValue;
};
/** A kind of `ProcessedCustomHierarchyNode` that has unformatted label and doesn't know about its ancestors. */
export type ParsedCustomHierarchyNode = ParsedHierarchyNode<ProcessedCustomHierarchyNode>;
/** A kind of `ProcessedInstanceHierarchyNode` that has unformatted label and doesn't know about its ancestors. */
export type ParsedInstanceHierarchyNode = ParsedHierarchyNode<ProcessedInstanceHierarchyNode>;

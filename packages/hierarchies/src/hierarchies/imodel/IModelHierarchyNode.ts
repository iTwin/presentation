/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ConcatenatedValue, OmitOverUnion, PrimitiveValue } from "@itwin/presentation-shared";
import { GroupingHierarchyNode, NonGroupingHierarchyNode } from "../HierarchyNode";
import { GenericNodeKey, HierarchyNodeKey, InstancesNodeKey } from "../HierarchyNodeKey";

/**
 * Base processing parameters that apply to every node.
 * @beta
 */
interface HierarchyNodeProcessingParamsBase {
  /** Indicates if this node should be hidden if it has no child nodes. */
  hideIfNoChildren?: boolean;
  /** Indicates that this node should always be hidden and its children should be loaded in its place. */
  hideInHierarchy?: boolean;
}

/**
 * A data structure for defining nodes' grouping requirements.
 * @beta
 */
interface HierarchyNodeGroupingParams {
  byLabel?: HierarchyNodeLabelGroupingParams;
  byClass?: boolean | HierarchyNodeGroupingParamsBase;
  byBaseClasses?: HierarchyNodeBaseClassGroupingParams;
  byProperties?: HierarchyNodePropertiesGroupingParams;
}

/**
 * A data structure for defining params specifically used for label grouping.
 * @beta
 */
interface HierarchyNodeLabelGroupingBaseParams {
  /** Label grouping option that determines whether to group nodes or to merge them. Defaults to "group".*/
  action?: "group" | "merge";
  /** Value that needs to match in order for nodes to be grouped or merged.*/
  groupId?: string;
}

/**
 * A data structure for defining label merging.
 * @beta
 */
interface HierarchyNodeLabelGroupingMergeParams extends HierarchyNodeLabelGroupingBaseParams {
  action: "merge";
}

/**
 * A data structure for defining label grouping with additional parameters.
 * @beta
 */
interface HierarchyNodeLabelGroupingGroupParams extends HierarchyNodeLabelGroupingBaseParams, HierarchyNodeGroupingParamsBase {
  action?: "group";
}

/**
 * A data structure for defining possible label grouping types.
 * @beta
 */
export type HierarchyNodeLabelGroupingParams = boolean | HierarchyNodeLabelGroupingMergeParams | HierarchyNodeLabelGroupingGroupParams;

/**
 * Grouping parameters that are shared across all types of groupings.
 * @beta
 */
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
 * @beta
 */
export type HierarchyNodeAutoExpandProp = "single-child" | "always";

/**
 * A data structure that represents base class grouping.
 * @beta
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

/**
 * A data structure that represents properties grouping.
 * @beta
 */
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

/**
 * A data structure that represents specific properties' grouping params.
 * @beta
 */
export interface HierarchyNodePropertyGroup {
  /** A string indicating the name of the property to group by. */
  propertyName: string;
  /**  Value of the property, which will be used to group the node. */
  propertyValue?: PrimitiveValue | ConcatenatedValue;
  /** Ranges are used to group nodes by numeric properties which are within specified bounds. */
  ranges?: HierarchyNodePropertyValueRange[];
}

/**
 * A data structure that represents boundaries for a value.
 * @beta
 */
export interface HierarchyNodePropertyValueRange {
  /** Defines the lower bound of the range. */
  fromValue: number;
  /** Defines the upper bound of the range. */
  toValue: number;
  /** Defines the range label. Will be used as `PropertyValueRangeGroupingNode` node's display label. */
  rangeLabel?: string;
}

/**
 * Processing parameters that apply to instance nodes.
 * @beta
 */
export interface InstanceHierarchyNodeProcessingParams extends HierarchyNodeProcessingParamsBase {
  grouping?: HierarchyNodeGroupingParams;
}

/**
 * A generic (not based on data in an iModel) node that has processing parameters.
 * @beta
 */
export type ProcessedGenericHierarchyNode = Omit<NonGroupingHierarchyNode, "key" | "children"> & {
  key: GenericNodeKey;
  children?: boolean;
  processingParams?: HierarchyNodeProcessingParamsBase;
};

/**
 * An instances' (based on data in an iModel) node that has processing parameters.
 * @beta
 */
export type ProcessedInstanceHierarchyNode = Omit<NonGroupingHierarchyNode, "key" | "children"> & {
  key: InstancesNodeKey;
  children?: boolean;
  processingParams?: InstanceHierarchyNodeProcessingParams;
};

/**
 * A grouping node that groups either instance nodes or other grouping nodes.
 * @beta
 */
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
export type ProcessedHierarchyNode = ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode | ProcessedGroupingHierarchyNode;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace ProcessedHierarchyNode {
  /** Checks whether the given node is a generic node */
  export function isGeneric(node: ProcessedHierarchyNode): node is ProcessedGenericHierarchyNode {
    return HierarchyNodeKey.isGeneric(node.key);
  }
  /** Checks whether the given node is an ECInstances-based node */
  export function isInstancesNode(node: ProcessedHierarchyNode): node is ProcessedInstanceHierarchyNode {
    return HierarchyNodeKey.isInstances(node.key);
  }
  /** Checks whether the given node is a grouping node */
  export function isGroupingNode(node: ProcessedHierarchyNode): node is ProcessedGroupingHierarchyNode {
    return HierarchyNodeKey.isGrouping(node.key);
  }
}

/**
 * A `ProcessedHierarchyNode` that has an unformatted label in a form of `ConcatenatedValue`. Generally this is
 * returned by hierarchy definitions as a generic node or when the node is just parsed from query results.
 * @beta
 */
export type SourceHierarchyNode<TBase = SourceGenericHierarchyNode | SourceInstanceHierarchyNode> = OmitOverUnion<TBase, "label" | "parentKeys"> & {
  label: string | ConcatenatedValue;
};

/**
 * A kind of `ProcessedGenericHierarchyNode` that has unformatted label and doesn't know about its ancestors.
 * @beta
 */
export type SourceGenericHierarchyNode = SourceHierarchyNode<ProcessedGenericHierarchyNode>;

/**
 * A kind of `ProcessedInstanceHierarchyNode` that has unformatted label and doesn't know about its ancestors.
 * @beta
 */
export type SourceInstanceHierarchyNode = SourceHierarchyNode<ProcessedInstanceHierarchyNode>;

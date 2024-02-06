/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, compareStrings, compareStringsOrUndefined } from "@itwin/core-bentley";
import { ConcatenatedValue } from "./values/ConcatenatedValue";
import { InstanceKey, PrimitiveValue } from "./values/Values";

/**
 * A key for a node that represents one or more ECInstances.
 * @beta
 */
export interface InstancesNodeKey {
  /** Type of the node */
  type: "instances";

  /**
   * Keys of ECInstances that are represented by the node. Generally, one node represents a single
   * ECInstance, but in some cases (e.g. node merging) there could be more.
   */
  instanceKeys: InstanceKey[];
}

/**
 * Contains attributes shared across all grouping node keys.
 * @beta
 */
export interface BaseGroupingNodeKey {
  /**
   * Keys of all instances grouped by this node, including deeply nested under
   * other grouping nodes.
   */
  groupedInstanceKeys: InstanceKey[];
}

/**
 * A key for a class-grouping node.
 * @beta
 */
export interface ClassGroupingNodeKey extends BaseGroupingNodeKey {
  /** Type of the node */
  type: "class-grouping";

  /** Information about the ECClass that this grouping node is grouping by. */
  class: {
    name: string;
    label?: string;
  };
}

/**
 * A key for a label-grouping node.
 * @beta
 */
export interface LabelGroupingNodeKey extends BaseGroupingNodeKey {
  /** Type of the node */
  type: "label-grouping";

  /** Node label that this grouping node is grouping by. */
  label: string;

  /**
   * Optional group identifier that is assigned to the node key when multiple nodes
   * with the same label shouldn't be grouped together.
   */
  groupId?: string;
}

/**
 * A key property grouping node that groups nodes whose values don't fall into any other
 * property group in the hierarchy level.
 *
 * @beta
 */
export interface PropertyOtherValuesGroupingNodeKey extends BaseGroupingNodeKey {
  /** Type of the node */
  type: "property-grouping:other";
}

/**
 * A key for a property grouping node that groups nodes by formatted property value.
 * @beta
 */
export interface PropertyValueGroupingNodeKey extends BaseGroupingNodeKey {
  /** Type of the node */
  type: "property-grouping:value";

  /** Name of the property that is used for grouping nodes. */
  propertyName: string;

  /** Full name of the ECClass containing the property. */
  propertyClassName: string;

  /** Formatted property value that this node is grouping by. */
  formattedPropertyValue: string;
}

/**
 * A key for a property grouping node that groups nodes by a range of property values.
 * @beta
 */
export interface PropertyValueRangeGroupingNodeKey extends BaseGroupingNodeKey {
  /** Type of the node */
  type: "property-grouping:range";

  /** Name of the property that is used for grouping nodes. */
  propertyName: string;

  /** Full name of the ECClass containing the property. */
  propertyClassName: string;

  /** Defines the start of the values' range that this node is grouping by. */
  fromValue: number;

  /** Defines the end of the values' range that this node is grouping by. */
  toValue: number;
}

/**
 * A key for a property grouping node.
 * @beta
 */
export type PropertyGroupingNodeKey = PropertyValueRangeGroupingNodeKey | PropertyValueGroupingNodeKey | PropertyOtherValuesGroupingNodeKey;

/**
 * A key for one of the instance grouping nodes.
 * @beta
 */
export type GroupingNodeKey = ClassGroupingNodeKey | LabelGroupingNodeKey | PropertyGroupingNodeKey;

/**
 * A key for either an instance node or one of the instance grouping nodes.
 * @beta
 */
export type StandardHierarchyNodeKey = InstancesNodeKey | GroupingNodeKey;

/**
 * A key that uniquely identifies a node in a hierarchy level.
 * @beta
 */
export type HierarchyNodeKey = StandardHierarchyNodeKey | string;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNodeKey {
  /** Checks whether the given node key is a custom node key. */
  export function isCustom(key: HierarchyNodeKey): key is string {
    return typeof key === "string";
  }
  /** Checks whether the given node key is a [[StandardHierarchyNodeKey]]. */
  export function isStandard(key: HierarchyNodeKey): key is StandardHierarchyNodeKey {
    return !!(key as StandardHierarchyNodeKey).type;
  }
  /** Checks whether the given node key is an [[InstancesNodeKey]]. */
  export function isInstances(key: HierarchyNodeKey): key is InstancesNodeKey {
    return isStandard(key) && key.type === "instances";
  }
  /** Checks whether the given node key is a [[GroupingNodeKey]]. */
  export function isGrouping(key: HierarchyNodeKey): key is GroupingNodeKey {
    return isStandard(key) && !isInstances(key);
  }
  /** Checks whether the given node key is a [[ClassGroupingNodeKey]]. */
  export function isClassGrouping(key: HierarchyNodeKey): key is ClassGroupingNodeKey {
    return isStandard(key) && key.type === "class-grouping";
  }
  /** Checks whether the given node key is a [[LabelGroupingNodeKey]]. */
  export function isLabelGrouping(key: HierarchyNodeKey): key is LabelGroupingNodeKey {
    return isStandard(key) && key.type === "label-grouping";
  }
  /** Checks whether the given node key is a [[PropertyOtherValuesGroupingNodeKey]]. */
  export function isPropertyOtherValuesGrouping(key: HierarchyNodeKey): key is PropertyOtherValuesGroupingNodeKey {
    return isStandard(key) && key.type === "property-grouping:other";
  }
  /** Checks whether the given node key is a [[PropertyValueRangeGroupingNodeKey]]. */
  export function isPropertyValueRangeGrouping(key: HierarchyNodeKey): key is PropertyValueRangeGroupingNodeKey {
    return isStandard(key) && key.type === "property-grouping:range";
  }
  /** Checks whether the given node key is a [[PropertyValueGroupingNodeKey]]. */
  export function isPropertyValueGrouping(key: HierarchyNodeKey): key is PropertyValueGroupingNodeKey {
    return isStandard(key) && key.type === "property-grouping:value";
  }
  /** Checks whether the two given keys are equal. */
  export function equals(lhs: HierarchyNodeKey, rhs: HierarchyNodeKey): boolean {
    if (typeof lhs !== typeof rhs) {
      return false;
    }
    if (isCustom(lhs)) {
      return lhs === rhs;
    }
    assert(isStandard(rhs));
    if (lhs.type !== rhs.type) {
      return false;
    }
    switch (lhs.type) {
      case "instances": {
        assert(isInstances(rhs));
        return (
          lhs.instanceKeys.length === rhs.instanceKeys.length &&
          lhs.instanceKeys.every((lhsInstanceKey) => rhs.instanceKeys.some((rhsInstanceKey) => InstanceKey.equals(lhsInstanceKey, rhsInstanceKey)))
        );
      }
      case "class-grouping": {
        assert(isClassGrouping(rhs));
        return lhs.class.name === rhs.class.name;
      }
      case "label-grouping": {
        assert(isLabelGrouping(rhs));
        return lhs.label === rhs.label && lhs.groupId === rhs.groupId;
      }
      case "property-grouping:other": {
        return true;
      }
      case "property-grouping:value": {
        assert(isPropertyValueGrouping(rhs));
        return (
          lhs.propertyClassName === rhs.propertyClassName && lhs.propertyName === rhs.propertyName && lhs.formattedPropertyValue === rhs.formattedPropertyValue
        );
      }
      case "property-grouping:range": {
        assert(isPropertyValueRangeGrouping(rhs));
        return (
          lhs.propertyClassName === rhs.propertyClassName &&
          lhs.propertyName === rhs.propertyName &&
          lhs.fromValue === rhs.fromValue &&
          lhs.toValue === rhs.toValue
        );
      }
    }
  }
  /**
   * Compares two given keys.
   * @returns
   *- `0` if they are equal
   *- `negative value` if lhs key is less than rhs key
   *- `positive value` if lhs key is more than rhs key
   */
  export function compare(lhs: HierarchyNodeKey, rhs: HierarchyNodeKey): number {
    if (isCustom(lhs)) {
      if (!isCustom(rhs)) {
        return 1;
      }
      return compareStrings(lhs, rhs);
    }
    if (isCustom(rhs)) {
      return -1;
    }

    const typeCompareResult = compareStrings(lhs.type, rhs.type);
    if (typeCompareResult !== 0) {
      return typeCompareResult;
    }

    switch (lhs.type) {
      case "instances": {
        assert(isInstances(rhs));
        if (lhs.instanceKeys.length !== rhs.instanceKeys.length) {
          return lhs.instanceKeys.length > rhs.instanceKeys.length ? 1 : -1;
        }
        for (let i = 0; i < lhs.instanceKeys.length; ++i) {
          const instanceKeyCompareResult = InstanceKey.compare(lhs.instanceKeys[i], rhs.instanceKeys[i]);
          if (instanceKeyCompareResult !== 0) {
            return instanceKeyCompareResult;
          }
        }
        return 0;
      }
      case "class-grouping": {
        assert(isClassGrouping(rhs));
        return compareStrings(lhs.class.name, rhs.class.name);
      }
      case "label-grouping": {
        assert(isLabelGrouping(rhs));
        const labelCompareResult = compareStrings(lhs.label, rhs.label);
        if (labelCompareResult !== 0) {
          return labelCompareResult;
        }
        return compareStringsOrUndefined(lhs.groupId, rhs.groupId);
      }
      case "property-grouping:other": {
        return 0;
      }
      case "property-grouping:value": {
        assert(isPropertyValueGrouping(rhs));
        const propertyClassNameCompareResult = compareStrings(lhs.propertyClassName, rhs.propertyClassName);
        if (propertyClassNameCompareResult !== 0) {
          return propertyClassNameCompareResult;
        }
        const propertyNameCompareResult = compareStrings(lhs.propertyName, rhs.propertyName);
        if (propertyNameCompareResult !== 0) {
          return propertyNameCompareResult;
        }
        return compareStrings(lhs.formattedPropertyValue, rhs.formattedPropertyValue);
      }
      case "property-grouping:range": {
        assert(isPropertyValueRangeGrouping(rhs));
        const propertyClassNameCompareResult = compareStrings(lhs.propertyClassName, rhs.propertyClassName);
        if (propertyClassNameCompareResult !== 0) {
          return propertyClassNameCompareResult;
        }
        const propertyNameCompareResult = compareStrings(lhs.propertyName, rhs.propertyName);
        if (propertyNameCompareResult !== 0) {
          return propertyNameCompareResult;
        }
        if (lhs.fromValue !== rhs.fromValue) {
          return lhs.fromValue > rhs.fromValue ? 1 : -1;
        }
        return lhs.toValue > rhs.toValue ? 1 : lhs.toValue < rhs.toValue ? -1 : 0;
      }
    }
  }
}

/**
 * A data structure that represents a single hierarchy node.
 * @beta
 */
export interface HierarchyNode {
  /** An identifier to identify the node in its hierarchy level. */
  key: HierarchyNodeKey;
  /** Identifiers of all node ancestors. Can be used to identify a node in the hierarchy. */
  parentKeys: HierarchyNodeKey[];
  /** Node's display label. */
  label: string;
  /** A flag indicating whether the node has children or not. */
  children: boolean;
  /** A flag indicating whether this node should be auto-expanded in the UI. */
  autoExpand?: boolean;
  /**
   * Identifies whether the hierarchy level below this node supports filtering. If not, supplying an instance
   * filter when requesting child hierarchy level will have no effect.
   */
  supportsFiltering?: boolean;
  /** Additional data that may be assigned to this node. */
  extendedData?: { [key: string]: any };
}

/** @beta */
export namespace HierarchyNode {
  /** Checks whether the given node is a custom node */
  export function isCustom<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: string } & (TNode extends ProcessedHierarchyNode ? { processingParams?: HierarchyNodeProcessingParamsBase } : {}) {
    return HierarchyNodeKey.isCustom(node.key);
  }
  /** Checks whether the given node is a standard (iModel content based) node */
  export function isStandard<TNode extends { key: HierarchyNodeKey }>(node: TNode): node is TNode & { key: StandardHierarchyNodeKey } {
    return HierarchyNodeKey.isStandard(node.key);
  }
  /** Checks whether the given node is an ECInstances-based node */
  export function isInstancesNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: InstancesNodeKey } & (TNode extends ProcessedHierarchyNode ? { processingParams?: InstanceHierarchyNodeProcessingParams } : {}) {
    return HierarchyNodeKey.isInstances(node.key);
  }
  /** Checks whether the given node is a grouping node */
  export function isGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: GroupingNodeKey; supportsFiltering?: undefined } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isGrouping(node.key);
  }
  /** Checks whether the given node is a class grouping node */
  export function isClassGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: ClassGroupingNodeKey; supportsFiltering?: undefined } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isClassGrouping(node.key);
  }
  /** Checks whether the given node is a label grouping node */
  export function isLabelGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: LabelGroupingNodeKey; supportsFiltering?: undefined } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isLabelGrouping(node.key);
  }
  /** Checks whether the given node is property grouping node for other values  */
  export function isPropertyOtherValuesGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyOtherValuesGroupingNodeKey } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isPropertyOtherValuesGrouping(node.key);
  }
  /** Checks whether the given node is a property value grouping node */
  export function isPropertyValueGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyValueGroupingNodeKey } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isPropertyValueGrouping(node.key);
  }
  /** Checks whether the given node is a property value range grouping node */
  export function isPropertyValueRangeGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: PropertyValueRangeGroupingNodeKey } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isPropertyValueRangeGrouping(node.key);
  }
}

/**
 * Base processing parameters that apply to every node.
 * @beta
 */
export interface HierarchyNodeProcessingParamsBase {
  /** Indicates if this node should be hidden if it has no child nodes. */
  hideIfNoChildren?: boolean;
  /** Indicates that this node should always be hidden and its children should be loaded in its place. */
  hideInHierarchy?: boolean;
}
/**
 * A data structure for defining nodes' grouping requirements.
 * @beta
 */
export interface HierarchyNodeGroupingParams {
  byLabel?: HierarchyNodeLabelGroupingParams;
  byClass?: boolean | HierarchyNodeGroupingParamsBase;
  byBaseClasses?: HierarchyNodeBaseClassGroupingParams;
  byProperties?: HierarchyNodePropertiesGroupingParams;
}

/**
 * A data structure for defining params specifically used for label grouping.
 * @beta
 */
export interface HierarchyNodeLabelGroupingBaseParams {
  /** Label grouping option that determines whether to group nodes or to merge them. Defaults to "group".*/
  action?: "group" | "merge";
  /** Value that needs to match in order for nodes to be grouped or merged.*/
  groupId?: string;
}

/**
 * A data structure for defining label merging.
 * @beta
 */
export interface HierarchyNodeLabelGroupingMergeParams extends HierarchyNodeLabelGroupingBaseParams {
  action: "merge";
}

/**
 * A data structure for defining label grouping with additional parameters.
 * @beta
 */
export interface HierarchyNodeLabelGroupingGroupParams extends HierarchyNodeLabelGroupingBaseParams, HierarchyNodeGroupingParamsBase {
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
 * Defines possible values for [[BaseGroupingParams.autoExpand]] attribute:
 * - `single-child` - set the grouping node to auto-expand if it groups a single node.
 * - `always` - always set the grouping node to auto-expand.
 * @beta
 */
export type HierarchyNodeAutoExpandProp = "single-child" | "always";

/**
 * A data structure that represents base class grouping.
 * @beta
 */
export interface HierarchyNodeBaseClassGroupingParams extends HierarchyNodeGroupingParamsBase {
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
   * Properties of the specified class, by which the nodes should be grouped.
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
  propertyGroups: Array<HierarchyNodePropertyGroup>;
}

/**
 * A data structure that represents specific properties' grouping params.
 * @beta
 */
export interface HierarchyNodePropertyGroup {
  /** A string indicating the name of the property to group by. */
  propertyName: string;
  /**  Value of the property, which will be used to group the node. */
  propertyValue?: PrimitiveValue;
  /** Ranges are used to group nodes by numeric properties which are within specified bounds. */
  ranges?: Array<HierarchyNodePropertyValueRange>;
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
  /** Defines the range label. Will be used as [[PropertyValueRangeGroupingNode]] node's display label. */
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
 * A custom (not based on data in an iModel) node that has processing parameters.
 * @beta
 */
export type ProcessedCustomHierarchyNode = Omit<HierarchyNode, "key" | "children"> & {
  key: string;
  children?: boolean;
  processingParams?: HierarchyNodeProcessingParamsBase;
};
/**
 * An instances' (based on data in an iModel) node that has processing parameters.
 * @beta
 */
export type ProcessedInstanceHierarchyNode = Omit<HierarchyNode, "key" | "children"> & {
  key: InstancesNodeKey;
  children?: boolean;
  processingParams?: InstanceHierarchyNodeProcessingParams;
};
/**
 * A grouping node that groups either instance nodes or other grouping nodes.
 * @beta
 */
export type ProcessedGroupingHierarchyNode = Omit<HierarchyNode, "key" | "children"> & {
  key: GroupingNodeKey;
  children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode>;
  supportsFiltering?: undefined;
};
/**
 * A [[HierarchyNode]] that may have processing parameters defining whether it should be hidden under some conditions,
 * how it should be grouped, sorted, etc.
 * @beta
 */
export type ProcessedHierarchyNode = ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode | ProcessedGroupingHierarchyNode;

/**
 * A [[ProcessedHierarchyNode]] that has an unformatted label in a form of [[ConcatenatedValue]]. Generally this is
 * returned when the node is just parsed from query results.
 * @beta
 */
export type ParsedHierarchyNode = ParsedCustomHierarchyNode | ParsedInstanceHierarchyNode;
/**
 * A kind of [[ProcessedCustomHierarchyNode]] that has unformatted label and doesn't know about its ancestors.
 * @beta
 */
export type ParsedCustomHierarchyNode = Omit<ProcessedCustomHierarchyNode, "label" | "parentKeys"> & {
  label: string | ConcatenatedValue;
};
/**
 * A kind of [[ProcessedInstanceHierarchyNode]] that has unformatted label and doesn't know about its ancestors.
 * @beta
 */
export type ParsedInstanceHierarchyNode = Omit<ProcessedInstanceHierarchyNode, "label" | "parentKeys"> & {
  label: string | ConcatenatedValue;
};

/**
 * An identifier that can be used to identify either an ECInstance or a custom node.
 *
 * This is different from [[HierarchyNodeKey]] - the key can represent more types of nodes and,
 * in case of [[InstancesNodeKey]], contains information about all instances the node represents.
 * [[HierarchyNodeIdentifier]], on the other hand, is used for matching a node, so it only needs
 * to contain information about a single instance or custom node key.
 *
 * @beta
 */
export type HierarchyNodeIdentifier = InstanceKey | { key: string };

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNodeIdentifier {
  /** Checks whether the given identifier is an instance node identifier */
  export function isInstanceNodeIdentifier(id: HierarchyNodeIdentifier): id is InstanceKey {
    return !!(id as InstanceKey).id;
  }
  /** Checks whether the given identifier is a custom node identifier */
  export function isCustomNodeIdentifier(id: HierarchyNodeIdentifier): id is { key: string } {
    return !!(id as { key: string }).key;
  }
  /** Checks two identifiers for equality */
  export function equal(lhs: HierarchyNodeIdentifier, rhs: HierarchyNodeIdentifier) {
    if (isInstanceNodeIdentifier(lhs) && isInstanceNodeIdentifier(rhs)) {
      return lhs.className === rhs.className && lhs.id === rhs.id;
    }
    if (isCustomNodeIdentifier(lhs) && isCustomNodeIdentifier(rhs)) {
      return lhs.key === rhs.key;
    }
    return false;
  }
}

/**
 * A path of hierarchy node identifiers, typically used to describe a path from root down
 * to specific node deep in the hierarchy.
 *
 * @beta
 */
export type HierarchyNodeIdentifiersPath = HierarchyNodeIdentifier[];

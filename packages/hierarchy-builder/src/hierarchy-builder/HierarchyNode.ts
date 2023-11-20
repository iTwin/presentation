/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { ConcatenatedValue } from "./values/ConcatenatedValue";
import { InstanceKey, PrimitiveValue } from "./values/Values";

/**
 * A key for a node that represents one or more ECInstances.
 * @beta
 */
export interface InstancesNodeKey {
  type: "instances";
  instanceKeys: InstanceKey[];
}

/**
 * A key for a class-grouping node.
 * @beta
 */
export interface ClassGroupingNodeKey {
  type: "class-grouping";
  class: {
    name: string;
    label?: string;
  };
}

/**
 * A key for a label-grouping node.
 * @beta
 */
export interface LabelGroupingNodeKey {
  type: "label-grouping";
  label: string;
}

/**
 * A key for a other-property-grouping node.
 * @beta
 */
export interface OtherPropertyGroupingNodeKey {
  type: "property-grouping:other";
  groupingInfo: {
    propertyName: string;
    fullClassName: string;
  };
}

/**
 * A key for a formatted-property-grouping node.
 * @beta
 */
export interface FormattedPropertyGroupingNodeKey {
  type: "formatted-property-grouping";
  groupingInfo: {
    propertyName: string;
    fullClassName: string;
    formattedPropertyValue: string;
  };
}

/**
 * A key for a ranged-property-grouping node.
 * @beta
 */
export interface RangedPropertyGroupingNodeKey {
  type: "ranged-property-grouping";
  groupingInfo: {
    propertyName: string;
    fullClassName: string;
    fromValue: number;
    toValue: number;
  };
}

/**
 * A key for a property-grouping node.
 * @beta
 */
export type PropertyGroupingNodeKey = RangedPropertyGroupingNodeKey | FormattedPropertyGroupingNodeKey | OtherPropertyGroupingNodeKey;

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
  /** Checks whether the given node key is a [[OtherPropertyGroupingNodeKey]]. */
  export function isOtherPropertyGrouping(key: HierarchyNodeKey): key is OtherPropertyGroupingNodeKey {
    return isStandard(key) && key.type === "other-property-grouping";
  }
  /** Checks whether the given node key is a [[RangedPropertyGroupingNodeKey]]. */
  export function isRangedPropertyGrouping(key: HierarchyNodeKey): key is RangedPropertyGroupingNodeKey {
    return isStandard(key) && key.type === "ranged-property-grouping";
  }
  /** Checks whether the given node key is a [[FormattedPropertyGroupingNodeKey]]. */
  export function isFormattedPropertyGrouping(key: HierarchyNodeKey): key is FormattedPropertyGroupingNodeKey {
    return isStandard(key) && key.type === "formatted-property-grouping";
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
        return lhs.label === rhs.label;
      }
      case "other-property-grouping": {
        assert(isOtherPropertyGrouping(rhs));
        return lhs.groupingInfo.fullClassName === rhs.groupingInfo.fullClassName && lhs.groupingInfo.propertyName === rhs.groupingInfo.propertyName;
      }
      case "formatted-property-grouping": {
        assert(isFormattedPropertyGrouping(rhs));
        return (
          lhs.groupingInfo.fullClassName === rhs.groupingInfo.fullClassName &&
          lhs.groupingInfo.propertyName === rhs.groupingInfo.propertyName &&
          lhs.groupingInfo.formattedPropertyValue === rhs.groupingInfo.formattedPropertyValue
        );
      }
      case "ranged-property-grouping": {
        assert(isRangedPropertyGrouping(rhs));
        return (
          lhs.groupingInfo.fullClassName === rhs.groupingInfo.fullClassName &&
          lhs.groupingInfo.propertyName === rhs.groupingInfo.propertyName &&
          lhs.groupingInfo.fromValue === rhs.groupingInfo.fromValue &&
          lhs.groupingInfo.toValue === rhs.groupingInfo.toValue
        );
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
  /** Additional data that may be assigned to this node. */
  extendedData?: { [key: string]: any };
}

/** @beta */
export namespace HierarchyNode {
  /** Checks whether the given node is a custom node */
  export function isCustom<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: string } & (TNode extends ProcessedHierarchyNode ? { processingParams?: BaseHierarchyNodeProcessingParams } : {}) {
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
  ): node is TNode & { key: GroupingNodeKey } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isGrouping(node.key);
  }
  /** Checks whether the given node is a class grouping node */
  export function isClassGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: ClassGroupingNodeKey } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isClassGrouping(node.key);
  }
  /** Checks whether the given node is a label grouping node */
  export function isLabelGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: LabelGroupingNodeKey } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isLabelGrouping(node.key);
  }
  /** Checks whether the given node is other property grouping node */
  export function isOtherPropertyGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: OtherPropertyGroupingNodeKey } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isOtherPropertyGrouping(node.key);
  }
  /** Checks whether the given node is a formatted property grouping node */
  export function isFormattedPropertyGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: FormattedPropertyGroupingNodeKey } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isFormattedPropertyGrouping(node.key);
  }
  /** Checks whether the given node is a ranged property grouping node */
  export function isRangedPropertyGroupingNode<TNode extends { key: HierarchyNodeKey }>(
    node: TNode,
  ): node is TNode & { key: RangedPropertyGroupingNodeKey } & (TNode extends ProcessedHierarchyNode
      ? { children: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> }
      : {}) {
    return HierarchyNodeKey.isRangedPropertyGrouping(node.key);
  }
}

/**
 * Base processing parameters that apply to every node.
 * @beta
 */
export interface BaseHierarchyNodeProcessingParams {
  /** Indicates if this node should be hidden if it has no child nodes. */
  hideIfNoChildren?: boolean;
  /** Indicates that this node should always be hidden and its children should be loaded in its place. */
  hideInHierarchy?: boolean;
}
/**
 * A data structure for defining nodes' grouping requirements.
 * @beta
 */
export interface GroupingParams {
  byLabel?: boolean | BaseGroupingParams;
  byClass?: boolean | BaseGroupingParams;
  byBaseClasses?: BaseClassGroupingParams;
  byProperties?: PropertiesGroupingParams;
}
/**
 * Grouping parameters that are shared across all types of groupings.
 * @beta
 */
export interface BaseGroupingParams {
  /** Hiding option that determines whether to hide group nodes which have no siblings at the same hierarchy level. */
  hideIfNoSiblings?: boolean;
  /** Hiding option that determines whether to hide group nodes which have only one node as its children. */
  hideIfOneGroupedNode?: boolean;
  /** Option which auto expands grouping nodes' children when it has single child or always. */
  autoExpand?: AutoExpand;
}
/**
 * Defines possible values for [[BaseGroupingParams.autoExpand]] attribute:
 * - `single-child` - set the grouping node to auto-expand if it groups a single node.
 * - `always` - always set the grouping node to auto-expand.
 * @beta
 */
export type AutoExpand = "single-child" | "always";

/**
 * A data structure that represents base class grouping.
 * @beta
 */
export interface BaseClassGroupingParams extends BaseGroupingParams {
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
export interface PropertiesGroupingParams extends BaseGroupingParams {
  /**
   * Full name of class, which should be used to group the node. Only has effect if the node
   * represents an instance of that class.
   *
   * Full class name format: `SchemaName.ClassName`.
   */
  fullClassName: string;
  /**
   * Properties of the specified class, by which the nodes should be grouped. PropertyGroups is an object with the following properties:
   *   - propertyName (required): A string indicating the name of the property to group by.
   *   - propertyValue (required): Value of the property, which will be used to group the node.
   *   - ranges (optional): An array of objects with the following properties:
   *     - fromValue and toValue define the bounds of the range
   *     - rangeLabel (optional): Label for the specific ranges' grouping node.
   *
   * Example usage:
   * ```tsx
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
  propertyGroups: Array<PropertyGroup>;
}

/**
 * A data structure that represents specific property grouping params
 * @beta
 */
export interface PropertyGroup {
  propertyName: string;
  propertyValue: PrimitiveValue;
  ranges?: Array<Range>;
}

/**
 * A data structure that represents boundaries for a value
 * @beta
 */
export interface Range {
  fromValue: number;
  toValue: number;
  rangeLabel?: string;
}

/**
 * Processing parameters that apply to instance nodes.
 * @beta
 */
export interface InstanceHierarchyNodeProcessingParams extends BaseHierarchyNodeProcessingParams {
  grouping?: GroupingParams;
  mergeByLabelId?: string;
}

/**
 * A custom (not based on data in an iModel) node that has processing parameters.
 * @beta
 */
export type ProcessedCustomHierarchyNode = Omit<HierarchyNode, "key" | "children"> & {
  key: string;
  children?: boolean;
  processingParams?: BaseHierarchyNodeProcessingParams;
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
 * A type of [[HierarchyNode]] that doesn't know about its children.
 * @beta
 */
export type ParentHierarchyNode = Omit<HierarchyNode, "children">;

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

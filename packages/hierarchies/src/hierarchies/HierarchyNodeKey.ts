/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, compareStrings, compareStringsOrUndefined } from "@itwin/core-bentley";
import { InstanceKey } from "@itwin/presentation-shared";

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
 * A key for a class-grouping node.
 * @beta
 */
export interface ClassGroupingNodeKey {
  /** Type of the node */
  type: "class-grouping";

  /** Full name of the ECClass that this grouping node is grouping by. */
  className: string;
}

/**
 * A key for a label-grouping node.
 * @beta
 */
export interface LabelGroupingNodeKey {
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
export interface PropertyOtherValuesGroupingNodeKey {
  /** Type of the node */
  type: "property-grouping:other";
  /** Identifiers of properties whose values are grouped under this node. */
  properties: Array<{
    className: string;
    propertyName: string;
  }>;
}

/**
 * A key for a property grouping node that groups nodes by formatted property value.
 * @beta
 */
export interface PropertyValueGroupingNodeKey {
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
export interface PropertyValueRangeGroupingNodeKey {
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

  /** Checks whether the given node key is a `StandardHierarchyNodeKey`. */
  export function isStandard(key: HierarchyNodeKey): key is StandardHierarchyNodeKey {
    return !!(key as StandardHierarchyNodeKey).type;
  }

  /** Checks whether the given node key is an `InstancesNodeKey`. */
  export function isInstances(key: HierarchyNodeKey): key is InstancesNodeKey {
    return isStandard(key) && key.type === "instances";
  }

  /** Checks whether the given node key is a `GroupingNodeKey`. */
  export function isGrouping(key: HierarchyNodeKey): key is GroupingNodeKey {
    return isStandard(key) && !isInstances(key);
  }

  /** Checks whether the given node key is a `ClassGroupingNodeKey`. */
  export function isClassGrouping(key: HierarchyNodeKey): key is ClassGroupingNodeKey {
    return isStandard(key) && key.type === "class-grouping";
  }

  /** Checks whether the given node key is a `LabelGroupingNodeKey`. */
  export function isLabelGrouping(key: HierarchyNodeKey): key is LabelGroupingNodeKey {
    return isStandard(key) && key.type === "label-grouping";
  }

  /** Checks whether the given node key is a `PropertyOtherValuesGroupingNodeKey`. */
  export function isPropertyOtherValuesGrouping(key: HierarchyNodeKey): key is PropertyOtherValuesGroupingNodeKey {
    return isStandard(key) && key.type === "property-grouping:other";
  }

  /** Checks whether the given node key is a `PropertyValueRangeGroupingNodeKey`. */
  export function isPropertyValueRangeGrouping(key: HierarchyNodeKey): key is PropertyValueRangeGroupingNodeKey {
    return isStandard(key) && key.type === "property-grouping:range";
  }

  /** Checks whether the given node key is a `PropertyValueGroupingNodeKey`. */
  export function isPropertyValueGrouping(key: HierarchyNodeKey): key is PropertyValueGroupingNodeKey {
    return isStandard(key) && key.type === "property-grouping:value";
  }

  /** Checks whether the given node key is a `PropertyGroupingNodeKey`. */
  export function isPropertyGrouping(key: HierarchyNodeKey): key is PropertyGroupingNodeKey {
    return isPropertyOtherValuesGrouping(key) || isPropertyValueRangeGrouping(key) || isPropertyValueGrouping(key);
  }

  /**
   * Compares two given keys. Returns:
   * - `0` if they are equal,
   * - `negative value` if lhs key is less than rhs key,
   * - `positive value` if lhs key is more than rhs key.
   */
  export function compare(lhs: HierarchyNodeKey, rhs: HierarchyNodeKey): number {
    if (typeof lhs === "string") {
      if (typeof rhs !== "string") {
        return 1;
      }
      return compareStrings(lhs, rhs);
    }
    if (typeof rhs === "string") {
      return -1;
    }

    const typeCompareResult = compareStrings(lhs.type, rhs.type);
    if (typeCompareResult !== 0) {
      return typeCompareResult;
    }

    switch (lhs.type) {
      case "instances": {
        assert(rhs.type === "instances");
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
        assert(rhs.type === "class-grouping");
        return compareStrings(lhs.className, rhs.className);
      }
      case "label-grouping": {
        assert(rhs.type === "label-grouping");
        const labelCompareResult = compareStrings(lhs.label, rhs.label);
        if (labelCompareResult !== 0) {
          return labelCompareResult;
        }
        return compareStringsOrUndefined(lhs.groupId, rhs.groupId);
      }
      case "property-grouping:other": {
        assert(rhs.type === "property-grouping:other");
        if (lhs.properties.length !== rhs.properties.length) {
          return lhs.properties.length - rhs.properties.length;
        }
        for (let i = 0; i < lhs.properties.length; ++i) {
          const classCompareResult = compareStrings(lhs.properties[i].className, rhs.properties[i].className);
          if (classCompareResult !== 0) {
            return classCompareResult;
          }
          const nameCompareResult = compareStrings(lhs.properties[i].propertyName, rhs.properties[i].propertyName);
          if (nameCompareResult !== 0) {
            return nameCompareResult;
          }
        }
        return 0;
      }
      case "property-grouping:value": {
        assert(rhs.type === "property-grouping:value");
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
        assert(rhs.type === "property-grouping:range");
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

  /** Checks whether the two given keys are equal. */
  export function equals(lhs: HierarchyNodeKey, rhs: HierarchyNodeKey): boolean {
    return compare(lhs, rhs) === 0;
  }
}

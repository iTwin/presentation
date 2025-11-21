/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, compareStrings, compareStringsOrUndefined } from "@itwin/core-bentley";
import { InstanceKey, normalizeFullClassName } from "@itwin/presentation-shared";

/**
 * An instance key that may be associated with specific iModel.
 * @public
 */
export interface IModelInstanceKey extends InstanceKey {
  imodelKey?: string;
}

/**
 * A key for a generic node.
 * @public
 */
export interface GenericNodeKey {
  /** Type of the node */
  type: "generic";

  /**
   * Node key identifier, which uniquely identifies the node within the hierarchy level the node is used.
   * The format of the identifier is not specified and is up to the data source.
   */
  id: string;

  /**
   * Optional data source identifier. Useful when a hierarchy is built using multiple hierarchy providers - in that
   * case each provider can assign a unique source identifier to its nodes.
   */
  source?: string;
}

/**
 * A key for a node that represents one or more ECInstances.
 * @public
 */
export interface InstancesNodeKey {
  /** Type of the node */
  type: "instances";

  /**
   * Keys of ECInstances that are represented by the node. Generally, one node represents a single
   * ECInstance, but in some cases (e.g. node merging) there could be more.
   */
  instanceKeys: IModelInstanceKey[];
}

/**
 * A key for a class-grouping node.
 * @public
 */
export interface ClassGroupingNodeKey {
  /** Type of the node */
  type: "class-grouping";

  /** Full name of the ECClass that this grouping node is grouping by. */
  className: string;
}

/**
 * A key for a label-grouping node.
 * @public
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
 * @public
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
 * @public
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
 * @public
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
 * @public
 */
export type PropertyGroupingNodeKey = PropertyValueRangeGroupingNodeKey | PropertyValueGroupingNodeKey | PropertyOtherValuesGroupingNodeKey;

/**
 * A key for one of the instance grouping nodes.
 * @public
 */
export type GroupingNodeKey = ClassGroupingNodeKey | LabelGroupingNodeKey | PropertyGroupingNodeKey;

/**
 * A key for either an instance node or one of the instance grouping nodes.
 * @public
 */
export type IModelHierarchyNodeKey = InstancesNodeKey | GroupingNodeKey;

/**
 * A key that uniquely identifies a node in a hierarchy level.
 * @public
 */
export type HierarchyNodeKey = IModelHierarchyNodeKey | GenericNodeKey;

/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNodeKey {
  /** Checks whether the given node key is a generic node key. */
  export function isGeneric(key: HierarchyNodeKey): key is GenericNodeKey {
    return key.type === "generic";
  }

  /** Checks whether the given node key is a `StandardHierarchyNodeKey`. */
  export function isIModelNodeKey(key: HierarchyNodeKey): key is IModelHierarchyNodeKey {
    return !isGeneric(key);
  }

  /** Checks whether the given node key is an `InstancesNodeKey`. */
  export function isInstances(key: HierarchyNodeKey): key is InstancesNodeKey {
    return key.type === "instances";
  }

  /** Checks whether the given node key is a `GroupingNodeKey`. */
  export function isGrouping(key: HierarchyNodeKey): key is GroupingNodeKey {
    return !isGeneric(key) && !isInstances(key);
  }

  /** Checks whether the given node key is a `ClassGroupingNodeKey`. */
  export function isClassGrouping(key: HierarchyNodeKey): key is ClassGroupingNodeKey {
    return key.type === "class-grouping";
  }

  /** Checks whether the given node key is a `LabelGroupingNodeKey`. */
  export function isLabelGrouping(key: HierarchyNodeKey): key is LabelGroupingNodeKey {
    return key.type === "label-grouping";
  }

  /** Checks whether the given node key is a `PropertyOtherValuesGroupingNodeKey`. */
  export function isPropertyOtherValuesGrouping(key: HierarchyNodeKey): key is PropertyOtherValuesGroupingNodeKey {
    return key.type === "property-grouping:other";
  }

  /** Checks whether the given node key is a `PropertyValueRangeGroupingNodeKey`. */
  export function isPropertyValueRangeGrouping(key: HierarchyNodeKey): key is PropertyValueRangeGroupingNodeKey {
    return key.type === "property-grouping:range";
  }

  /** Checks whether the given node key is a `PropertyValueGroupingNodeKey`. */
  export function isPropertyValueGrouping(key: HierarchyNodeKey): key is PropertyValueGroupingNodeKey {
    return key.type === "property-grouping:value";
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
    const typeCompareResult = compareStrings(lhs.type, rhs.type);
    if (typeCompareResult !== 0) {
      return typeCompareResult;
    }
    switch (lhs.type) {
      case "generic": {
        assert(rhs.type === "generic");
        const idCompareResult = compareStrings(lhs.id, rhs.id);
        if (idCompareResult !== 0) {
          return idCompareResult;
        }
        return compareStringsOrUndefined(lhs.source, rhs.source);
      }
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
          const imodelKeyCompareResult = compareStringsOrUndefined(lhs.instanceKeys[i].imodelKey, rhs.instanceKeys[i].imodelKey);
          if (imodelKeyCompareResult !== 0) {
            return imodelKeyCompareResult;
          }
        }
        return 0;
      }
      case "class-grouping": {
        assert(rhs.type === "class-grouping");
        return compareStrings(normalizeFullClassName(lhs.className).toLocaleLowerCase(), normalizeFullClassName(rhs.className).toLocaleLowerCase());
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
          const classCompareResult = compareStrings(
            normalizeFullClassName(lhs.properties[i].className).toLocaleLowerCase(),
            normalizeFullClassName(rhs.properties[i].className).toLocaleLowerCase(),
          );
          if (classCompareResult !== 0) {
            return classCompareResult;
          }
          const nameCompareResult = compareStrings(lhs.properties[i].propertyName.toLocaleLowerCase(), rhs.properties[i].propertyName.toLocaleLowerCase());
          if (nameCompareResult !== 0) {
            return nameCompareResult;
          }
        }
        return 0;
      }
      case "property-grouping:value": {
        assert(rhs.type === "property-grouping:value");
        const propertyClassNameCompareResult = compareStrings(
          normalizeFullClassName(lhs.propertyClassName).toLocaleLowerCase(),
          normalizeFullClassName(rhs.propertyClassName).toLocaleLowerCase(),
        );
        if (propertyClassNameCompareResult !== 0) {
          return propertyClassNameCompareResult;
        }
        const propertyNameCompareResult = compareStrings(lhs.propertyName.toLocaleLowerCase(), rhs.propertyName.toLocaleLowerCase());
        if (propertyNameCompareResult !== 0) {
          return propertyNameCompareResult;
        }
        return compareStrings(lhs.formattedPropertyValue, rhs.formattedPropertyValue);
      }
      case "property-grouping:range": {
        assert(rhs.type === "property-grouping:range");
        const propertyClassNameCompareResult = compareStrings(
          normalizeFullClassName(lhs.propertyClassName).toLocaleLowerCase(),
          normalizeFullClassName(rhs.propertyClassName).toLocaleLowerCase(),
        );
        if (propertyClassNameCompareResult !== 0) {
          return propertyClassNameCompareResult;
        }
        const propertyNameCompareResult = compareStrings(lhs.propertyName.toLocaleLowerCase(), rhs.propertyName.toLocaleLowerCase());
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

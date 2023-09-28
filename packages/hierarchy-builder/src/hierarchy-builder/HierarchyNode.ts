/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ClassInfo, InstanceKey } from "./EC";

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
  class: ClassInfo;
}

/**
 * A key for either an instance node or one of the instance grouping nodes.
 * @beta
 */
export type StandardHierarchyNodeKey = InstancesNodeKey | ClassGroupingNodeKey;

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
  /** Checks whether the given node key is a [[ClassGroupingNodeKey]]. */
  export function isClassGrouping(key: HierarchyNodeKey): key is ClassGroupingNodeKey {
    return isStandard(key) && key.type === "class-grouping";
  }
}

/** @beta */
export interface HierarchyNodeHandlingParams {
  hideIfNoChildren?: boolean;
  hideInHierarchy?: boolean;
  groupByClass?: boolean;
  mergeByLabelId?: string;
}

/**
 * A data structure that represents a single hierarchy node.
 * @beta
 */
export interface HierarchyNode {
  key: HierarchyNodeKey;
  label: string;
  extendedData?: { [key: string]: any };
  children: undefined | boolean | Array<HierarchyNode>;
  autoExpand?: boolean;
  params?: HierarchyNodeHandlingParams;
}

/** @beta */
export namespace HierarchyNode {
  /** Checks whether the given node is a custom node */
  export function isCustom<TNode extends HierarchyNode>(node: TNode): node is TNode & { key: string } {
    return HierarchyNodeKey.isCustom(node.key);
  }
  /** Checks whether the given node is a standard (iModel content based) node */
  export function isStandard<TNode extends HierarchyNode>(node: TNode): node is TNode & { key: StandardHierarchyNodeKey } {
    return HierarchyNodeKey.isStandard(node.key);
  }
  /** Checks whether the given node is an ECInstances-based node */
  export function isInstancesNode<TNode extends HierarchyNode>(node: TNode): node is TNode & { key: InstancesNodeKey } {
    return HierarchyNodeKey.isInstances(node.key);
  }
  /** Checks whether the given node is a class grouping node */
  export function isClassGroupingNode<TNode extends HierarchyNode>(node: TNode): node is TNode & { key: ClassGroupingNodeKey } {
    return HierarchyNodeKey.isClassGrouping(node.key);
  }
}

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

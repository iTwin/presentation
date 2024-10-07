/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { InstanceKey } from "@itwin/presentation-shared";
import { GenericNodeKey, IModelInstanceKey } from "./HierarchyNodeKey";
import { compareStrings, compareStringsOrUndefined } from "@itwin/core-bentley";

/**
 * An identifier that can be used to identify either an ECInstance or a generic node.
 *
 * This is different from `HierarchyNodeKey` - the key can represent more types of nodes and,
 * in case of `InstancesNodeKey`, contains information about all instances the node represents.
 * `HierarchyNodeIdentifier`, on the other hand, is used for matching a node, so it only needs
 * to contain information about a single instance.
 *
 * @beta
 */
export type HierarchyNodeIdentifier = IModelInstanceKey | GenericNodeKey;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNodeIdentifier {
  /** Checks whether the given identifier is an instance node identifier */
  export function isInstanceNodeIdentifier(id: HierarchyNodeIdentifier): id is IModelInstanceKey {
    return "className" in id;
  }

  /** Checks whether the given identifier is a generic node identifier */
  export function isGenericNodeIdentifier(id: HierarchyNodeIdentifier): id is GenericNodeKey {
    return !isInstanceNodeIdentifier(id);
  }

  /** Checks two identifiers for equality */
  export function equal(lhs: HierarchyNodeIdentifier, rhs: HierarchyNodeIdentifier) {
    if (isInstanceNodeIdentifier(lhs) && isInstanceNodeIdentifier(rhs)) {
      return InstanceKey.equals(lhs, rhs) && lhs.imodelKey === rhs.imodelKey;
    }
    if (isGenericNodeIdentifier(lhs) && isGenericNodeIdentifier(rhs)) {
      return lhs.source === rhs.source && lhs.id === rhs.id;
    }
    return false;
  }

  /**
   * Compares two given identifiers. Returns:
   * - `0` if they are equal,
   * - `negative value` if lhs identifiers is less than rhs identifiers,
   * - `positive value` if lhs identifiers is more than rhs identifiers.
   */
  export function compare(lhs: HierarchyNodeIdentifier, rhs: HierarchyNodeIdentifier): number {
    if (isInstanceNodeIdentifier(lhs)) {
      if (!isInstanceNodeIdentifier(rhs)) {
        return -1;
      }

      const imodelKeyCompareResult = compareStringsOrUndefined(lhs.imodelKey, rhs.imodelKey);

      return imodelKeyCompareResult !== 0 ? imodelKeyCompareResult : InstanceKey.compare(lhs, rhs);
    }
    if (isInstanceNodeIdentifier(rhs)) {
      return 1;
    }

    const sourceCompareResult = compareStringsOrUndefined(lhs.source, rhs.source);

    return sourceCompareResult !== 0 ? sourceCompareResult : compareStrings(lhs.id, rhs.id);
  }
}

/**
 * A path of hierarchy node identifiers, typically used to describe a path from root down
 * to specific node deep in the hierarchy.
 *
 * @beta
 */
export type HierarchyNodeIdentifiersPath = HierarchyNodeIdentifier[];

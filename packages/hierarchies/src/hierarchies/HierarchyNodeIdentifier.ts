/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { compareStrings, compareStringsOrUndefined } from "@itwin/core-bentley";
import { InstanceKey } from "@itwin/presentation-shared";

import type { GenericNodeKey, IModelInstanceKey } from "./HierarchyNodeKey.js";

/**
 * An identifier that can be used to identify either an ECInstance or a generic node.
 *
 * This is different from `HierarchyNodeKey` - the key can represent more types of nodes and,
 * in case of `InstancesNodeKey`, contains information about all instances the node represents.
 * `HierarchyNodeIdentifier`, on the other hand, is used for matching a node, so it only needs
 * to contain information about a single instance.
 *
 * @public
 */
export type HierarchyNodeIdentifier = IModelInstanceKey | GenericNodeKey;

/** @public */
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
    return compare(lhs, rhs) === 0;
  }

  /** Compares two identifiers */
  export function compare(lhs: HierarchyNodeIdentifier, rhs: HierarchyNodeIdentifier): number {
    if (HierarchyNodeIdentifier.isGenericNodeIdentifier(lhs)) {
      if (HierarchyNodeIdentifier.isGenericNodeIdentifier(rhs)) {
        const sourceCompareResult = compareStringsOrUndefined(lhs.source, rhs.source);
        if (sourceCompareResult !== 0) {
          return sourceCompareResult;
        }
        return compareStrings(lhs.id, rhs.id);
      }
      return -1;
    }
    if (HierarchyNodeIdentifier.isInstanceNodeIdentifier(rhs)) {
      const imodelKeyCompareResult = compareStringsOrUndefined(lhs.imodelKey, rhs.imodelKey);
      if (imodelKeyCompareResult !== 0) {
        return imodelKeyCompareResult;
      }
      return InstanceKey.compare(lhs, rhs);
    }
    return 1;
  }
}

/**
 * A path of hierarchy node identifiers, typically used to describe a path from root down
 * to specific node deep in the hierarchy.
 *
 * @public
 */
export type HierarchyNodeIdentifiersPath = HierarchyNodeIdentifier[];

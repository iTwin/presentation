/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { mergeAll, Observable, tap, toArray } from "rxjs";
import { HierarchyNode, ProcessedHierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace } from "../Common";

const OPERATOR_NAME = "PersistChildren";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createPersistChildrenOperator(parentNode: HierarchyNode) {
  return function (childNodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    if (Array.isArray(parentNode.children)) {
      return childNodes;
    }
    return childNodes.pipe(
      toArray(),
      tap((list) => {
        if (Object.isExtensible(parentNode)) {
          parentNode.children = list;
          doLog(`persisted node ${parentNode.label} children`);
        } else {
          doLog(`node ${parentNode.label} not extensible for setting children`);
        }
      }),
      mergeAll(),
    );
  };
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

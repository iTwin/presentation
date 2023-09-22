/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { mergeAll, Observable, reduce, tap } from "rxjs";

import { HierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace } from "../Common";

const OPERATOR_NAME = "PersistChildren";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createPersistChildrenOperator(parentNode: HierarchyNode) {
  return function (childNodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    if (Array.isArray(parentNode.children)) {
      return childNodes;
    }
    return childNodes.pipe(
      reduce((acc, childNode) => [...acc, childNode], new Array<HierarchyNode>()),
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

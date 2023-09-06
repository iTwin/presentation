/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { map, Observable } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";

/** @internal */
export function supplyIconsOperator(nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
  return nodes.pipe(
    map((node) => {
      if (node.key.type !== "class-grouping") {
        return node;
      }
      return { ...node, extendedData: { ...node.extendedData, imageId: "icon-ec-class" } };
    }),
  );
}

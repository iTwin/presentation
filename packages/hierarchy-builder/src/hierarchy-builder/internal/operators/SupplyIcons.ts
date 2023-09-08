/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { map, Observable } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";

/**
 * This is only needed to handle class grouping node icons specifically for the Models Tree case
 * and should get removed ASAP. The real solution should allow assigning a class grouping node icon
 * when setting up class grouping.
 *
 * @internal
 */
export function supplyIconsOperator(nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
  return nodes.pipe(
    map((node) => {
      if (HierarchyNode.isStandard(node) && node.key.type !== "class-grouping") {
        return node;
      }
      return { ...node, extendedData: { ...node.extendedData, imageId: "icon-ec-class" } };
    }),
  );
}

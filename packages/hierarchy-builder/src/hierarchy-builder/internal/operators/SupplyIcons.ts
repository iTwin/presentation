/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { map, Observable } from "rxjs";
import { TreeNode } from "../../TreeNode";

/** @internal */
export function supplyIconsReducer(nodes: Observable<TreeNode>): Observable<TreeNode> {
  return nodes.pipe(
    map((node) => {
      if (node.key.type !== "class-grouping") {
        return node;
      }
      return { ...node, extendedData: { ...node.extendedData, imageId: "icon-ec-class" } };
    }),
  );
}

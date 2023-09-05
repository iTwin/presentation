/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import { InstanceKey } from "../hierarchy-builder/EC";
import { InProgressTreeNode } from "../hierarchy-builder/internal/Common";

export async function getObservableResult<T>(obs: Observable<T>): Promise<Array<T>> {
  const arr = new Array<T>();
  return new Promise((resolve, reject) => {
    obs.subscribe({
      next(item: T) {
        arr.push(item);
      },
      complete() {
        resolve(arr);
      },
      error(reason) {
        reject(reason);
      },
    });
  });
}

export function createTestNode(src?: Partial<InProgressTreeNode>): InProgressTreeNode {
  return {
    label: "test",
    key: {
      type: "instances",
      instanceKeys: [],
    },
    children: undefined,
    ...src,
  };
}

export function createTestInstanceKey(src?: Partial<InstanceKey>): InstanceKey {
  return {
    className: "TestSchema:TestClass",
    id: "0x1",
    ...src,
  };
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, ObservableInput } from "rxjs";

export async function collect<T>(obs: ObservableInput<T>): Promise<Array<T>> {
  const arr = new Array<T>();
  return new Promise((resolve, reject) => {
    from(obs).subscribe({
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

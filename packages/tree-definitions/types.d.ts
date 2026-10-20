/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { Id64String } from "@itwin/core-bentley";
import type { ReadonlyId64Arg } from "./src/tree-definitions/shared/Types.js";

// Remove after https://github.com/iTwin/itwinjs-core/pull/9846 is merged, released and consumed (should be with core-bentley 5.15.0).
declare module "@itwin/core-bentley" {
  namespace Id64 {
    export function iterable(ids: ReadonlyId64Arg): Iterable<Id64String> {
      return typeof ids === "string" ? [ids] : ids;
    }
  }
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe } from "vitest";
import { runSingleClassItemsTest } from "./SingleClassItems.js";

describe("Content items", () => {
  // Full iteration exposes repeated work per page, including default model and category label loading;
  // first-page timing separates latency from full iteration.
  runSingleClassItemsTest({ sorted: false, scope: "first page" });
  runSingleClassItemsTest({ sorted: false, scope: "all items" });
});

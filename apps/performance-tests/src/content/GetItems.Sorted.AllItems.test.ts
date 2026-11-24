/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe } from "vitest";
import { runSingleClassItemsTest } from "./SingleClassItems.js";

describe("Content items", () => {
  runSingleClassItemsTest({ sorted: true, scope: "all items" });
});

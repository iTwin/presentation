/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { getLogger, setLogger } from "../hierarchies/Logging.js";

import type { ILogger } from "@itwin/presentation-shared";

describe("getLogger", () => {
  it("returns custom logger", () => {
    const logger = {} as unknown as ILogger;
    setLogger(logger);
    expect(getLogger()).toBe(logger);
  });
});

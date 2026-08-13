/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { ILogger } from "@itwin/presentation-shared";
import { getLogger, setLogger } from "../hierarchies/Logging.js";

describe("getLogger", () => {
  it("returns custom logger", () => {
    const logger = {} as unknown as ILogger;
    setLogger(logger);
    expect(getLogger()).toBe(logger);
  });
});

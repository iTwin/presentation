/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { getLogger, ILogger, setLogger } from "../hierarchies/Logging";

describe("getLogger", () => {
  it("returns custom logger", () => {
    const logger = {} as unknown as ILogger;
    setLogger(logger);
    expect(getLogger()).to.eq(logger);
  });
});

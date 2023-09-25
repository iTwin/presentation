/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { Logger } from "@itwin/core-bentley";
import { createLogger } from "../core-interop/Logging";

describe("createLogger", () => {
  it("logs messages using core `Logger`", async () => {
    const spies = {
      error: sinon.spy(Logger, "logError"),
      warn: sinon.spy(Logger, "logWarning"),
      info: sinon.spy(Logger, "logInfo"),
      trace: sinon.spy(Logger, "logTrace"),
    };
    const logger = createLogger();

    logger.logError("c1", "m1");
    logger.logWarning("c2", "m2");
    logger.logInfo("c3", "m3");
    logger.logTrace("c4", "m4");

    expect(spies.error).to.be.calledOnceWithExactly("c1", "m1");
    expect(spies.warn).to.be.calledOnceWithExactly("c2", "m2");
    expect(spies.info).to.be.calledOnceWithExactly("c3", "m3");
    expect(spies.trace).to.be.calledOnceWithExactly("c4", "m4");
  });
});

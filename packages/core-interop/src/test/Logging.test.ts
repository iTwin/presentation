/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { createLogger } from "../core-interop/Logging";

describe("createLogger", () => {
  it("checks error severity using core `Logger`", async () => {
    const spy = sinon.stub(Logger, "isEnabled").returns(true);
    const logger = createLogger();
    expect(logger.isEnabled("test category", "error")).to.be.true;
    expect(spy).to.be.calledOnceWith("test category", LogLevel.Error);
  });

  it("checks warning severity using core `Logger`", async () => {
    const spy = sinon.stub(Logger, "isEnabled").returns(true);
    const logger = createLogger();
    expect(logger.isEnabled("test category", "warning")).to.be.true;
    expect(spy).to.be.calledOnceWith("test category", LogLevel.Warning);
  });

  it("checks info severity using core `Logger`", async () => {
    const spy = sinon.stub(Logger, "isEnabled").returns(true);
    const logger = createLogger();
    expect(logger.isEnabled("test category", "info")).to.be.true;
    expect(spy).to.be.calledOnceWith("test category", LogLevel.Info);
  });

  it("checks trace severity using core `Logger`", async () => {
    const spy = sinon.stub(Logger, "isEnabled").returns(true);
    const logger = createLogger();
    expect(logger.isEnabled("test category", "trace")).to.be.true;
    expect(spy).to.be.calledOnceWith("test category", LogLevel.Trace);
  });

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

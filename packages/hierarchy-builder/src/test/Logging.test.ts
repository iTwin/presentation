/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { getLogger, ILogger, setLogger } from "../hierarchy-builder/Logging";

describe("getLogger", () => {
  it("returns console logger by default", () => {
    setLogger(undefined);
    const logger = getLogger();
    const spies = {
      error: sinon.stub(console, "error"),
      warn: sinon.stub(console, "warn"),
      info: sinon.stub(console, "info"),
      trace: sinon.stub(console, "log"),
    };

    logger.logError("c1", "m1");
    logger.logWarning("c2", "m2");
    logger.logInfo("c3", "m3");
    logger.logTrace("c4", "m4");

    expect(spies.error).to.be.calledOnceWithExactly("[c1] m1");
    expect(spies.warn).to.be.calledOnceWithExactly("[c2] m2");
    expect(spies.info).to.be.calledOnceWithExactly("[c3] m3");
    expect(spies.trace).to.be.calledOnceWithExactly("[c4] m4");
  });

  it("returns custom logger", () => {
    const logger = {} as unknown as ILogger;
    setLogger(logger);
    expect(getLogger()).to.eq(logger);
  });
});

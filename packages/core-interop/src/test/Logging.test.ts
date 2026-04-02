/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { createLogger } from "../core-interop/Logging.js";

describe("createLogger", () => {
  it("checks error severity using core `Logger`", async () => {
    const spy = vi.spyOn(Logger, "isEnabled").mockReturnValue(true);
    const logger = createLogger(Logger);
    expect(logger.isEnabled("test category", "error")).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("test category", LogLevel.Error);
  });

  it("checks warning severity using core `Logger`", async () => {
    const spy = vi.spyOn(Logger, "isEnabled").mockReturnValue(true);
    const logger = createLogger(Logger);
    expect(logger.isEnabled("test category", "warning")).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("test category", LogLevel.Warning);
  });

  it("checks info severity using core `Logger`", async () => {
    const spy = vi.spyOn(Logger, "isEnabled").mockReturnValue(true);
    const logger = createLogger(Logger);
    expect(logger.isEnabled("test category", "info")).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("test category", LogLevel.Info);
  });

  it("checks trace severity using core `Logger`", async () => {
    const spy = vi.spyOn(Logger, "isEnabled").mockReturnValue(true);
    const logger = createLogger(Logger);
    expect(logger.isEnabled("test category", "trace")).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("test category", LogLevel.Trace);
  });

  it("logs messages using core `Logger`", async () => {
    const spies = {
      error: vi.spyOn(Logger, "logError"),
      warn: vi.spyOn(Logger, "logWarning"),
      info: vi.spyOn(Logger, "logInfo"),
      trace: vi.spyOn(Logger, "logTrace"),
    };
    const logger = createLogger(Logger);

    logger.logError("c1", "m1");
    logger.logWarning("c2", "m2");
    logger.logInfo("c3", "m3");
    logger.logTrace("c4", "m4");

    expect(spies.error).toHaveBeenCalledOnce();
    expect(spies.error).toHaveBeenCalledWith("c1", "m1");
    expect(spies.warn).toHaveBeenCalledOnce();
    expect(spies.warn).toHaveBeenCalledWith("c2", "m2");
    expect(spies.info).toHaveBeenCalledOnce();
    expect(spies.info).toHaveBeenCalledWith("c3", "m3");
    expect(spies.trace).toHaveBeenCalledOnce();
    expect(spies.trace).toHaveBeenCalledWith("c4", "m4");
  });
});

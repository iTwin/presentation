/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { ILogger, LogLevel } from "@itwin/presentation-shared";
import { doLog, log } from "../../hierarchies/internal/LoggingUtils.js";
import { setLogger } from "../../hierarchies/Logging.js";

describe("LoggingUtils", () => {
  let logger: { [K in keyof ILogger]: ILogger[K] extends (...args: any[]) => any ? Mock : ILogger[K] };
  beforeEach(() => {
    logger = {
      isEnabled: vi.fn(),
      logError: vi.fn(),
      logWarning: vi.fn(),
      logInfo: vi.fn(),
      logTrace: vi.fn(),
    };
    setLogger(logger as unknown as ILogger);
  });

  afterEach(() => {
    setLogger(undefined);
  });

  describe("doLog", () => {
    const severities: LogLevel[] = ["error", "warning", "info", "trace"];

    it("doesn't call log func if severity is disabled", () => {
      logger.isEnabled.mockReturnValue(false);
      const messageFunc = vi.fn().mockReturnValue("test message");

      severities.forEach((severity) => doLog({ category: "test category", message: messageFunc, severity }));

      expect(logger.isEnabled.mock.calls.length).toBe(4);
      severities.forEach((severity) => expect(logger.isEnabled).toHaveBeenCalledWith("test category", severity));

      expect(messageFunc).not.toHaveBeenCalled();
      expect(logger.logError).not.toHaveBeenCalled();
      expect(logger.logWarning).not.toHaveBeenCalled();
      expect(logger.logInfo).not.toHaveBeenCalled();
      expect(logger.logTrace).not.toHaveBeenCalled();
    });

    it("calls error log func", () => {
      logger.isEnabled.mockReturnValue(true);
      const messageFunc = vi.fn().mockReturnValue("test message");

      doLog({ category: "test category", message: messageFunc, severity: "error" });

      expect(logger.isEnabled).toHaveBeenCalledExactlyOnceWith("test category", "error");
      expect(messageFunc).toHaveBeenCalledOnce();
      expect(logger.logError).toHaveBeenCalledExactlyOnceWith("test category", "test message");
    });

    it("calls warning log func", () => {
      logger.isEnabled.mockReturnValue(true);
      const messageFunc = vi.fn().mockReturnValue("test message");

      doLog({ category: "test category", message: messageFunc, severity: "warning" });

      expect(logger.isEnabled).toHaveBeenCalledExactlyOnceWith("test category", "warning");
      expect(messageFunc).toHaveBeenCalledOnce();
      expect(logger.logWarning).toHaveBeenCalledExactlyOnceWith("test category", "test message");
    });

    it("calls info log func", () => {
      logger.isEnabled.mockReturnValue(true);
      const messageFunc = vi.fn().mockReturnValue("test message");

      doLog({ category: "test category", message: messageFunc, severity: "info" });

      expect(logger.isEnabled).toHaveBeenCalledExactlyOnceWith("test category", "info");
      expect(messageFunc).toHaveBeenCalledOnce();
      expect(logger.logInfo).toHaveBeenCalledExactlyOnceWith("test category", "test message");
    });

    it("calls trace log func", () => {
      logger.isEnabled.mockReturnValue(true);
      const messageFunc = vi.fn().mockReturnValue("test message");

      doLog({ category: "test category", message: messageFunc, severity: "trace" });

      expect(logger.isEnabled).toHaveBeenCalledExactlyOnceWith("test category", "trace");
      expect(messageFunc).toHaveBeenCalledOnce();
      expect(logger.logTrace).toHaveBeenCalledExactlyOnceWith("test category", "test message");
    });

    it("calls trace log func when no severity is provided", () => {
      logger.isEnabled.mockReturnValue(true);
      const messageFunc = vi.fn().mockReturnValue("test message");

      doLog({ category: "test category", message: messageFunc });

      expect(logger.isEnabled).toHaveBeenCalledExactlyOnceWith("test category", "trace");
      expect(messageFunc).toHaveBeenCalledOnce();
      expect(logger.logTrace).toHaveBeenCalledExactlyOnceWith("test category", "test message");
    });
  });

  describe("log", () => {
    it("calls logger function with correct arguments", () => {
      logger.isEnabled.mockReturnValue(true);
      const messageFunc = vi.fn().mockReturnValue("test message");
      const input = {};
      of(input)
        .pipe(log({ category: "test category", message: messageFunc, severity: "info" }))
        .subscribe();
      expect(messageFunc).toHaveBeenCalledExactlyOnceWith(input);
      expect(logger.logInfo).toHaveBeenCalledExactlyOnceWith("test category", "test message");
    });
  });
});

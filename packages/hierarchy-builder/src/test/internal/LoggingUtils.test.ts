/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { of } from "rxjs";
import sinon from "sinon";
import { doLog, log } from "../../hierarchy-builder/internal/LoggingUtils";
import { ILogger, LogLevel, setLogger } from "../../hierarchy-builder/Logging";

describe("LoggingUtils", () => {
  let logger: sinon.SinonStubbedInstance<ILogger>;
  beforeEach(() => {
    logger = {
      isEnabled: sinon.stub(),
      logError: sinon.stub(),
      logWarning: sinon.stub(),
      logInfo: sinon.stub(),
      logTrace: sinon.stub(),
    };
    setLogger(logger);
  });

  afterEach(() => {
    sinon.restore();
    setLogger(undefined);
  });

  describe("doLog", () => {
    const severities: LogLevel[] = ["error", "warning", "info", "trace"];

    it("doesn't call log func if severity is disabled", () => {
      logger.isEnabled.returns(false);
      const messageFunc = sinon.stub().returns("test message");

      severities.forEach((severity) => doLog({ category: "test category", message: messageFunc, severity }));

      expect(logger.isEnabled.callCount).to.eq(4);
      severities.forEach((severity) => expect(logger.isEnabled).to.be.calledWith("test category", severity));

      expect(messageFunc).to.not.be.called;
      expect(logger.logError).to.not.be.called;
      expect(logger.logWarning).to.not.be.called;
      expect(logger.logInfo).to.not.be.called;
      expect(logger.logTrace).to.not.be.called;
    });

    it("calls error log func", () => {
      logger.isEnabled.returns(true);
      const messageFunc = sinon.stub().returns("test message");

      doLog({ category: "test category", message: messageFunc, severity: "error" });

      expect(logger.isEnabled).to.be.calledOnceWith("test category", "error");
      expect(messageFunc).to.be.calledOnce;
      expect(logger.logError).to.be.calledOnceWith("test category", "test message");
    });

    it("calls warning log func", () => {
      logger.isEnabled.returns(true);
      const messageFunc = sinon.stub().returns("test message");

      doLog({ category: "test category", message: messageFunc, severity: "warning" });

      expect(logger.isEnabled).to.be.calledOnceWith("test category", "warning");
      expect(messageFunc).to.be.calledOnce;
      expect(logger.logWarning).to.be.calledOnceWith("test category", "test message");
    });

    it("calls info log func", () => {
      logger.isEnabled.returns(true);
      const messageFunc = sinon.stub().returns("test message");

      doLog({ category: "test category", message: messageFunc, severity: "info" });

      expect(logger.isEnabled).to.be.calledOnceWith("test category", "info");
      expect(messageFunc).to.be.calledOnce;
      expect(logger.logInfo).to.be.calledOnceWith("test category", "test message");
    });

    it("calls trace log func", () => {
      logger.isEnabled.returns(true);
      const messageFunc = sinon.stub().returns("test message");

      doLog({ category: "test category", message: messageFunc, severity: "trace" });

      expect(logger.isEnabled).to.be.calledOnceWith("test category", "trace");
      expect(messageFunc).to.be.calledOnce;
      expect(logger.logTrace).to.be.calledOnceWith("test category", "test message");
    });

    it("calls trace log func when no severity is provided", () => {
      logger.isEnabled.returns(true);
      const messageFunc = sinon.stub().returns("test message");

      doLog({ category: "test category", message: messageFunc });

      expect(logger.isEnabled).to.be.calledOnceWith("test category", "trace");
      expect(messageFunc).to.be.calledOnce;
      expect(logger.logTrace).to.be.calledOnceWith("test category", "test message");
    });
  });

  describe("log", () => {
    it("calls logger function with correct arguments", () => {
      logger.isEnabled.returns(true);
      const messageFunc = sinon.stub().returns("test message");
      const input = {};
      of(input)
        .pipe(log({ category: "test category", message: messageFunc, severity: "info" }))
        .subscribe();
      expect(messageFunc).to.be.calledOnceWith(input);
      expect(logger.logInfo).to.be.calledOnceWith("test category", "test message");
    });
  });
});

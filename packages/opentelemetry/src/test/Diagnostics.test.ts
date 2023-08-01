/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { context, Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { exportDiagnostics } from "../presentation-opentelemetry/Diagnostics";

describe("exportDiagnostics", () => {
  interface TestSpanContext {
    parentSpanName?: string;
  }

  const startActiveSpanStub = sinon.stub<any[], Span>();
  const spanStub: Span = {
    addEvent: sinon.stub(),
    end: sinon.stub(),
    isRecording: sinon.stub(),
    recordException: sinon.stub(),
    setAttribute: sinon.stub(),
    setAttributes: sinon.stub(),
    setStatus: sinon.stub(),
    spanContext: sinon.stub(),
    updateName: sinon.stub(),
  };
  let currentSpanContext: TestSpanContext;

  before(() => {
    sinon.stub(context, "active").callsFake(() => currentSpanContext as any);
    sinon.stub(trace, "getTracer").returns({
      startActiveSpan: startActiveSpanStub,
      startSpan: sinon.stub(),
    });
    startActiveSpanStub.callsFake((spanName: string, _spanAttributes: Object, _ctx: TestSpanContext, cb: (span: Span) => Span) => {
      currentSpanContext = { parentSpanName: spanName };
      return cb(spanStub);
    });
  });

  beforeEach(() => {
    currentSpanContext = { parentSpanName: undefined };
  });

  afterEach(() => {
    sinon.resetHistory();
  });

  it("does nothing if there are no diagnostics", () => {
    exportDiagnostics({}, context.active());
    expect(startActiveSpanStub).to.not.be.called;

    exportDiagnostics({ logs: [] }, context.active());
    expect(startActiveSpanStub).to.not.be.called;
  });

  it("does nothing when `duration` not set", () => {
    exportDiagnostics(
      {
        logs: [{ scope: "test scope 1", scopeCreateTimestamp: 12345 }],
      },
      context.active(),
    );
    expect(startActiveSpanStub).to.not.be.called;
  });

  it("does nothing when `scopeCreateTimestamp` not set", () => {
    exportDiagnostics(
      {
        logs: [{ scope: "test scope 1", duration: 100 }],
      },
      context.active(),
    );
    expect(startActiveSpanStub).to.not.be.called;
  });

  it("exports logs as spans", () => {
    const ctx = context.active();
    exportDiagnostics(
      {
        logs: [{ scope: "test scope", scopeCreateTimestamp: 12345, duration: 1111 }],
      },
      ctx,
    );
    expect(startActiveSpanStub).to.be.calledOnceWith(
      "test scope",
      {
        kind: SpanKind.INTERNAL,
        attributes: {},
        startTime: [12, 345000000],
      },
      ctx,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(spanStub.end).to.be.calledOnceWith([13, 456000000]);
  });

  it("exports spans with attributes", () => {
    const ctx = context.active();
    exportDiagnostics(
      {
        logs: [
          {
            scope: "test scope",
            scopeCreateTimestamp: 12345,
            duration: 2222,
            attributes: {
              stringAttribute: "stringAttributeValue",
              stringArrayAttribute: ["value1", "value2"],
            },
          },
        ],
      },
      ctx,
    );
    expect(startActiveSpanStub).to.be.calledOnceWith(
      "test scope",
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          stringAttribute: "stringAttributeValue",
          stringArrayAttribute: ["value1", "value2"],
        },
        startTime: [12, 345000000],
      },
      ctx,
    );
  });

  it("exports spans with events", () => {
    const ctx = context.active();
    exportDiagnostics(
      {
        logs: [
          {
            scope: "test scope",
            scopeCreateTimestamp: 12345,
            duration: 1111,
            logs: [{ severity: { dev: "error", editor: "info" }, message: "test message", category: "test category", timestamp: 12350 }],
          },
        ],
      },
      ctx,
    );
    expect(startActiveSpanStub).to.be.calledOnceWith(
      "test scope",
      {
        kind: SpanKind.INTERNAL,
        attributes: {},
        startTime: [12, 345000000],
      },
      ctx,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(spanStub.addEvent).to.be.calledOnceWith(
      "test message",
      {
        devSeverity: "error",
        editorSeverity: "info",
        category: "test category",
      },
      [12, 350000000],
    );
  });

  it("doesn't set span status when logs don't contain errors", () => {
    const ctx = context.active();
    exportDiagnostics(
      {
        logs: [
          {
            scope: "test scope",
            scopeCreateTimestamp: 12345,
            duration: 1111,
            logs: [
              {
                severity: { dev: "info", editor: "error" },
                message: "editor error",
                category: "test category 1",
                timestamp: 12350,
              },
            ],
          },
        ],
      },
      ctx,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(spanStub.setStatus).to.not.be.called;
  });

  it("sets span status to 'error' when logs contain errors", () => {
    const ctx = context.active();
    exportDiagnostics(
      {
        logs: [
          {
            scope: "test scope",
            scopeCreateTimestamp: 12345,
            duration: 1111,
            logs: [
              {
                severity: { dev: "info", editor: "error" },
                message: "editor error",
                category: "test category",
                timestamp: 12350,
              },
              {
                severity: { dev: "error", editor: "info" },
                message: "dev error",
                category: "test category",
                timestamp: 12360,
              },
            ],
          },
        ],
      },
      ctx,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(spanStub.setStatus).to.be.calledOnceWith({
      code: SpanStatusCode.ERROR,
      message: "dev error",
    });
  });

  it("sets span status to 'error' when nested logs contain errors", () => {
    const ctx = context.active();
    exportDiagnostics(
      {
        logs: [
          {
            scope: "root scope",
            scopeCreateTimestamp: 12345,
            duration: 1111,
            logs: [
              {
                scope: "nested scope",
                scopeCreateTimestamp: 12346,
                duration: 2222,
                logs: [
                  {
                    severity: { dev: "info", editor: "error" },
                    message: "editor error",
                    category: "test category",
                    timestamp: 12350,
                  },
                  {
                    severity: { dev: "error", editor: "info" },
                    message: "dev error",
                    category: "test category",
                    timestamp: 12360,
                  },
                ],
              },
            ],
          },
        ],
      },
      ctx,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(spanStub.setStatus).to.be.calledOnceWith({
      code: SpanStatusCode.ERROR,
      message: "dev error",
    });
  });

  it("exports nested logs", () => {
    const ctx = context.active();
    exportDiagnostics(
      {
        logs: [
          {
            scope: "parent scope",
            scopeCreateTimestamp: 12345,
            duration: 1111,
            logs: [{ scope: "child scope", scopeCreateTimestamp: 12350, duration: 40 }],
          },
        ],
      },
      ctx,
    );
    expect(startActiveSpanStub).to.be.calledTwice;
    expect(startActiveSpanStub.firstCall).to.be.calledWith(
      "parent scope",
      {
        kind: SpanKind.INTERNAL,
        attributes: {},
        startTime: [12, 345000000],
      },
      { parentSpanName: undefined },
    );
    expect(startActiveSpanStub.secondCall).to.be.calledWith(
      "child scope",
      {
        kind: SpanKind.INTERNAL,
        attributes: {},
        startTime: [12, 350000000],
      },
      { parentSpanName: "parent scope" },
    );
  });

  it("does not include undefined severity attributes in span events", () => {
    const ctx = context.active();
    exportDiagnostics(
      {
        logs: [
          {
            scope: "test scope",
            scopeCreateTimestamp: 12345,
            duration: 1111,
            logs: [{ severity: {}, message: "test message", category: "test category", timestamp: 12350 }],
          },
        ],
      },
      ctx,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(spanStub.addEvent).to.be.calledOnceWith(
      "test message",
      {
        category: "test category",
      },
      [12, 350000000],
    );
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { context, Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { exportDiagnostics } from "../presentation-opentelemetry/Diagnostics.js";

describe("exportDiagnostics", () => {
  interface TestSpanContext {
    parentSpanName?: string;
  }

  const startActiveSpanStub = vi.fn<(...args: any[]) => Span>();
  const spanStub: Span = {
    addEvent: vi.fn(),
    end: vi.fn(),
    isRecording: vi.fn(),
    recordException: vi.fn(),
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
    spanContext: vi.fn(),
    updateName: vi.fn(),
    addLink: vi.fn(),
    addLinks: vi.fn(),
  };
  let currentSpanContext: TestSpanContext;

  beforeEach(() => {
    vi.spyOn(context, "active").mockImplementation(() => currentSpanContext as any);
    vi.spyOn(trace, "getTracer").mockReturnValue({ startActiveSpan: startActiveSpanStub, startSpan: vi.fn() });
    startActiveSpanStub.mockImplementation(
      (spanName: string, _spanAttributes: object, _ctx: TestSpanContext, cb: (span: Span) => Span) => {
        currentSpanContext = { parentSpanName: spanName };
        return cb(spanStub);
      },
    );
    currentSpanContext = { parentSpanName: undefined };
  });

  it("does nothing if there are no diagnostics", () => {
    exportDiagnostics({}, context.active());
    expect(startActiveSpanStub).not.toHaveBeenCalled();

    exportDiagnostics({ logs: [] }, context.active());
    expect(startActiveSpanStub).not.toHaveBeenCalled();
  });

  it("does nothing when `duration` not set", () => {
    exportDiagnostics({ logs: [{ scope: "test scope 1", scopeCreateTimestamp: 12345 }] }, context.active());
    expect(startActiveSpanStub).not.toHaveBeenCalled();
  });

  it("does nothing when `scopeCreateTimestamp` not set", () => {
    exportDiagnostics({ logs: [{ scope: "test scope 1", duration: 100 }] }, context.active());
    expect(startActiveSpanStub).not.toHaveBeenCalled();
  });

  it("exports logs as spans", () => {
    const ctx = context.active();
    exportDiagnostics({ logs: [{ scope: "test scope", scopeCreateTimestamp: 12345, duration: 1111 }] }, ctx);
    expect(startActiveSpanStub).toHaveBeenCalledExactlyOnceWith(
      "test scope",
      { kind: SpanKind.INTERNAL, attributes: {}, startTime: [12, 345000000] },
      ctx,
      expect.any(Function),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(spanStub.end).toHaveBeenCalledExactlyOnceWith([13, 456000000]);
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
            attributes: { stringAttribute: "stringAttributeValue", stringArrayAttribute: ["value1", "value2"] },
          },
        ],
      },
      ctx,
    );
    expect(startActiveSpanStub).toHaveBeenCalledExactlyOnceWith(
      "test scope",
      {
        kind: SpanKind.INTERNAL,
        attributes: { stringAttribute: "stringAttributeValue", stringArrayAttribute: ["value1", "value2"] },
        startTime: [12, 345000000],
      },
      ctx,
      expect.any(Function),
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
            logs: [
              {
                severity: { dev: "error", editor: "info" },
                message: "test message",
                category: "test category",
                timestamp: 12350,
              },
            ],
          },
        ],
      },
      ctx,
    );
    expect(startActiveSpanStub).toHaveBeenCalledExactlyOnceWith(
      "test scope",
      { kind: SpanKind.INTERNAL, attributes: {}, startTime: [12, 345000000] },
      ctx,
      expect.any(Function),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(spanStub.addEvent).toHaveBeenCalledExactlyOnceWith(
      "test message",
      { devSeverity: "error", editorSeverity: "info", category: "test category" },
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
    expect(spanStub.setStatus).not.toHaveBeenCalled();
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
    expect(spanStub.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SpanStatusCode.ERROR, message: "dev error" });
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
    expect(spanStub.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SpanStatusCode.ERROR, message: "dev error" });
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
    expect(startActiveSpanStub).toHaveBeenCalledTimes(2);
    expect(startActiveSpanStub).toHaveBeenNthCalledWith(
      1,
      "parent scope",
      { kind: SpanKind.INTERNAL, attributes: {}, startTime: [12, 345000000] },
      { parentSpanName: undefined },
      expect.any(Function),
    );
    expect(startActiveSpanStub).toHaveBeenNthCalledWith(
      2,
      "child scope",
      { kind: SpanKind.INTERNAL, attributes: {}, startTime: [12, 350000000] },
      { parentSpanName: "parent scope" },
      expect.any(Function),
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
    expect(spanStub.addEvent).toHaveBeenCalledExactlyOnceWith(
      "test message",
      { category: "test category" },
      [12, 350000000],
    );
  });
});

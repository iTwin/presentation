/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { createDiagnosticsOptions } from "../../presentation-components/common/Diagnostics.js";

import type { ClientDiagnostics } from "@itwin/presentation-common";

describe("createDiagnosticsOptions", () => {
  it("returns undefined when neither rule nor dev diagnostic props are set", () => {
    expect(createDiagnosticsOptions({ ruleDiagnostics: undefined, devDiagnostics: undefined })).toBeUndefined();
  });

  it("returns options with perf flag when dev diagnostic props have it", () => {
    const handler = vi.fn();
    expect(createDiagnosticsOptions({ devDiagnostics: { perf: true, handler } })).toEqual({ perf: true, handler });
  });

  it("returns options with perf object when dev diagnostic props have it", () => {
    const handler = vi.fn();
    expect(createDiagnosticsOptions({ devDiagnostics: { perf: { minimumDuration: 100 }, handler } })).toEqual({
      perf: { minimumDuration: 100 },
      handler,
    });
  });

  it("returns options with dev severity when dev diagnostic props have it", () => {
    const handler = vi.fn();
    expect(createDiagnosticsOptions({ devDiagnostics: { severity: "warning", handler } })).toEqual({
      dev: "warning",
      handler,
    });
  });

  it("returns options with editor severity when rule diagnostic props are set", () => {
    const handler = vi.fn();
    expect(createDiagnosticsOptions({ ruleDiagnostics: { severity: "warning", handler } })).toEqual({
      editor: "warning",
      handler,
    });
  });

  it("returns options with combined handler when rule and dev props have different handlers", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const result = createDiagnosticsOptions({
      devDiagnostics: { severity: "info", handler: handler1 },
      ruleDiagnostics: { severity: "warning", handler: handler2 },
    });
    expect(result).toMatchObject({ editor: "warning", dev: "info" });
    const diagnostics: ClientDiagnostics = {
      logs: [
        {
          scope: "test scope",
          logs: [
            { message: "message", category: "category", timestamp: 0, severity: { dev: "error", editor: "error" } },
          ],
        },
      ],
    };
    result!.handler(diagnostics);
    expect(handler1).toHaveBeenCalledExactlyOnceWith(diagnostics);
    expect(handler2).toHaveBeenCalledExactlyOnceWith(diagnostics);
  });
});

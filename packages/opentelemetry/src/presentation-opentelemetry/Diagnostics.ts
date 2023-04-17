/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { Diagnostics, DiagnosticsLogEntry, DiagnosticsScopeLogs } from "@itwin/presentation-common";
import { context, Context, HrTime, SpanKind, trace } from "@opentelemetry/api";

/**
 * Export Presentation diagnostics as OpenTelemetry traces to the given context.
 * @see [Diagnostics and OpenTelemetry]($docs/presentation/advanced/Diagnostics.md#diagnostics-and-opentelemetry)
 * @beta
 */
export function exportDiagnostics(diagnostics: Diagnostics, ctx: Context) {
  for (const logs of diagnostics.logs ?? []) {
    exportDiagnosticsLogs(logs, ctx);
  }
}

function exportDiagnosticsLogs(logs: DiagnosticsScopeLogs, ctx?: Context) {
  if (!logs.scopeCreateTimestamp || !logs.duration) {
    return;
  }

  const span = trace.getTracer("iTwin.js Presentation").startActiveSpan(
    logs.scope,
    {
      kind: SpanKind.INTERNAL,
      attributes: { ...(logs.attributes ? logs.attributes : undefined) },
      startTime: millisToHrTime(logs.scopeCreateTimestamp),
    },
    ctx ?? context.active(),
    (thisSpan) => {
      for (const entry of logs.logs ?? []) {
        if (DiagnosticsLogEntry.isMessage(entry)) {
          const eventAttributes = {
            category: entry.category,
            ...(entry.severity.dev ? { devSeverity: entry.severity.dev } : undefined),
            ...(entry.severity.editor ? { editorSeverity: entry.severity.editor } : undefined),
          };
          thisSpan.addEvent(entry.message, eventAttributes, millisToHrTime(entry.timestamp));
        } else {
          exportDiagnosticsLogs(entry);
        }
      }
      return thisSpan;
    },
  );
  span.end(millisToHrTime(logs.scopeCreateTimestamp + logs.duration));
}

function millisToHrTime(millis: number): HrTime {
  const hrTime: HrTime = [0, 0];
  hrTime[0] = Math.trunc(millis / 1000);
  hrTime[1] = (millis - hrTime[0] * 1000) * 1e6;
  return hrTime;
}

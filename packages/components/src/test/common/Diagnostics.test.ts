/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { ClientDiagnostics } from "@itwin/presentation-common";
import { createDiagnosticsOptions } from "../../presentation-components/common/Diagnostics.js";

describe("createDiagnosticsOptions", () => {
  it("returns undefined when neither rule nor dev diagnostic props are set", () => {
    expect(createDiagnosticsOptions({ ruleDiagnostics: undefined, devDiagnostics: undefined })).to.be.undefined;
  });

  it("returns options with perf flag when dev diagnostic props have it", () => {
    const handler = sinon.stub();
    expect(createDiagnosticsOptions({ devDiagnostics: { perf: true, handler } })).to.deep.eq({ perf: true, handler });
  });

  it("returns options with perf object when dev diagnostic props have it", () => {
    const handler = sinon.stub();
    expect(createDiagnosticsOptions({ devDiagnostics: { perf: { minimumDuration: 100 }, handler } })).to.deep.eq({
      perf: { minimumDuration: 100 },
      handler,
    });
  });

  it("returns options with dev severity when dev diagnostic props have it", () => {
    const handler = sinon.stub();
    expect(createDiagnosticsOptions({ devDiagnostics: { severity: "warning", handler } })).to.deep.eq({ dev: "warning", handler });
  });

  it("returns options with editor severity when rule diagnostic props are set", () => {
    const handler = sinon.stub();
    expect(createDiagnosticsOptions({ ruleDiagnostics: { severity: "warning", handler } })).to.deep.eq({ editor: "warning", handler });
  });

  it("returns options with combined handler when rule and dev props have different handlers", () => {
    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    const result = createDiagnosticsOptions({
      devDiagnostics: { severity: "info", handler: handler1 },
      ruleDiagnostics: { severity: "warning", handler: handler2 },
    });
    expect(result).to.containSubset({
      editor: "warning",
      dev: "info",
    });
    const diagnostics: ClientDiagnostics = {
      logs: [
        {
          scope: "test scope",
          logs: [
            {
              message: "message",
              category: "category",
              timestamp: 0,
              severity: {
                dev: "error",
                editor: "error",
              },
            },
          ],
        },
      ],
    };
    result!.handler(diagnostics);
    expect(handler1).to.be.calledOnceWith(diagnostics);
    expect(handler2).to.be.calledOnceWith(diagnostics);
  });
});

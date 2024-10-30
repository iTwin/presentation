/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import * as td from "testdouble";
import * as presentationFrontendModule from "@itwin/presentation-frontend";
import * as diagnostics from "../../presentation-components/common/Diagnostics.js";

// this is needed for mocking external module
const presentationFrontendModulePath = import.meta.resolve("@itwin/presentation-frontend");

describe("createDiagnosticsOptions", () => {
  afterEach(() => {
    td.reset();
  });

  async function createDiagnosticsOptions(
    ...props: Parameters<typeof diagnostics.createDiagnosticsOptions>
  ): Promise<ReturnType<typeof diagnostics.createDiagnosticsOptions>> {
    const impl = await import("../../presentation-components/common/Diagnostics.js");
    return impl.createDiagnosticsOptions(...props);
  }

  it("returns undefined when neither rule nor dev diagnostic props are set", async () => {
    expect(await createDiagnosticsOptions({ ruleDiagnostics: undefined, devDiagnostics: undefined })).to.be.undefined;
  });

  it("returns options with perf flag when dev diagnostic props have it", async () => {
    const handler = sinon.stub();
    expect(await createDiagnosticsOptions({ devDiagnostics: { perf: true, handler } })).to.deep.eq({ perf: true, handler });
  });

  it("returns options with perf object when dev diagnostic props have it", async () => {
    const handler = sinon.stub();
    expect(await createDiagnosticsOptions({ devDiagnostics: { perf: { minimumDuration: 100 }, handler } })).to.deep.eq({
      perf: { minimumDuration: 100 },
      handler,
    });
  });

  it("returns options with dev severity when dev diagnostic props have it", async () => {
    const handler = sinon.stub();
    expect(await createDiagnosticsOptions({ devDiagnostics: { severity: "warning", handler } })).to.deep.eq({ dev: "warning", handler });
  });

  it("returns options with editor severity when rule diagnostic props are set", async () => {
    const handler = sinon.stub();
    expect(await createDiagnosticsOptions({ ruleDiagnostics: { severity: "warning", handler } })).to.deep.eq({ editor: "warning", handler });
  });

  it("returns options with combined handler when rule and dev props have different handlers", async () => {
    const combinedHandler = sinon.stub();
    const combineFunc = sinon.stub().returns(combinedHandler);
    await td.replaceEsm(presentationFrontendModulePath, {
      ...presentationFrontendModule,
      createCombinedDiagnosticsHandler: combineFunc,
    });
    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    expect(
      await createDiagnosticsOptions({
        devDiagnostics: { severity: "info", handler: handler1 },
        ruleDiagnostics: { severity: "warning", handler: handler2 },
      }),
    ).to.deep.eq({
      editor: "warning",
      dev: "info",
      handler: combinedHandler,
    });
    expect(combineFunc).to.be.calledOnceWithExactly([handler1, handler2]);
  });
});

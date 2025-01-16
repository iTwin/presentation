/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyValueRendererManager } from "@itwin/components-react";
import { ITwinLocalization } from "@itwin/core-i18n";
import { Presentation } from "@itwin/presentation-frontend";
import { initializeLocalization, initializePropertyValueRenderers } from "../presentation-components/Initialization.js";
import { createStub } from "./TestUtils.js";

describe("initializeLocalization", () => {
  it("registers and unregisters namespace", async () => {
    const i18n = {
      registerNamespace: createStub<ITwinLocalization["registerNamespace"]>().resolves(),
      unregisterNamespace: createStub<ITwinLocalization["unregisterNamespace"]>(),
    };
    sinon.stub(Presentation, "localization").get(() => i18n);

    const terminate = await initializeLocalization();
    expect(i18n.registerNamespace).to.be.calledOnce;
    terminate();
    expect(i18n.unregisterNamespace).to.be.calledOnce;
  });
});

describe("initializePropertyValueRenderers", () => {
  it("registers custom renderers", async () => {
    const registerSpy = sinon.spy(PropertyValueRendererManager.defaultManager, "registerRenderer");
    const unregisterSpy = sinon.spy(PropertyValueRendererManager.defaultManager, "unregisterRenderer");

    const unregisterCallback = await initializePropertyValueRenderers();
    expect(registerSpy).to.be.calledOnceWith("SelectableInstance");
    expect(unregisterSpy).to.not.be.called;

    unregisterCallback();
    expect(unregisterSpy).to.be.calledOnceWith("SelectableInstance");
  });
});

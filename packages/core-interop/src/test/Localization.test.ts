/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { Localization } from "@itwin/core-common";
import { LOCALIZATION_NAMESPACE } from "@itwin/presentation-hierarchy-builder";
import { createLocalizationFunction } from "../core-interop/Localization";

describe("createTranslator", () => {
  it("creates a localization function using provided core `Localization` object", async () => {
    const registerNamespaceSpy = sinon.spy();
    const localization = {
      getLocalizedString: (input: string) => `${input}_localized`,
      registerNamespace: registerNamespaceSpy,
    } as unknown as Localization;
    const translator = await createLocalizationFunction(localization);
    expect(registerNamespaceSpy).to.be.calledWith(LOCALIZATION_NAMESPACE);
    const result = translator("Test");
    expect(result).to.be.eq("Test_localized");
  });
});

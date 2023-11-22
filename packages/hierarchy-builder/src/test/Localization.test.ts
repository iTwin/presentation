/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { LOCALIZATION_NAMESPACE, setLocalizationFunction, translate } from "../hierarchy-builder/Localization";

describe("translate", () => {
  it("returns same input with namespace appended when localizationFunction isn't set", () => {
    expect(translate("Test")).to.eq(`${LOCALIZATION_NAMESPACE}:Test`);
  });

  it("returns same input with namespace appended when localizationFunction is set to undefined", () => {
    setLocalizationFunction();
    expect(translate("Test")).to.eq(`${LOCALIZATION_NAMESPACE}:Test`);
  });

  it("returns input modified by custom localizationFunction with namespace appended when localizationFunction is set", () => {
    setLocalizationFunction((input) => `${input}_translated`);
    expect(translate("Test")).to.eq(`${LOCALIZATION_NAMESPACE}:Test_translated`);
  });
});

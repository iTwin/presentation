/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Localization } from "@itwin/core-common";
import { createTranslator } from "../core-interop/Localization";

describe("createTranslator", () => {
  it("creates a translator using provided core `Localization` object", async () => {
    const localization = {
      getLocalizedString: (input: string) => `${input}_localized`,
    } as Localization;
    const translator = createTranslator(localization);
    const result = translator("Test");
    expect(result).to.be.eq("Test_localized");
  });
});

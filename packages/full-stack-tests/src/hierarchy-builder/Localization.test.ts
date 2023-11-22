/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IModelApp } from "@itwin/core-frontend";
import { createLocalizationFunction } from "@itwin/presentation-core-interop";
import { setLocalizationFunction } from "@itwin/presentation-hierarchy-builder";
import { translate } from "@itwin/presentation-hierarchy-builder/lib/cjs/hierarchy-builder/Localization";
import { initialize, terminate } from "../IntegrationTests";

describe("Stateless hierarchy builder", () => {
  describe("Localization", () => {
    describe("translate", () => {
      beforeEach(async () => {
        await initialize();
      });

      afterEach(async () => {
        await terminate();
      });

      it("translates strings using `IModelApp.localization`", async function () {
        const localizationFunction = await createLocalizationFunction(IModelApp.localization);
        setLocalizationFunction(localizationFunction);
        const result = translate("grouping.other-label");
        expect(result).to.be.eq("Òthér");
      });
    });
  });
});

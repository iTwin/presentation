/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.BasicFormatterExample.Imports
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Formatting", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      it("formats values with custom formatter", async () => {
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.BasicFormatterExample
        const defaultFormatter = createDefaultValueFormatter();
        const myFormatter: IPrimitiveValueFormatter = async (value) => {
          if (value.type === "Boolean") {
            return value.value ? "yes!" : "no!";
          }
          return defaultFormatter(value);
        };
        expect(await myFormatter({ type: "Boolean", value: true })).to.eq("yes!");
        expect(await myFormatter({ type: "Boolean", value: false })).to.eq("no!");
        // __PUBLISH_EXTRACT_END__
      });
    });
  });
});

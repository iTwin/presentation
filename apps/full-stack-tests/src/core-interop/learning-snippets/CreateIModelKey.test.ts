/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */
/* eslint-disable no-console */

import { Cartographic } from "@itwin/core-common";
import { BlankConnection } from "@itwin/core-frontend";
// __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateIModelKey.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { createIModelKey } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { initialize, terminate } from "../../IntegrationTests.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Core interop", () => {
  describe("Learning snippets", () => {
    describe("createIModelKey", () => {
      beforeAll(async () => {
        await initialize();
      });

      afterAll(async () => {
        await terminate();
        IModelConnection.onOpen.clear();
      });

      it("creates key for `BlankConnection`", async () => {
        const spy = vi.spyOn(console, "log");
        // __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateIModelKey.Example
        IModelConnection.onOpen.addListener((imodel: IModelConnection) => {
          const key = createIModelKey(imodel);
          console.log(`IModel opened: "${key}"`);
        });
        // __PUBLISH_EXTRACT_END__
        const connection = BlankConnection.create({
          name: "blank",
          location: Cartographic.createZero(),
          extents: { low: { x: 0, y: 0, z: 0 }, high: { x: 0, y: 0, z: 0 } },
        });
        expect(spy).toHaveBeenCalledWith(`IModel opened: "${connection.name}"`);
      });
    });
  });
});

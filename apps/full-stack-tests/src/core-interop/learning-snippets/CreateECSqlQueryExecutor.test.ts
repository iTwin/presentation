/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateECSqlQueryExecutor.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Core interop", () => {
  describe("Learning snippets", () => {
    describe("createECSqlQueryExecutor", () => {
      beforeAll(async () => {
        await initialize();
      });

      afterAll(async () => {
        await terminate();
      });

      it("creates executor that can run ECSql queries", async function () {
        const { imodelConnection: emptyIModel } = await buildTestIModel(async () => {});
        function getIModelConnection(): IModelConnection {
          return emptyIModel;
        }
        const MY_QUERY = `SELECT ECInstanceId FROM bis.Element WHERE ECInstanceId = 0x1`;
        const spy = vi.spyOn(console, "log");
        // __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateECSqlQueryExecutor.Example
        const imodel: IModelConnection = getIModelConnection();
        const executor = createECSqlQueryExecutor(imodel);
        for await (const row of executor.createQueryReader({ ecsql: MY_QUERY })) {
          console.log(row);
        }
        // __PUBLISH_EXTRACT_END__
        expect(spy).toHaveBeenCalledWith({ ["ECInstanceId"]: "0x1" });
      });
    });
  });
});

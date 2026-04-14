/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
// __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateECSchemaProvider.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { createECSchemaProvider } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Core interop", () => {
  describe("Learning snippets", () => {
    describe("createECSchemaProvider", () => {
      beforeAll(async () => {
        await initialize();
      });

      afterAll(async () => {
        await terminate();
      });

      it("creates provider that returns BisCore schema from iModel", async function () {
        const { imodelConnection: emptyIModel } = await buildTestIModel(async () => {});
        function getIModelConnection(): IModelConnection {
          return emptyIModel;
        }
        // __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateECSchemaProvider.Example
        const imodel: IModelConnection = getIModelConnection();
        const schemaProvider = createECSchemaProvider(imodel.schemaContext);
        // the created schema provider may be used in `@itwin/presentation-hierarchies` or `@itwin/unified-selection` packages
        // __PUBLISH_EXTRACT_END__
        expect(await schemaProvider.getSchema("BisCore")).toBeDefined();
      });
    });
  });
});

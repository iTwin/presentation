/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
// __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateECSchemaProvider.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { createECSchemaProvider } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { initialize, terminate } from "../../IntegrationTests.js";
import { buildIModel } from "../../IModelUtils.js";

describe("Core interop", () => {
  describe("Learning snippets", () => {
    describe("createECSchemaProvider", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      it("creates provider that returns BisCore schema from iModel", async function () {
        const { imodel: emptyIModel } = await buildIModel(this, async () => {});
        function getIModelConnection(): IModelConnection {
          return emptyIModel;
        }
        // __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateECSchemaProvider.Example
        const imodel: IModelConnection = getIModelConnection();
        const schemaProvider = createECSchemaProvider(imodel.schemaContext);
        // the created schema provider may be used in `@itwin/presentation-hierarchies` or `@itwin/unified-selection` packages
        // __PUBLISH_EXTRACT_END__
        expect(await schemaProvider.getSchema("BisCore")).to.not.be.undefined;
      });
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
// __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateValueFormatter.Imports
import { IModelConnection } from "@itwin/core-frontend";
import { createValueFormatter } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { buildIModel } from "../../IModelUtils.js";
import { importSchema } from "../../SchemaUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Core interop", () => {
  describe("Learning snippets", () => {
    describe("createValueFormatter", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      it("creates formatter that formats values with units", async function () {
        const { imodel: testIModel, schema } = await buildIModel(this, async (builder, mochaContext) => {
          return {
            schema: await importSchema(
              mochaContext,
              builder,
              `
                <ECSchemaReference name="Formats" version="01.00.00" alias="f"/>
                <ECSchemaReference name="Units" version="01.00.03" alias="u"/>
                <KindOfQuantity typeName="FlowRate" displayLabel="Flow Rate" persistenceUnit="u:CUB_M_PER_SEC" relativeError="1e-05" presentationUnits="f:DefaultRealU(4)[u:LITRE_PER_MIN];f:DefaultRealU(4)[u:GALLON_PER_MIN]" />
              `,
            ),
          };
        });
        const KOQ_SCHEMA_NAME = schema.schemaName;
        function getIModelConnection() {
          return testIModel;
        }

        // __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateValueFormatter.Example
        const imodel: IModelConnection = getIModelConnection();
        const metricFormatter = createValueFormatter({ schemaContext: imodel.schemaContext, unitSystem: "metric" });
        const imperialFormatter = createValueFormatter({ schemaContext: imodel.schemaContext, unitSystem: "imperial" });

        // Define the raw value to be formatted
        const value = 1.234;

        // Define the `KindOfQuantity` to use for formatting:
        // <KindOfQuantity
        //   typeName="FlowRate"
        //   displayLabel="Flow Rate"
        //   persistenceUnit="u:CUB_M_PER_SEC"
        //   relativeError="1e-05"
        //   presentationUnits="f:DefaultRealU(4)[u:LITRE_PER_MIN];f:DefaultRealU(4)[u:GALLON_PER_MIN]"
        // />
        const koqName = `${KOQ_SCHEMA_NAME}.FlowRate`;

        // Not passing `koqName` formats the value without units using the default formatter:
        expect(await metricFormatter({ type: "Double", value })).to.eq("1.23");

        // Metric formatter formats the value in liters per minute:
        expect(await metricFormatter({ type: "Double", value, koqName })).to.eq("74040.0 L/min");

        // Imperial formatter formats the value in gallons per minute:
        expect(await imperialFormatter({ type: "Double", value, koqName })).to.eq("19559.2988 gal/min");
        // __PUBLISH_EXTRACT_END__
      });
    });
  });
});

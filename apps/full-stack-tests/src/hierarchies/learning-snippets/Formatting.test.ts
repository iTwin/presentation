/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.BasicFormatterExample.Imports
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.CoreInteropFormatterExample.Imports
import { createValueFormatter } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { buildIModel, importSchema } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { createSchemaContext } from "../Utils.js";

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

      it("formats values with units", async function () {
        const { imodel, schema } = await buildIModel(this, async (builder, mochaContext) => {
          return {
            schema: await importSchema(
              mochaContext,
              builder,
              `
                <ECSchemaReference name="Formats" version="01.00.00" alias="f"/>
                <ECSchemaReference name="Units"   version="01.00.03" alias="u"/>
                <KindOfQuantity typeName="FlowRate" displayLabel="Flow Rate" persistenceUnit="u:CUB_M_PER_SEC" relativeError="1e-05" presentationUnits="f:DefaultRealU(4)[u:LITRE_PER_MIN];f:DefaultRealU(4)[u:GALLON_PER_MIN]" />
              `,
            ),
          };
        });
        const schemaContext = createSchemaContext(imodel);
        const mySchemaName = schema.schemaName;

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.CoreInteropFormatterExample
        const metricFormatter = createValueFormatter({ schemaContext, unitSystem: "metric" });
        const imperialFormatter = createValueFormatter({ schemaContext, unitSystem: "imperial" });

        // Define the raw value to be formatted
        const value = 1.234;

        // Define the KindOfQuantity to use for formatting:
        // <KindOfQuantity
        //   typeName="FlowRate"
        //   displayLabel="Flow Rate"
        //   persistenceUnit="u:CUB_M_PER_SEC"
        //   relativeError="1e-05"
        //   presentationUnits="f:DefaultRealU(4)[u:LITRE_PER_MIN];f:DefaultRealU(4)[u:GALLON_PER_MIN]"
        // />
        const koqName = `${mySchemaName}.FlowRate`;

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

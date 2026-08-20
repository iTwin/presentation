/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SchemaFormatsProvider, SchemaUnitProvider } from "@itwin/ecschema-metadata";
// __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateValueFormatter.Imports
import { IModelApp } from "@itwin/core-frontend";
import { createValueFormatter } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";

describe("Core interop", () => {
  describe("Learning snippets", () => {
    describe("createValueFormatter", () => {
      beforeAll(async () => {
        await initialize();
      });

      afterAll(async () => {
        await terminate();
      });

      it("creates formatter that formats values with units", async function () {
        const { imodelConnection, schema } = await buildTestIModel(async (imodelDb, testName) => {
          return {
            schema: await importSchema(
              testName,
              imodelDb,
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
          return imodelConnection;
        }

        // The end product is responsible for registering schema-aware `FormatsProvider` / `UnitsProvider` instances -
        // `createValueFormatter` doesn't do this itself.
        IModelApp.formatsProvider = new SchemaFormatsProvider(imodelConnection.schemaContext);
        IModelApp.quantityFormatter.unitsProvider = new SchemaUnitProvider(imodelConnection.schemaContext);
        await using _resetIModelApp = {
          async [Symbol.asyncDispose]() {
            IModelApp.resetFormatsProvider();
            await IModelApp.quantityFormatter.resetToUseInternalUnitsProvider();
          },
        };

        // __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateValueFormatter.Example
        const imodel = getIModelConnection();
        const metricFormatter = createValueFormatter({
          formatsProvider: IModelApp.formatsProvider,
          unitsProvider: IModelApp.quantityFormatter,
          imodel,
          unitSystem: "metric",
        });
        const imperialFormatter = createValueFormatter({
          formatsProvider: IModelApp.formatsProvider,
          unitsProvider: IModelApp.quantityFormatter,
          imodel,
          unitSystem: "imperial",
        });

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
        expect(await metricFormatter({ type: "Double", value })).toBe("1.23");

        // Metric formatter formats the value in liters per minute:
        expect(await metricFormatter({ type: "Double", value, koqName })).toBe("74040.0 L/min");

        // Imperial formatter formats the value in gallons per minute:
        expect(await imperialFormatter({ type: "Double", value, koqName })).toBe("19559.2988 gal/min");
        // __PUBLISH_EXTRACT_END__
      });
    });
  });
});

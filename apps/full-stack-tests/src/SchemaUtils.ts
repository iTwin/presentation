/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { XMLParser } from "fast-xml-parser";
import { Context as MochaContext } from "mocha";
import { getFullSchemaXml } from "presentation-test-utilities";
import { Guid } from "@itwin/core-bentley";

// cspell:words jpath

export async function importSchema(
  mochaContextOrTestNameOrSchemaProps: MochaContext | string | { schemaName: string; schemaAlias: string; schemaVersion?: `${string}.${string}.${string}` },
  imodel: { importSchema: (xml: string) => Promise<void> | void },
  schemaContentXml: string,
) {
  const schemaProps = ((): { schemaName: string; schemaAlias: string; schemaVersion?: `${string}.${string}.${string}` } => {
    if (typeof mochaContextOrTestNameOrSchemaProps === "object" && !(mochaContextOrTestNameOrSchemaProps instanceof MochaContext)) {
      return mochaContextOrTestNameOrSchemaProps;
    }

    const testName =
      typeof mochaContextOrTestNameOrSchemaProps === "string" ? mochaContextOrTestNameOrSchemaProps : mochaContextOrTestNameOrSchemaProps.test!.fullTitle();
    return {
      schemaName: `SCHEMA_${testName}`.replace(/[^\w\d_]/gi, "_").replace(/_+/g, "_"),
      schemaAlias: `ALIAS_${Guid.createValue().replaceAll("-", "")}`,
      schemaVersion: "1.0.0",
    };
  })();

  const schemaXml = getFullSchemaXml({ ...schemaProps, schemaContentXml });
  await imodel.importSchema(schemaXml);

  const parsedSchema = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    isArray: (_, jpath) => jpath.startsWith("ECSchema."),
  }).parse(schemaXml);
  const schemaItems = Object.values(parsedSchema.ECSchema)
    .flatMap<any>((itemDef) => itemDef)
    .filter((itemDef: any) => !!itemDef.typeName);

  return {
    ...schemaProps,
    items: schemaItems.reduce<{ [className: string]: { name: string; fullName: string; label: string } }>((classesObj, schemaItemDef) => {
      const name = schemaItemDef.typeName;
      return {
        ...classesObj,
        [name]: {
          fullName: `${schemaProps.schemaName}.${name}`,
          name,
          label: schemaItemDef.displayLabel,
        },
      };
    }, {}),
  };
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */

import { XMLParser } from "fast-xml-parser";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SnapshotDb } from "@itwin/core-backend";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";

import type { IModelDb } from "@itwin/core-backend";

export async function buildIModel<TResult extends object | undefined>(
  name: string,
  setup?: (imodel: IModelDb) => Promise<TResult>,
) {
  const directory = mkdtempSync(join(tmpdir(), "tree-definitions-"));
  const imodel = SnapshotDb.createEmpty(join(directory, "test.bim"), { rootSubject: { name } });
  try {
    const result = setup ? await setup(imodel) : undefined;
    return { ...result, imodelConnection: new TestIModelConnection(imodel, directory) };
  } catch (error) {
    imodel.close();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

class TestIModelConnection extends IModelConnection {
  constructor(
    private readonly db: IModelDb,
    private readonly directory: string,
  ) {
    // eslint-disable-next-line @itwin/no-internal
    super(db.getConnectionProps());
    IModelConnection.onOpen.raiseEvent(this);
  }

  public override get isClosed(): boolean {
    // eslint-disable-next-line @itwin/no-internal
    return !this.db.isOpen;
  }

  public override async close(): Promise<void> {
    this.db.close();
    this.onClose.raiseEvent(this);
    IModelConnection.onClose.raiseEvent(this);
    rmSync(this.directory, { recursive: true, force: true });
  }
}

export interface ImportSchemaResult {
  schemaName: string;
  schemaAlias: string;
  items: { [className: string]: { name: string; fullName: string; label: string } };
}

export async function importSchema({
  imodel,
  schemaContentXml,
  schemaName,
  schemaAlias,
}: {
  imodel: IModelDb;
  schemaContentXml: string;
  schemaAlias: string;
  schemaName: string;
}): Promise<ImportSchemaResult> {
  const schemaXml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <ECSchema schemaName="${schemaName}" alias="${schemaAlias}" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      <ECSchemaReference name="CoreCustomAttributes" version="01.00.03" alias="CoreCA" />
      <ECSchemaReference name="ECDbMap" version="02.00.01" alias="ecdbmap" />
      ${schemaContentXml}
    </ECSchema>
  `;
  await imodel.importSchemaStrings([schemaXml]);
  const parsedSchema = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    isArray: (_, path) => {
      assert(typeof path === "string");
      return path.startsWith("ECSchema.");
    },
  }).parse(schemaXml);
  const schemaItems = Object.values(parsedSchema.ECSchema)
    .flatMap<any>((itemDef) => itemDef)
    .filter((itemDef: any) => !!itemDef.typeName);
  return {
    schemaName,
    schemaAlias,
    items: Object.fromEntries(
      schemaItems.map((item) => [
        item.typeName,
        { name: item.typeName, fullName: `${schemaName}.${item.typeName}`, label: item.displayLabel },
      ]),
    ),
  };
}

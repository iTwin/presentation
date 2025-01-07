/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import path from "path";

export async function getSchemaFromPackage(packageName: string, schemaFileName: string): Promise<string> {
  const schemaFile = path.join(import.meta.dirname, "..", "..", "node_modules", "@bentley", packageName, schemaFileName);
  return fs.readFileSync(schemaFile, "utf8");
}

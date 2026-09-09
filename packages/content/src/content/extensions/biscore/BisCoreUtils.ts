/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { isSchemaVersionAtLeast } from "../../InternalUtils.js";

import type { ECSchemaProvider } from "@itwin/presentation-shared";

/**
 * Full name of the `BisCore` EC schema, as used by the iModel content configuration to gate
 * BisCore-specific fields providers and descriptor transformers.
 *
 * @internal
 */
export const BIS_CORE_SCHEMA_NAME = "BisCore";

/**
 * Returns `true` if the iModel has the `BisCore` schema and its version is at or above `minVersion`
 * (inclusive).
 *
 * `minVersion` uses the `"read.write.minor"` string format.
 *
 * @internal
 */
export async function isBisCoreSchemaAtLeast(imodelAccess: ECSchemaProvider, minVersion: string): Promise<boolean> {
  const schema = await imodelAccess.getSchema(BIS_CORE_SCHEMA_NAME);
  if (!schema) {
    return false;
  }
  return isSchemaVersionAtLeast(schema.version, minVersion);
}

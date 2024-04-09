/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { EC, IMetadataProvider, parseFullClassName } from "@itwin/presentation-shared";
import { getLogger } from "../Logging";
import { LOGGING_NAMESPACE } from "./Common";

/** @internal */
export async function getClass(metadata: IMetadataProvider, fullClassName: string): Promise<EC.Class> {
  const { schemaName, className } = parseFullClassName(fullClassName);
  let schema: EC.Schema | undefined;
  try {
    schema = await metadata.getSchema(schemaName);
  } catch (e) {
    assert(e instanceof Error);
    getLogger().logError(`${LOGGING_NAMESPACE}`, `Failed to get schema "${schemaName} with error ${e.message}."`);
  }
  if (!schema) {
    throw new Error(`Invalid schema "${schemaName}"`);
  }

  let nodeClass: EC.Class | undefined;
  try {
    nodeClass = await schema.getClass(className);
  } catch (e) {
    assert(e instanceof Error);
    getLogger().logError(`${LOGGING_NAMESPACE}`, `Failed to get schema "${schemaName} with error ${e.message}."`);
  }
  if (!nodeClass) {
    throw new Error(`Invalid class "${className}" in schema "${schemaName}"`);
  }

  return nodeClass;
}

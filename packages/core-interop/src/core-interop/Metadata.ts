/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { SchemaContext, SchemaKey } from "@itwin/ecschema-metadata";
import { IMetadataProvider } from "@itwin/presentation-hierarchy-builder";
import { createECSchema } from "./MetadataInternal";

/**
 * Create an `IMetadataProvider` for given [SchemaContext]($ecschema-metadata).
 * @beta
 */
export function createMetadataProvider(schemaContext: SchemaContext): IMetadataProvider {
  return {
    async getSchema(name) {
      const schema = await schemaContext.getSchema(new SchemaKey(name));
      return schema ? createECSchema(schema) : undefined;
    },
  };
}

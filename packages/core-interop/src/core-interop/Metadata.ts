/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Schema as CoreSchema, SchemaKey as CoreSchemaKey } from "@itwin/ecschema-metadata";
import { ECSchema, IMetadataProvider } from "@itwin/presentation-hierarchies";
import { createECSchema } from "./MetadataInternal";

/**
 * Defines input for `createMetadataProvider`. Generally, this is an instance of [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/)
 * class from `@itwin/ecschema-metadata` package.
 */
interface ICoreSchemaContext {
  getSchema(key: CoreSchemaKey): Promise<CoreSchema | undefined>;
}

/**
 * Create an `IMetadataProvider` for given [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/).
 *
 * Usage example:
 *
 * ```ts
 * import { SchemaContext } from "@itwin/ecschema-metadata";
 * import { createMetadataProvider } from "@itwin/presentation-core-interop";
 *
 * const schemas = new SchemaContext();
 * const metadata = createMetadataProvider(schemas);
 * // the created metadata provider may be used in `@itwin/presentation-hierarchies` or `@itwin/unified-selection` packages
 * ```
 *
 * @beta
 */
export function createMetadataProvider(schemaContext: ICoreSchemaContext): IMetadataProvider {
  const schemaCache = new Map<string, Promise<ECSchema | undefined>>();
  return {
    async getSchema(name) {
      // workaround for https://github.com/iTwin/itwinjs-core/issues/6542
      let schema = schemaCache.get(name);
      // istanbul ignore else
      if (!schema) {
        schema = schemaContext.getSchema(new CoreSchemaKey(name)).then((coreSchema) => (coreSchema ? createECSchema(coreSchema) : undefined));
        schema.catch(() => schemaCache.delete(name));
        schemaCache.set(name, schema);
      }
      return schema;
    },
  };
}

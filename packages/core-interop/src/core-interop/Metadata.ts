/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Schema as CoreSchema, SchemaKey as CoreSchemaKey } from "@itwin/ecschema-metadata";
import { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import { createECSchema } from "./MetadataInternal";

/**
 * Defines input for `createECSchemaProvider`. Generally, this is an instance of [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/)
 * class from `@itwin/ecschema-metadata` package.
 */
interface CoreSchemaContext {
  getSchema(key: CoreSchemaKey): Promise<CoreSchema | undefined>;
}

/**
 * Creates an `ECSchemaProvider` for given [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/).
 *
 * Usage example:
 *
 * ```ts
 * import { SchemaContext } from "@itwin/ecschema-metadata";
 * import { createECSchemaProvider } from "@itwin/presentation-core-interop";
 *
 * const schemaContext = new SchemaContext();
 * const schemaProvider = createECSchemaProvider(schemas);
 * // the created schema provider may be used in `@itwin/presentation-hierarchies` and other Presentation packages
 * ```
 *
 * @beta
 */
export function createECSchemaProvider(schemaContext: CoreSchemaContext): ECSchemaProvider {
  const schemaRequestsCache = new Map<string, Promise<EC.Schema | undefined>>();
  async function getSchemaUnprotected(schemaName: string) {
    const coreSchema = await schemaContext.getSchema(new CoreSchemaKey(schemaName));
    return coreSchema ? createECSchema(coreSchema) : undefined;
  }
  async function getSchemaProtected(schemaName: string, handledExistingSchemaErrors: Set<string>) {
    // workaround for https://github.com/iTwin/itwinjs-core/issues/6542
    try {
      return await getSchemaUnprotected(schemaName);
    } catch (e) {
      // istanbul ignore else
      if (e instanceof Error) {
        if (e.message.includes("already exists within this cache") && !handledExistingSchemaErrors.has(schemaName)) {
          handledExistingSchemaErrors.add(schemaName);
          return getSchemaProtected(schemaName, handledExistingSchemaErrors);
        }
        if (e.message.includes("schema not found")) {
          return undefined;
        }
      }
      throw e;
    }
  }
  return {
    async getSchema(name) {
      let promise = schemaRequestsCache.get(name);
      if (!promise) {
        promise = getSchemaProtected(name, new Set());
        schemaRequestsCache.set(name, promise);
      }
      return promise;
    },
  };
}

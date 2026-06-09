/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createECSchemaProviderFromSchemaContext } from "./schema-provider/SchemaContextProvider.js";
import { createECSchemaProviderFromSchemaView } from "./schema-provider/SchemaViewProvider.js";

import type { ECSchemaProvider, Props } from "@itwin/presentation-shared";
import type { CoreSchemaContext } from "./schema-provider/SchemaContextProvider.js";

/**
 * Creates an `ECSchemaProvider` for given [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/).
 *
 * Usage example:
 *
 * ```ts
 * import { IModelConnection } from "@itwin/core-frontend";
 * import { createECSchemaProvider } from "@itwin/presentation-core-interop";
 *
 * const imodel: IModelConnection = getIModel();
 * const schemaProvider = createECSchemaProvider(imodel.schemaContext);
 * // the created schema provider may be used in `@itwin/presentation-hierarchies` and other Presentation packages
 * ```
 *
 * @public
 */
export function createECSchemaProvider(schemaContext: CoreSchemaContext): ECSchemaProvider;

/**
 * Creates an `ECSchemaProvider` for a given [SchemaView](https://www.itwinjs.org/reference/ecschema-metadata/context/schemaview/).
 *
 * Usage example:
 *
 * ```ts
 * import { IModelConnection } from "@itwin/core-frontend";
 * import { createECSchemaProvider } from "@itwin/presentation-core-interop";
 *
 * const imodel: IModelConnection = getIModel();
 * const schemaProvider = createECSchemaProvider(await imodel.getSchemaView());
 * // the created schema provider may be used in `@itwin/presentation-hierarchies` and other Presentation packages
 * ```
 *
 * @beta
 */
export function createECSchemaProvider(schemaView: PublicSchemaView): ECSchemaProvider;

export function createECSchemaProvider(input: CoreSchemaContext | PublicSchemaView): ECSchemaProvider {
  if (isSchemaView(input)) {
    return createECSchemaProviderFromSchemaView(input);
  }
  return createECSchemaProviderFromSchemaContext(input);
}

type PublicSchemaView = Props<typeof createECSchemaProviderFromSchemaView>;
function isSchemaView(input: CoreSchemaContext | PublicSchemaView): input is PublicSchemaView {
  return "schemaToken" in input;
}

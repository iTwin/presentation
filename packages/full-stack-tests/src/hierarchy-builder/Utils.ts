/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { HierarchyProvider, IHierarchyLevelDefinitionsFactory } from "@itwin/presentation-hierarchy-builder";

export function createProvider(props: { imodel: IModelConnection; hierarchy: IHierarchyLevelDefinitionsFactory }) {
  const { imodel, hierarchy } = props;
  const schemas = new SchemaContext();
  schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
  const metadataProvider = createMetadataProvider(schemas);
  return new HierarchyProvider({
    metadataProvider,
    hierarchyDefinition: hierarchy,
    queryExecutor: createECSqlQueryExecutor(imodel),
  });
}

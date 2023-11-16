/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSqlQueryExecutor, createMetadataProvider as createMetadataProviderInterop } from "@itwin/presentation-core-interop";
import {
  HierarchyNodeIdentifiersPath,
  HierarchyProvider,
  IHierarchyLevelDefinitionsFactory,
  IPrimitiveValueFormatter,
} from "@itwin/presentation-hierarchy-builder";

function createSchemaContext(imodel: IModelConnection) {
  const schemas = new SchemaContext();
  schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
  return schemas;
}

export function createMetadataProvider(imodel: IModelConnection) {
  return createMetadataProviderInterop(createSchemaContext(imodel));
}

export function createProvider(props: {
  imodel: IModelConnection;
  hierarchy: IHierarchyLevelDefinitionsFactory;
  formatterFactory?: (schemas: SchemaContext) => IPrimitiveValueFormatter;
  filteredNodePaths?: HierarchyNodeIdentifiersPath[];
}) {
  const { imodel, hierarchy, formatterFactory, filteredNodePaths } = props;
  return new HierarchyProvider({
    metadataProvider: createMetadataProvider(imodel),
    hierarchyDefinition: hierarchy,
    queryExecutor: createECSqlQueryExecutor(imodel),
    formatter: formatterFactory ? formatterFactory(createSchemaContext(imodel)) : undefined,
    filtering: filteredNodePaths ? { paths: filteredNodePaths } : undefined,
  });
}

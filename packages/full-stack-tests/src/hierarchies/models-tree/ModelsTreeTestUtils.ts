/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { createLimitingECSqlQueryExecutor, HierarchyNodeIdentifiersPath, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { TestIModelBuilder } from "@itwin/presentation-testing";
import { importSchema } from "../../IModelUtils";

export function createModelsTreeProvider(imodel: IModelConnection, filteredNodePaths?: HierarchyNodeIdentifiersPath[]) {
  const schemas = new SchemaContext();
  schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
  const metadataProvider = createMetadataProvider(schemas);
  return new HierarchyProvider({
    metadataProvider,
    queryExecutor: createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
    hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider }),
    ...(filteredNodePaths ? { filtering: { paths: filteredNodePaths } } : undefined),
  });
}

export async function importTestSchema(mochaContext: Mocha.Context, builder: TestIModelBuilder) {
  return importSchema(
    mochaContext,
    builder,
    `
      <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
      <ECEntityClass typeName="TestPhysicalObject" displayLabel="Test Physical Object" modifier="Sealed" description="Similar to generic:PhysicalObject but also sub-modelable.">
        <BaseClass>bis:PhysicalElement</BaseClass>
        <BaseClass>bis:ISubModeledElement</BaseClass>
      </ECEntityClass>
    `,
  );
}

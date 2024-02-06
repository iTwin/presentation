/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECDb, IModelDb } from "@itwin/core-backend";
import { IModelConnection } from "@itwin/core-frontend";
import { Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSqlQueryExecutor, createMetadataProvider as createMetadataProviderInterop } from "@itwin/presentation-core-interop";
import {
  createLimitingECSqlQueryExecutor, HierarchyNodeIdentifiersPath, HierarchyProvider, HierarchyProviderLocalizedStrings,
  IHierarchyLevelDefinitionsFactory, IPrimitiveValueFormatter, parseFullClassName,
} from "@itwin/presentation-hierarchy-builder";

function createSchemaContext(imodel: IModelConnection | IModelDb | ECDb) {
  const schemas = new SchemaContext();
  if (imodel instanceof IModelConnection) {
    schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
  } else {
    schemas.addLocater({
      getSchemaSync<T extends Schema>(_schemaKey: Readonly<SchemaKey>, _matchType: SchemaMatchType, _schemaContext: SchemaContext): T | undefined {
        throw new Error(`getSchemaSync not implemented`);
      },
      async getSchemaInfo(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<SchemaInfo | undefined> {
        const schemaJson = imodel.getSchemaProps(schemaKey.name);
        const schemaInfo = await Schema.startLoadingFromJson(schemaJson, schemaContext);
        if (schemaInfo !== undefined && schemaInfo.schemaKey.matches(schemaKey, matchType)) {
          return schemaInfo;
        }
        return undefined;
      },
      async getSchema<T extends Schema>(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<T | undefined> {
        await this.getSchemaInfo(schemaKey, matchType, schemaContext);
        // eslint-disable-next-line @itwin/no-internal
        const schema = await schemaContext.getCachedSchema(schemaKey, matchType);
        return schema as T;
      },
    });
  }
  return schemas;
}

export function createMetadataProvider(imodel: IModelConnection | IModelDb | ECDb) {
  return createMetadataProviderInterop(createSchemaContext(imodel));
}

export function createProvider(props: {
  imodel: IModelConnection | IModelDb | ECDb;
  hierarchy: IHierarchyLevelDefinitionsFactory;
  formatterFactory?: (schemas: SchemaContext) => IPrimitiveValueFormatter;
  localizedStrings?: HierarchyProviderLocalizedStrings;
  filteredNodePaths?: HierarchyNodeIdentifiersPath[];
}) {
  const { imodel, hierarchy, formatterFactory, localizedStrings, filteredNodePaths } = props;
  return new HierarchyProvider({
    metadataProvider: createMetadataProvider(imodel),
    hierarchyDefinition: hierarchy,
    queryExecutor: createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 123),
    formatter: formatterFactory ? formatterFactory(createSchemaContext(imodel)) : undefined,
    localizedStrings,
    filtering: filteredNodePaths ? { paths: filteredNodePaths } : undefined,
  });
}

export function createClassECSqlSelector(fullClassName: string) {
  const { schemaName, className } = parseFullClassName(fullClassName);
  return `[${schemaName}].[${className}]`;
}

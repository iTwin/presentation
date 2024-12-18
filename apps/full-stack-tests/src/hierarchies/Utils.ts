/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECDb, IModelDb } from "@itwin/core-backend";
import { IModelConnection } from "@itwin/core-frontend";
import { Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSchemaProvider as createECSchemaProviderInterop, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createIModelHierarchyProvider, createLimitingECSqlQueryExecutor, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import { createCachingECClassHierarchyInspector, Event, IPrimitiveValueFormatter, parseFullClassName, Props } from "@itwin/presentation-shared";

type HierarchyProviderProps = Props<typeof createIModelHierarchyProvider>;
type HierarchyFilteringPaths = NonNullable<NonNullable<HierarchyProviderProps["filtering"]>["paths"]>;

export function createSchemaContext(imodel: IModelConnection | IModelDb | ECDb) {
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

export function createIModelAccess(imodel: IModelConnection | IModelDb | ECDb) {
  const schemaProvider = createECSchemaProviderInterop(createSchemaContext(imodel));
  const classHierarchyInspector = createCachingECClassHierarchyInspector({ schemaProvider });
  const queryExecutor = createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 123);
  return {
    imodelKey: imodel instanceof IModelConnection || imodel instanceof IModelDb ? createIModelKey(imodel) : "ecdb",
    ...schemaProvider,
    ...classHierarchyInspector,
    ...queryExecutor,
  };
}

export function createProvider(
  props: (
    | {
        imodelAccess: ReturnType<typeof createIModelAccess>;
        imodelChanged?: Event<() => void>;
        hierarchy: HierarchyDefinition;
        localizedStrings?: Props<typeof createIModelHierarchyProvider>["localizedStrings"];
        filteredNodePaths?: HierarchyFilteringPaths;
        queryCacheSize?: number;
      }
    | {
        imodel: IModelConnection | IModelDb | ECDb;
        formatterFactory?: (schemas: SchemaContext) => IPrimitiveValueFormatter;
      }
  ) & {
    imodelChanged?: Event<() => void>;
    hierarchy: HierarchyDefinition;
    localizedStrings?: Props<typeof createIModelHierarchyProvider>["localizedStrings"];
    filteredNodePaths?: HierarchyFilteringPaths;
    queryCacheSize?: number;
  },
) {
  const { imodelChanged, hierarchy, localizedStrings, filteredNodePaths, queryCacheSize } = props;
  const formatter = "imodel" in props && props.formatterFactory ? props.formatterFactory(createSchemaContext(props.imodel)) : undefined;
  return createIModelHierarchyProvider({
    imodelAccess: "imodelAccess" in props ? props.imodelAccess : createIModelAccess(props.imodel),
    imodelChanged,
    hierarchyDefinition: hierarchy,
    formatter,
    localizedStrings,
    filtering: filteredNodePaths ? { paths: filteredNodePaths } : undefined,
    queryCacheSize: queryCacheSize ?? 0,
  });
}

export function createClassECSqlSelector(fullClassName: string) {
  const { schemaName, className } = parseFullClassName(fullClassName);
  return `[${schemaName}].[${className}]`;
}

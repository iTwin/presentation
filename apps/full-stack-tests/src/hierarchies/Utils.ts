/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECDb, IModelDb } from "@itwin/core-backend";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { createECSchemaProvider as createECSchemaProviderInterop, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createIModelHierarchyProvider, createLimitingECSqlQueryExecutor, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import { createCachingECClassHierarchyInspector, Event, IPrimitiveValueFormatter, parseFullClassName, Props } from "@itwin/presentation-shared";
import { createSchemaContext } from "../IModelUtils.js";

type HierarchyProviderProps = Props<typeof createIModelHierarchyProvider>;
type HierarchyFilteringPaths = NonNullable<NonNullable<HierarchyProviderProps["filtering"]>["paths"]>;

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

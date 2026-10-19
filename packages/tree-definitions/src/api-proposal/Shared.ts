/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

export interface ClassificationsTreeHierarchyConfiguration {
  rootClassificationSystemCode: string;
  elements?: {
    excludedClasses?: readonly string[];
  };
}

interface ClassificationsTreeDefinitionProps {
  imodelAccess: any;
  idsProvider: ClassificationsTreeIdsProvider;
  hierarchyConfig: ClassificationsTreeHierarchyConfiguration;
}
export class ClassificationsTreeDefinition {
  public constructor(_props: ClassificationsTreeDefinitionProps) {
  }
  public static async createInstanceKeyPaths(_props: any) {}
  public static async createSearchTree(_props: any) {}
}

interface ClassificationsTreeIdsProviderProps {
  imodelAccess: any;
  hierarchyConfig: Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode">;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClassificationsTreeIdsProvider {
}
export function createClassificationsTreeIdsProvider(_props: ClassificationsTreeIdsProviderProps): ClassificationsTreeIdsProvider {
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SharedIdsProvider {
}
export function createSharedIdsProvider(_props: { imodelAccess: any, hierarchyConfig: Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode"> }): SharedIdsProvider {
  return 0;
}
export function useSharedTreeContext() {
  return {
    getSharedIdsProvider: (props: { imodelAccess: any, hierarchyConfig: Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode"> }) => {
      // this would be cached:
      return createSharedIdsProvider(props);
    },
    getCachedIdsProvider: <TCache>(props: { imodelAccess: any, factory: () => TCache; cacheKey: string }) => {
      // this would be cached:
      return props.factory();
    },
  };
}

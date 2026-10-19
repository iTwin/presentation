/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ClassificationsTreeHierarchyConfiguration, ClassificationsTreeIdsProvider, SharedIdsProvider } from "./Shared.js";
import { ClassificationsTreeDefinition, createClassificationsTreeIdsProvider, createSharedIdsProvider } from "./Shared.js";


interface ClassificationsTreeProps {
  hierarchyConfig: ClassificationsTreeHierarchyConfiguration;
  imodelAccess: any;

  getIdsProvider?: (props: {
    sharedIdsProvider: SharedIdsProvider;
    hierarchyConfig: Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode">;
    imodelAccess: any;
    createDefault: () => ClassificationsTreeIdsProvider
  }) => ClassificationsTreeIdsProvider;

  getSharedIdsProvider?: (props: {
    hierarchyConfig: Pick<ClassificationsTreeHierarchyConfiguration, "rootClassificationSystemCode">;
    imodelAccess: any;
    createDefault: () => SharedIdsProvider
  }) => SharedIdsProvider;
}

export function createClassificationsTree(props: ClassificationsTreeProps) {
  let _sharedIdsProvider: SharedIdsProvider | undefined;
  const createDefaultSharedIdsProvider = () => createSharedIdsProvider({ imodelAccess: props.imodelAccess, hierarchyConfig: props.hierarchyConfig });
  const getSharedIdsProviderOnce = () => {
    if (!_sharedIdsProvider) {
      _sharedIdsProvider = props.getSharedIdsProvider
        ? props.getSharedIdsProvider({ hierarchyConfig: props.hierarchyConfig, imodelAccess: props.imodelAccess, createDefault: createDefaultSharedIdsProvider })
        : createDefaultSharedIdsProvider();
    }
    return _sharedIdsProvider;
  };

  let _idsProvider: ClassificationsTreeIdsProvider | undefined;
  const createDefaultClassificationsTreeIdsProvider = () => createClassificationsTreeIdsProvider({ imodelAccess: props.imodelAccess, hierarchyConfig: props.hierarchyConfig });
  const getIdsProviderOnce = () => {
    if (!_idsProvider) {
      _idsProvider = props.getIdsProvider
        ? props.getIdsProvider({ sharedIdsProvider: getSharedIdsProviderOnce(), hierarchyConfig: props.hierarchyConfig, imodelAccess: props.imodelAccess, createDefault: createDefaultClassificationsTreeIdsProvider })
        : createDefaultClassificationsTreeIdsProvider();
    }
    return _idsProvider;
  };

  return {
    getHierarchyDefinition: () =>
      new ClassificationsTreeDefinition({
        hierarchyConfig: props.hierarchyConfig,
        imodelAccess: props.imodelAccess,
        idsProvider: getIdsProviderOnce(),
      }),
    createInstanceKeyPaths: async (searchProps: ClassificationsTreeSearchProps) =>
      ClassificationsTreeDefinition.createInstanceKeyPaths({
        ...searchProps,
        idsProvider: getIdsProviderOnce(),
      }),
    createSearchTree: async (searchProps: ClassificationsTreeSearchProps & { revealTargets?: boolean }) =>
      ClassificationsTreeDefinition.createSearchTree({
        ...searchProps,
        idsProvider: getIdsProviderOnce(),
      }),
  }
}

interface ClassificationsTreeSearchProps {
  imodelAccess: any;
  idsProvider: ClassificationsTreeIdsProvider;
}

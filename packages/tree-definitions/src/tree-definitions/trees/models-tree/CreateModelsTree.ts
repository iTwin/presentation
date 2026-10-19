/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid } from "@itwin/core-bentley";
import { createSharedIdsProvider } from "../../shared/idsProviders/SharedIdsProvider.js";
import { getOrCreate, mergeWithDefaults, validateIdsProviderConfig } from "../../shared/Utils.js";
import { defaultHierarchyConfiguration, ModelsTreeDefinition } from "./ModelsTreeDefinition.js";
import { createModelsTreeIdsProvider, createModelsTreeIdsProviderConfig } from "./ModelsTreeIdsProvider.js";

import type { GuidString } from "@itwin/core-bentley";
import type { HierarchyDefinition, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider, InstanceKey } from "@itwin/presentation-shared";
import type {
  ElementsGroupInfo,
  ModelsTreeHierarchyConfiguration,
  ModelsTreeSearchOptions,
} from "./ModelsTreeDefinition.js";
import type { ModelsTreeIdsProvider } from "./ModelsTreeIdsProvider.js";

/**
 * Provider resolution and configuration for a models hierarchy.
 * @beta
 */
interface ModelsTreeProps {
  /**
   * Returns the ID provider for `imodelKey`, with matching element filters and hierarchy configuration.
   * Different iModel versions need separate providers. Created internally for each iModel when omitted.
   * Configuration is validated when the provider is first resolved for each iModel.
   */
  getIdsProvider?: (imodelKey: string) => ModelsTreeIdsProvider;
  /** Hierarchy options. Omitted properties use the documented defaults. */
  hierarchyConfig?: ModelsTreeHierarchyConfiguration;
  /** Identifier used in query restart tokens. Defaults to a generated GUID. */
  uniqueId?: GuidString;
}

/**
 * Schema and query access for a specific iModel version used by models hierarchy definitions and searches.
 * @beta
 */
type ModelsTreeIModelAccess = ECSchemaProvider & LimitingECSqlQueryExecutor & { imodelKey: string };

/**
 * Search-specific data access and options for a models tree.
 * @beta
 */
type ModelsTreeSearchProps = ModelsTreeSearchOptions & {
  /** Access to the iModel version to search. Shares its ID provider with hierarchy definitions using the same key. */
  imodelAccess: ModelsTreeIModelAccess;
} & ({ targetItems: Array<InstanceKey | ElementsGroupInfo> } | { label: string });

/**
 * Creates a models hierarchy definition factory and search helpers that share hierarchy configuration and a unique ID.
 * Creates and shares cached ID providers using the resolved hierarchy configuration.
 *
 * Supply `getIdsProvider` to share externally owned, iModel-specific providers with hierarchy and search.
 *
 * Pass the returned `getHierarchyDefinition` to `createMergedIModelHierarchyProvider`, or call it with an
 * iModel's access to obtain a definition for `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 * @beta
 */
export function createModelsTree(props: ModelsTreeProps = {}) {
  const hierarchyConfig = mergeWithDefaults({
    defaults: defaultHierarchyConfiguration,
    overrides: props.hierarchyConfig,
  });
  hierarchyConfig.elements = {
    ...hierarchyConfig.elements,
    excludedClasses: [...hierarchyConfig.elements.excludedClasses],
  };
  const idsProviderConfig = createModelsTreeIdsProviderConfig(hierarchyConfig);
  const idsProviders = new Map<string, ModelsTreeIdsProvider>();
  const getIdsProvider = (imodelAccess: ModelsTreeIModelAccess) =>
    getOrCreate({
      map: idsProviders,
      createFunc: () => {
        const provider =
          props.getIdsProvider?.(imodelAccess.imodelKey) ??
          createModelsTreeIdsProvider({
            imodelAccess,
            hierarchyConfig,
            sharedIdsProvider: createSharedIdsProvider({
              imodelAccess,
              elementClassName: hierarchyConfig.elements.baseClass,
              excludedElementClassNames: hierarchyConfig.elements.excludedClasses,
            }),
          });
        validateIdsProviderConfig(createModelsTreeIdsProviderConfig(provider.config), idsProviderConfig, "Models tree");
        return provider;
      },
      key: imodelAccess.imodelKey,
    });
  const sharedProps = { hierarchyConfig, uniqueId: props.uniqueId ?? Guid.createValue() };
  return {
    /**
     * Creates a hierarchy definition bound to the supplied iModel's schema access and ID provider.
     * @throws An error if the ID provider configuration does not match the tree configuration.
     */
    getHierarchyDefinition: (imodelAccess: ModelsTreeIModelAccess): HierarchyDefinition =>
      new ModelsTreeDefinition({ ...sharedProps, imodelAccess, idsProvider: getIdsProvider(imodelAccess) }),
    /**
     * Yields hierarchy paths to instances or grouping nodes matching the supplied search.
     * @throws An error if the configured search limit is exceeded.
     * @throws An error if the ID provider configuration does not match the tree configuration.
     */
    createInstanceKeyPaths: (searchProps: ModelsTreeSearchProps) =>
      ModelsTreeDefinition.createInstanceKeyPaths({
        ...searchProps,
        ...sharedProps,
        idsProvider: getIdsProvider(searchProps.imodelAccess),
      }),
    /**
     * Builds search paths for a hierarchy provider. Set `revealTargets` to expand ancestors of matching targets.
     * @throws An error if the configured search limit is exceeded.
     * @throws An error if the ID provider configuration does not match the tree configuration.
     */
    createSearchTree: async (searchProps: ModelsTreeSearchProps & { revealTargets?: boolean }) =>
      ModelsTreeDefinition.createSearchTree({
        ...searchProps,
        ...sharedProps,
        idsProvider: getIdsProvider(searchProps.imodelAccess),
      }),
  };
}

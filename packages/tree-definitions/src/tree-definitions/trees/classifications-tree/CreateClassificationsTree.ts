/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid } from "@itwin/core-bentley";
import { getOrCreate, validateIdsProviderConfig } from "../../shared/Utils.js";
import { ClassificationsTreeDefinition } from "./ClassificationsTreeDefinition.js";
import {
  createClassificationsTreeIdsProvider,
  createClassificationsTreeIdsProviderConfig,
} from "./ClassificationsTreeIdsProvider.js";

import type { GuidString } from "@itwin/core-bentley";
import type { HierarchyDefinition, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider, InstanceKey } from "@itwin/presentation-shared";
import type {
  ClassificationsTreeHierarchyConfiguration,
  ClassificationsTreeSearchOptions,
} from "./ClassificationsTreeDefinition.js";
import type { ClassificationsTreeIdsProvider } from "./ClassificationsTreeIdsProvider.js";

/**
 * Provider resolution and classification system configuration for a classifications hierarchy.
 * @beta
 */
interface ClassificationsTreeProps {
  /**
   * Returns the ID provider for the supplied iModel access, with a matching classification system.
   * Called once per `imodelKey` with the first access supplied for that key; different iModel versions need separate providers.
   * Created internally for each iModel when omitted. Configuration is validated when the provider is first resolved for each iModel.
   */
  getIdsProvider?: (imodelAccess: ClassificationsTreeIModelAccess) => ClassificationsTreeIdsProvider;
  /** Configuration shared by hierarchy definitions and searches. */
  hierarchyConfig: ClassificationsTreeHierarchyConfiguration;
  /** Identifier used in query restart tokens. Defaults to a generated GUID. */
  uniqueId?: GuidString;
}

/**
 * Schema and query access for a specific iModel version used by classifications hierarchy definitions and searches.
 * @beta
 */
type ClassificationsTreeIModelAccess = ECSchemaProvider & LimitingECSqlQueryExecutor & { imodelKey: string };

/**
 * Search-specific data access and options for a classifications tree.
 * @beta
 */
type ClassificationsTreeSearchProps = ClassificationsTreeSearchOptions & {
  /** Access to the iModel version to search. Shares its ID provider with hierarchy definitions using the same key. */
  imodelAccess: ClassificationsTreeIModelAccess;
} & ({ label: string } | { targetItems: Array<InstanceKey> });

/**
 * Creates a classifications hierarchy definition factory and search helpers that share hierarchy configuration and a unique ID.
 *
 * Supply `getIdsProvider` to share externally owned, iModel-specific providers with hierarchy and search.
 *
 * Pass the returned `getHierarchyDefinition` to `createMergedIModelHierarchyProvider`, or call it with an
 * iModel's access to obtain a definition for `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 * @beta
 */
export function createClassificationsTree(props: ClassificationsTreeProps) {
  const hierarchyConfig = {
    ...props.hierarchyConfig,
    elements: { excludedClasses: [...new Set(props.hierarchyConfig.elements?.excludedClasses ?? [])].sort() },
  };
  const idsProviderConfig = createClassificationsTreeIdsProviderConfig(hierarchyConfig);
  const idsProviders = new Map<string, ClassificationsTreeIdsProvider>();
  const getIdsProvider = (imodelAccess: ClassificationsTreeIModelAccess) =>
    getOrCreate({
      map: idsProviders,
      createFunc: () => {
        const provider =
          props.getIdsProvider?.(imodelAccess) ??
          createClassificationsTreeIdsProvider({ imodelAccess, hierarchyConfig });
        validateIdsProviderConfig(
          createClassificationsTreeIdsProviderConfig(provider.config),
          idsProviderConfig,
          "Classifications tree",
        );
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
    getHierarchyDefinition: (imodelAccess: ClassificationsTreeIModelAccess): HierarchyDefinition =>
      new ClassificationsTreeDefinition({ ...sharedProps, imodelAccess, idsProvider: getIdsProvider(imodelAccess) }),
    /**
     * Yields hierarchy paths to instances matching the supplied label or instance keys.
     * @throws An error if the configured search limit is exceeded.
     * @throws An error if the ID provider configuration does not match the tree configuration.
     */
    createInstanceKeyPaths: (searchProps: ClassificationsTreeSearchProps) =>
      ClassificationsTreeDefinition.createInstanceKeyPaths({
        ...searchProps,
        ...sharedProps,
        idsProvider: getIdsProvider(searchProps.imodelAccess),
      }),
    /**
     * Builds search paths for a hierarchy provider. Set `revealTargets` to expand ancestors of matching targets.
     * @throws An error if the configured search limit is exceeded.
     * @throws An error if the ID provider configuration does not match the tree configuration.
     */
    createSearchTree: async (searchProps: ClassificationsTreeSearchProps & { revealTargets?: boolean }) =>
      ClassificationsTreeDefinition.createSearchTree({
        ...searchProps,
        ...sharedProps,
        idsProvider: getIdsProvider(searchProps.imodelAccess),
      }),
  };
}

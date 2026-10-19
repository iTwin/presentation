/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid } from "@itwin/core-bentley";
import { createSharedIdsProvider } from "../../shared/idsProviders/SharedIdsProvider.js";
import { getClassesByView, getOrCreate, mergeWithDefaults, validateIdsProviderConfig } from "../../shared/Utils.js";
import { CategoriesTreeDefinition, defaultHierarchyConfiguration } from "./CategoriesTreeDefinition.js";
import { createCategoriesTreeIdsProvider, createCategoriesTreeIdsProviderConfig } from "./CategoriesTreeIdsProvider.js";

import type { GuidString } from "@itwin/core-bentley";
import type { HierarchyDefinition, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider } from "@itwin/presentation-shared";
import type { CategoriesTreeHierarchyConfiguration, CategoriesTreeSearchOptions } from "./CategoriesTreeDefinition.js";
import type { CategoriesTreeIdsProvider } from "./CategoriesTreeIdsProvider.js";

/**
 * Provider resolution, view type, and configuration for a categories hierarchy.
 * @beta
 */
interface CategoriesTreeProps {
  /**
   * Returns the ID provider for `imodelKey`, with matching view type and element filters.
   * Different iModel versions need separate providers. Created internally for each iModel when omitted.
   * Configuration is validated when the provider is first resolved for each iModel.
   */
  getIdsProvider?: (imodelKey: string) => CategoriesTreeIdsProvider;
  viewType: "2d" | "3d";
  /** Hierarchy options. Omitted properties use the documented defaults. */
  hierarchyConfig?: CategoriesTreeHierarchyConfiguration;
  /** Identifier used in query restart tokens. Defaults to a generated GUID. */
  uniqueId?: GuidString;
}

/**
 * Schema and query access for a specific iModel version used by categories hierarchy definitions and searches.
 * @beta
 */
type CategoriesTreeIModelAccess = ECSchemaProvider & LimitingECSqlQueryExecutor & { imodelKey: string };

/**
 * Search-specific data access and options for a categories tree.
 * @beta
 */
interface CategoriesTreeSearchProps extends CategoriesTreeSearchOptions {
  /** Access to the iModel version to search. Shares its ID provider with hierarchy definitions using the same key. */
  imodelAccess: CategoriesTreeIModelAccess;
  /** Substring of the instance label to search for. */
  label: string;
}

/**
 * Creates a categories hierarchy definition factory and label search helpers that share hierarchy configuration and a unique ID.
 * Creates and shares cached ID providers for the specified view type using the resolved hierarchy configuration.
 *
 * Supply `getIdsProvider` to share externally owned, iModel-specific providers with hierarchy and search.
 *
 * Pass the returned `getHierarchyDefinition` to `createMergedIModelHierarchyProvider`, or call it with an
 * iModel's access to obtain a definition for `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 * @beta
 */
export function createCategoriesTree(props: CategoriesTreeProps) {
  const hierarchyConfig = mergeWithDefaults({
    defaults: defaultHierarchyConfiguration,
    overrides: props.hierarchyConfig,
  });
  const idsProviderConfig = createCategoriesTreeIdsProviderConfig({
    type: props.viewType,
    elementClassName: getClassesByView(props.viewType).elementClass,
    excludedElementClassNames:
      props.hierarchyConfig?.elements?.nodes === "include" ? props.hierarchyConfig.elements.excludedClasses : undefined,
  });
  if (hierarchyConfig.elements.nodes === "include") {
    hierarchyConfig.elements = {
      ...hierarchyConfig.elements,
      excludedClasses: [...idsProviderConfig.excludedElementClassNames],
    };
  }
  const idsProviders = new Map<string, CategoriesTreeIdsProvider>();
  const getIdsProvider = (imodelAccess: CategoriesTreeIModelAccess) =>
    getOrCreate({
      map: idsProviders,
      createFunc: () => {
        const provider =
          props.getIdsProvider?.(imodelAccess.imodelKey) ??
          createCategoriesTreeIdsProvider({
            imodelAccess,
            type: props.viewType,
            sharedIdsProvider: createSharedIdsProvider({ imodelAccess, ...idsProviderConfig }),
          });
        validateIdsProviderConfig(
          createCategoriesTreeIdsProviderConfig(provider.config),
          idsProviderConfig,
          "Categories tree",
        );
        return provider;
      },
      key: imodelAccess.imodelKey,
    });
  const sharedProps = { viewType: props.viewType, hierarchyConfig, uniqueId: props.uniqueId ?? Guid.createValue() };
  return {
    /**
     * Creates a hierarchy definition bound to the supplied iModel's schema access and ID provider.
     * @throws An error if the ID provider configuration does not match the tree configuration.
     */
    getHierarchyDefinition: (imodelAccess: CategoriesTreeIModelAccess): HierarchyDefinition =>
      new CategoriesTreeDefinition({ ...sharedProps, imodelAccess, idsProvider: getIdsProvider(imodelAccess) }),
    /**
     * Yields hierarchy paths to instances whose labels contain the supplied text.
     * @throws An error if the configured search limit is exceeded.
     * @throws An error if the ID provider configuration does not match the tree configuration.
     */
    createInstanceKeyPaths: (searchProps: CategoriesTreeSearchProps) =>
      CategoriesTreeDefinition.createInstanceKeyPaths({
        ...searchProps,
        ...sharedProps,
        idsProvider: getIdsProvider(searchProps.imodelAccess),
      }),
    /**
     * Builds search paths for a hierarchy provider. Set `revealTargets` to expand ancestors of matching targets.
     * @throws An error if the configured search limit is exceeded.
     * @throws An error if the ID provider configuration does not match the tree configuration.
     */
    createSearchTree: async (searchProps: CategoriesTreeSearchProps & { revealTargets?: boolean }) =>
      CategoriesTreeDefinition.createSearchTree({
        ...searchProps,
        ...sharedProps,
        idsProvider: getIdsProvider(searchProps.imodelAccess),
      }),
  };
}

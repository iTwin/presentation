/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid } from "@itwin/core-bentley";
import { createSharedIdsProvider } from "../../shared/idsProviders/SharedIdsProvider.js";
import { getClassesByView, mergeWithDefaults, validateIdsProviderConfig } from "../../shared/Utils.js";
import { CategoriesTreeDefinition, defaultHierarchyConfiguration } from "./CategoriesTreeDefinition.js";
import { createCategoriesTreeIdsProvider, createCategoriesTreeIdsProviderConfig } from "./CategoriesTreeIdsProvider.js";

import type { GuidString } from "@itwin/core-bentley";
import type { HierarchyDefinition, LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider } from "@itwin/presentation-shared";
import type { CategoriesTreeHierarchyConfiguration, CategoriesTreeSearchOptions } from "./CategoriesTreeDefinition.js";
import type { CategoriesTreeIdsProvider } from "./CategoriesTreeIdsProvider.js";

/**
 * iModel access, ID provider, view type, and configuration for a categories hierarchy.
 * @beta
 */
interface CategoriesTreeProps {
  /** Schema and query access for the iModel used by the hierarchy definition and searches. */
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor & { imodelKey: string };
  /**
   * ID provider for the iModel accessed through `imodelAccess`, with matching view type and element filters.
   * Created internally when omitted. Throws if its configuration does not match the tree configuration.
   */
  idsProvider?: CategoriesTreeIdsProvider;
  viewType: "2d" | "3d";
  /** Hierarchy options. Omitted properties use the documented defaults. */
  hierarchyConfig?: CategoriesTreeHierarchyConfiguration;
  /** Identifier used in query restart tokens. Defaults to a generated GUID. */
  uniqueId?: GuidString;
}

/**
 * Search-specific data access and options for a categories tree.
 * @beta
 */
interface CategoriesTreeSearchProps extends CategoriesTreeSearchOptions {
  /** Substring of the instance label to search for. */
  label: string;
}

/**
 * Creates a categories hierarchy definition and label search helpers that share hierarchy configuration and a unique ID.
 *
 * Supply `idsProvider` to share an externally owned provider with hierarchy and search.
 *
 * Pass the returned `hierarchyDefinition` to `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 * @throws An error if the supplied ID provider configuration does not match the tree configuration.
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
      hierarchyConfig.elements.nodes === "include" ? hierarchyConfig.elements.excludedClasses : undefined,
  });
  if (hierarchyConfig.elements.nodes === "include") {
    hierarchyConfig.elements = {
      ...hierarchyConfig.elements,
      excludedClasses: [...idsProviderConfig.excludedElementClassNames],
    };
  }
  const idsProvider =
    props.idsProvider ??
    createCategoriesTreeIdsProvider({
      imodelAccess: props.imodelAccess,
      type: props.viewType,
      sharedIdsProvider: createSharedIdsProvider({ imodelAccess: props.imodelAccess, ...idsProviderConfig }),
    });
  validateIdsProviderConfig(
    createCategoriesTreeIdsProviderConfig(idsProvider.config),
    idsProviderConfig,
    "Categories tree",
  );
  const uniqueId = props.uniqueId ?? Guid.createValue();
  const hierarchyDefinition: HierarchyDefinition = new CategoriesTreeDefinition({
    imodelAccess: props.imodelAccess,
    viewType: props.viewType,
    hierarchyConfig,
    idsProvider,
    uniqueId,
  });
  return {
    /** Hierarchy definition bound to the supplied iModel access and ID provider. */
    hierarchyDefinition,
    /**
     * Yields hierarchy paths to instances whose labels contain the supplied text.
     * @throws An error if the configured search limit is exceeded.
     */
    createInstanceKeyPaths: (searchProps: CategoriesTreeSearchProps) =>
      CategoriesTreeDefinition.createInstanceKeyPaths({
        ...searchProps,
        viewType: props.viewType,
        hierarchyConfig,
        idsProvider,
        uniqueId,
        imodelAccess: props.imodelAccess,
      }),
    /**
     * Builds search paths for a hierarchy provider. Set `revealTargets` to expand ancestors of matching targets.
     * @throws An error if the configured search limit is exceeded.
     */
    createSearchTree: async (searchProps: CategoriesTreeSearchProps & { revealTargets?: boolean }) =>
      CategoriesTreeDefinition.createSearchTree({
        ...searchProps,
        viewType: props.viewType,
        hierarchyConfig,
        idsProvider,
        uniqueId,
        imodelAccess: props.imodelAccess,
      }),
  };
}

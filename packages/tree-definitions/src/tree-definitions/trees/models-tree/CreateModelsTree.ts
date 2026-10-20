/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid } from "@itwin/core-bentley";
import { createSharedIdsProvider } from "../../shared/idsProviders/SharedIdsProvider.js";
import { mergeWithDefaults, validateIdsProviderConfig } from "../../shared/Utils.js";
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
 * iModel access, ID provider, and configuration for a models hierarchy.
 * @beta
 */
interface ModelsTreeProps {
  /** Schema and query access for the iModel used by the hierarchy definition and searches. */
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor & { imodelKey: string };
  /**
   * ID provider for the iModel accessed through `imodelAccess`, with matching element filters and hierarchy configuration.
   * Created internally when omitted. Throws if its configuration does not match the tree configuration.
   */
  idsProvider?: ModelsTreeIdsProvider;
  /** Hierarchy options. Omitted properties use the documented defaults. */
  hierarchyConfig?: ModelsTreeHierarchyConfiguration;
  /** Identifier used in query restart tokens. Defaults to a generated GUID. */
  uniqueId?: GuidString;
}

/**
 * Search-specific data access and options for a models tree.
 * @beta
 */
type ModelsTreeSearchProps = ModelsTreeSearchOptions &
  ({ targetItems: Array<InstanceKey | ElementsGroupInfo> } | { label: string });

/**
 * Creates a models hierarchy definition and search helpers that share hierarchy configuration and a unique ID.
 *
 * Supply `idsProvider` to share an externally owned provider with hierarchy and search.
 *
 * Pass the returned `hierarchyDefinition` to `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 * @throws An error if the supplied ID provider configuration does not match the tree configuration.
 * @beta
 */
export function createModelsTree(props: ModelsTreeProps) {
  const hierarchyConfig = mergeWithDefaults({
    defaults: defaultHierarchyConfiguration,
    overrides: props.hierarchyConfig,
  });
  hierarchyConfig.elements = {
    ...hierarchyConfig.elements,
    excludedClasses: [...hierarchyConfig.elements.excludedClasses],
  };
  const idsProviderConfig = createModelsTreeIdsProviderConfig(hierarchyConfig);
  const idsProvider =
    props.idsProvider ??
    createModelsTreeIdsProvider({
      imodelAccess: props.imodelAccess,
      hierarchyConfig,
      sharedIdsProvider: createSharedIdsProvider({
        imodelAccess: props.imodelAccess,
        elementClassName: hierarchyConfig.elements.baseClass,
        excludedElementClassNames: hierarchyConfig.elements.excludedClasses,
      }),
    });
  validateIdsProviderConfig(createModelsTreeIdsProviderConfig(idsProvider.config), idsProviderConfig, "Models tree");
  const uniqueId = props.uniqueId ?? Guid.createValue();
  const hierarchyDefinition: HierarchyDefinition = new ModelsTreeDefinition({
    imodelAccess: props.imodelAccess,
    hierarchyConfig,
    idsProvider,
    uniqueId,
  });
  return {
    /** Hierarchy definition bound to the supplied iModel access and ID provider. */
    hierarchyDefinition,
    /**
     * Yields hierarchy paths to instances or grouping nodes matching the supplied search.
     * @throws An error if the configured search limit is exceeded.
     */
    createInstanceKeyPaths: (searchProps: ModelsTreeSearchProps) =>
      ModelsTreeDefinition.createInstanceKeyPaths({
        ...searchProps,
        hierarchyConfig,
        idsProvider,
        uniqueId,
        imodelAccess: props.imodelAccess,
      }),
    /**
     * Builds search paths for a hierarchy provider. Set `revealTargets` to expand ancestors of matching targets.
     * @throws An error if the configured search limit is exceeded.
     */
    createSearchTree: async (searchProps: ModelsTreeSearchProps & { revealTargets?: boolean }) =>
      ModelsTreeDefinition.createSearchTree({
        ...searchProps,
        hierarchyConfig,
        idsProvider,
        uniqueId,
        imodelAccess: props.imodelAccess,
      }),
  };
}

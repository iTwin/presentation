/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid } from "@itwin/core-bentley";
import { validateIdsProviderConfig } from "../../shared/Utils.js";
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
 * iModel access, ID provider, and classification system configuration for a classifications hierarchy.
 * @beta
 */
interface ClassificationsTreeProps {
  /** Schema and query access for the iModel used by the hierarchy definition and searches. */
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
  /**
   * ID provider for the iModel accessed through `imodelAccess`, with a matching classification system.
   * Created internally when omitted. Throws if its configuration does not match the tree configuration.
   */
  idsProvider?: ClassificationsTreeIdsProvider;
  /** Configuration shared by hierarchy definitions and searches. */
  hierarchyConfig: ClassificationsTreeHierarchyConfiguration;
  /** Identifier used in query restart tokens. Defaults to a generated GUID. */
  uniqueId?: GuidString;
}

/**
 * Search-specific data access and options for a classifications tree.
 * @beta
 */
type ClassificationsTreeSearchProps = ClassificationsTreeSearchOptions &
  ({ label: string } | { targetItems: Array<InstanceKey> });

/**
 * Creates a classifications hierarchy definition and search helpers that share hierarchy configuration and a unique ID.
 *
 * Supply `idsProvider` to share an externally owned provider with hierarchy and search.
 *
 * Pass the returned `hierarchyDefinition` to `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 * @throws An error if the supplied ID provider configuration does not match the tree configuration.
 * @beta
 */
export function createClassificationsTree(props: ClassificationsTreeProps) {
  const hierarchyConfig = {
    ...props.hierarchyConfig,
    elements: { excludedClasses: [...new Set(props.hierarchyConfig.elements?.excludedClasses ?? [])].sort() },
  };
  const idsProviderConfig = createClassificationsTreeIdsProviderConfig(hierarchyConfig);
  const idsProvider =
    props.idsProvider ?? createClassificationsTreeIdsProvider({ imodelAccess: props.imodelAccess, hierarchyConfig });
  validateIdsProviderConfig(
    createClassificationsTreeIdsProviderConfig(idsProvider.config),
    idsProviderConfig,
    "Classifications tree",
  );
  const uniqueId = props.uniqueId ?? Guid.createValue();
  const hierarchyDefinition: HierarchyDefinition = new ClassificationsTreeDefinition({
    imodelAccess: props.imodelAccess,
    hierarchyConfig,
    idsProvider,
    uniqueId,
  });
  return {
    /** Hierarchy definition bound to the supplied iModel access and ID provider. */
    hierarchyDefinition,
    /**
     * Yields hierarchy paths to instances matching the supplied label or instance keys.
     * @throws An error if the configured search limit is exceeded.
     */
    createInstanceKeyPaths: (searchProps: ClassificationsTreeSearchProps) =>
      ClassificationsTreeDefinition.createInstanceKeyPaths({
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
    createSearchTree: async (searchProps: ClassificationsTreeSearchProps & { revealTargets?: boolean }) =>
      ClassificationsTreeDefinition.createSearchTree({
        ...searchProps,
        hierarchyConfig,
        idsProvider,
        uniqueId,
        imodelAccess: props.imodelAccess,
      }),
  };
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid } from "@itwin/core-bentley";
import { createSharedIdsProvider } from "../../shared/idsProviders/SharedIdsProvider.js";
import { mergeWithDefaults, validateIdsProviderConfig } from "../../shared/Utils.js";
import { defaultHierarchyConfiguration, ModelsTreeDefinition } from "./ModelsTreeDefinition.js";
import { createModelsTreeIdsProvider, normalizeModelsTreeIdsProviderConfig } from "./ModelsTreeIdsProvider.js";
import { createHierarchyNodePaths } from "./ModelsTreeSearchHierarchyNodes.js";

import type { GuidString } from "@itwin/core-bentley";
import type {
  HierarchyDefinition,
  HierarchyProvider,
  LimitingECSqlQueryExecutor,
} from "@itwin/presentation-hierarchies";
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
  imodelAccess: ECSchemaProvider & LimitingECSqlQueryExecutor;
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
type ModelsTreeSearchProps = ModelsTreeSearchOptions & ModelsTreeSearchTargetProps;

/**
 * Search targets for a models tree, specified either as instance keys or grouping nodes, or as a label.
 * @beta
 */
type ModelsTreeSearchTargetProps = { targetItems: Array<InstanceKey | ElementsGroupInfo> } | { label: string };

/**
 * Search options for loading hierarchy nodes of models tree search results.
 * @beta
 */
type ModelsTreeHierarchyNodesSearchProps = Omit<ModelsTreeSearchOptions, "includeOnlyVisibleNodeInstanceKeys"> &
  ModelsTreeSearchTargetProps & {
    /** Provider for this tree and iModel, with subject, model, and category label merging disabled. */
    hierarchyProvider: HierarchyProvider;
  };

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
  validateIdsProviderConfig({
    name: "Models tree",
    normalizer: normalizeModelsTreeIdsProviderConfig,
    expected: hierarchyConfig,
    actual: idsProvider.config,
  });
  const uniqueId = props.uniqueId ?? Guid.createValue();
  const hierarchyDefinition: HierarchyDefinition = new ModelsTreeDefinition({
    imodelAccess: props.imodelAccess,
    hierarchyConfig,
    idsProvider,
    uniqueId,
  });
  const hierarchyNodesSearchConfig: ModelsTreeHierarchyConfiguration = {
    ...hierarchyConfig,
    subjects: { ...hierarchyConfig.subjects, labelMerging: "disable" },
    models: { ...hierarchyConfig.models, labelMerging: "disable" },
    categories: { ...hierarchyConfig.categories, labelMerging: "disable" },
  };
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
    /**
     * Same as `createInstanceKeyPaths`, but yields paths of hierarchy nodes loaded from `hierarchyProvider` instead of instance keys.
     *
     * The provider must use this tree's `hierarchyDefinition` and the same iModel, with label merging disabled for
     * subjects, models, and categories. The search configuration also disables label merging. Paths are yielded after searching and
     * loading the needed hierarchy levels. Siblings of the same class are requested together using an `instanceFilter`
     * on their `ECInstanceId` values, in chunks of at most 100 IDs. Parent nodes are constructed from search paths so all
     * planned requests, including different hierarchy levels and chunks, start concurrently without a concurrency limit.
     * Grouping-node children are requested as soon as the grouping nodes are returned.
     *
     * Notes:
     * - Hidden models are omitted. Paths whose target or a non-hidden ancestor is not found are not yielded.
     *   The `includeOnlyVisibleNodeInstanceKeys` option is therefore not supported.
     * - Grouping nodes are included before the instances they contain, including nested grouping levels.
     *   Their labels, counts, and grouped instance keys reflect the filtered request, including its ID chunk.
     * - Instance nodes each represent a single instance. Nodes with matching labels remain separate.
     * - Hidden ancestor keys use search-path base classes.
     * - Provider hierarchy level size limits apply; its state is not changed by this helper.
     * @throws An error if a search or provider hierarchy level size limit is exceeded, or loading fails.
     * @alpha
     */
    createHierarchyNodePaths: ({ hierarchyProvider, ...searchProps }: ModelsTreeHierarchyNodesSearchProps) =>
      createHierarchyNodePaths({
        hierarchyProvider,
        idsProvider,
        abortSignal: searchProps.abortSignal,
        instanceKeyPaths: ModelsTreeDefinition.createInstanceKeyPaths({
          ...searchProps,
          includeOnlyVisibleNodeInstanceKeys: false,
          hierarchyConfig: hierarchyNodesSearchConfig,
          idsProvider,
          uniqueId,
          imodelAccess: props.imodelAccess,
        }),
      }),
  };
}

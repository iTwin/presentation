/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid } from "@itwin/core-bentley";
import { createSharedIdsProvider } from "../../shared/idsProviders/SharedIdsProvider.js";
import { mergeWithDefaults, validateIdsProviderConfig } from "../../shared/Utils.js";
import { defaultHierarchyConfiguration, ModelsTreeDefinition } from "./ModelsTreeDefinition.js";
import { createModelsTreeIdsProvider, normalizeModelsTreeIdsProviderConfig } from "./ModelsTreeIdsProvider.js";

import type { GuidString, Id64String } from "@itwin/core-bentley";
import type {
  HierarchyDefinition,
  LimitingECSqlQueryExecutor,
  PathBasedHierarchyDefinition,
} from "@itwin/presentation-hierarchies";
import type { ECSchemaProvider, InstanceKey } from "@itwin/presentation-shared";
import type {
  ElementsGroupInfo,
  ModelsTreeHierarchyConfiguration,
  ModelsTreeSearchOptions,
  ModelsTreeSearchPath,
  ModelsTreeSearchTree,
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
 * Models tree hierarchy configuration with label merging disabled for all node types.
 * @beta
 */
type ModelsTreeHierarchyConfigurationWithoutLabelMerging = ModelsTreeHierarchyConfiguration & {
  subjects: { labelMerging: "disable" };
  categories: { labelMerging: "disable" };
  models: { labelMerging: "disable" };
};

/**
 * A models hierarchy definition and search helpers, returned by `createModelsTree`.
 * @beta
 */
interface ModelsTree<THierarchyDefinition extends HierarchyDefinition = HierarchyDefinition> {
  /** Hierarchy definition bound to the supplied iModel access and ID provider. */
  hierarchyDefinition: THierarchyDefinition;
  /**
   * Yields hierarchy paths to instances or grouping nodes matching the supplied search.
   * @throws An error if the configured search limit is exceeded.
   */
  createInstanceKeyPaths: (
    searchProps: ModelsTreeSearchProps,
  ) => AsyncIterableIterator<{ path: ModelsTreeSearchPath; target: Id64String | ElementsGroupInfo }>;
  /**
   * Builds search paths for a hierarchy provider. Set `revealTargets` to expand ancestors of matching targets.
   * @throws An error if the configured search limit is exceeded.
   */
  createSearchTree: (
    searchProps: ModelsTreeSearchProps & { revealTargets?: boolean },
  ) => Promise<ModelsTreeSearchTree[]>;
}

/**
 * Creates a models hierarchy definition and search helpers that share hierarchy configuration and a unique ID.
 *
 * Supply `idsProvider` to share an externally owned provider with hierarchy and search.
 *
 * Pass the returned `hierarchyDefinition` to `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 *
 * When label merging is disabled for subjects, categories and models, the returned `hierarchyDefinition` is also a
 * `PathBasedHierarchyDefinition`, so it can be passed to `createHierarchyNodePaths` from
 * `@itwin/presentation-hierarchies` to load hierarchy nodes for paths created by `createInstanceKeyPaths`:
 *
 * ```ts
 * const tree = createModelsTree({
 *   imodelAccess,
 *   hierarchyConfig: {
 *     subjects: { labelMerging: "disable" },
 *     categories: { labelMerging: "disable" },
 *     models: { labelMerging: "disable" },
 *   },
 * });
 * const nodePaths = await createHierarchyNodePaths({
 *   imodelAccess,
 *   hierarchyDefinition: tree.hierarchyDefinition,
 *   paths: tree.createInstanceKeyPaths({ targetItems }),
 * });
 * // every `searchPath` in `nodePaths` is a `{ path, target }` object yielded by `createInstanceKeyPaths`
 * ```
 *
 * Paths must be created with the default `includeOnlyVisibleNodeInstanceKeys: false`, because nodes that are hidden
 * in the hierarchy have to be included in them.
 *
 * @throws An error if the supplied ID provider configuration does not match the tree configuration.
 * @beta
 */
export function createModelsTree(
  props: ModelsTreeProps & { hierarchyConfig: ModelsTreeHierarchyConfigurationWithoutLabelMerging },
): ModelsTree<HierarchyDefinition & PathBasedHierarchyDefinition>;
/**
 * Creates a models hierarchy definition and search helpers that share hierarchy configuration and a unique ID.
 *
 * Supply `idsProvider` to share an externally owned provider with hierarchy and search.
 *
 * Pass the returned `hierarchyDefinition` to `createIModelHierarchyProvider` from `@itwin/presentation-hierarchies`.
 *
 * @throws An error if the supplied ID provider configuration does not match the tree configuration.
 * @beta
 */
export function createModelsTree(props: ModelsTreeProps): ModelsTree;
export function createModelsTree(
  props: ModelsTreeProps,
): ModelsTree<HierarchyDefinition & PathBasedHierarchyDefinition> {
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
  const hierarchyDefinition = new ModelsTreeDefinition({
    imodelAccess: props.imodelAccess,
    hierarchyConfig,
    idsProvider,
    uniqueId,
  });
  return {
    hierarchyDefinition,
    createInstanceKeyPaths: (searchProps: ModelsTreeSearchProps) =>
      ModelsTreeDefinition.createInstanceKeyPaths({
        ...searchProps,
        hierarchyConfig,
        idsProvider,
        uniqueId,
        imodelAccess: props.imodelAccess,
      }),
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

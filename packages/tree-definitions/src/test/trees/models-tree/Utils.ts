/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64 } from "@itwin/core-bentley";
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { CLASS_NAMES } from "../../../tree-definitions/shared/ClassNameDefinitions.js";
import { BaseIdsProvider } from "../../../tree-definitions/shared/idsProviders/BaseIdsProvider.js";
import { mergeWithDefaults } from "../../../tree-definitions/shared/Utils.js";
import {
  defaultHierarchyConfiguration,
  ModelsTreeDefinition,
} from "../../../tree-definitions/trees/models-tree/ModelsTreeDefinition.js";
import { ModelsTreeIdsProvider } from "../../../tree-definitions/trees/models-tree/ModelsTreeIdsProvider.js";
import { createIModelAccess } from "../Common.js";

import type { Id64Arg, Id64Array, Id64String } from "@itwin/core-bentley";
import type { IModelConnection } from "@itwin/core-frontend";
import type {
  ClassGroupingNodeKey,
  GroupingHierarchyNode,
  HierarchyProvider,
  HierarchySearchTree,
  NonGroupingHierarchyNode,
} from "@itwin/presentation-hierarchies";
import type { EC, InstanceKey } from "@itwin/presentation-shared";
import type { ParentElementsPath } from "../../../tree-definitions/shared/Utils.js";
import type { ModelsTreeHierarchyConfiguration } from "../../../tree-definitions/trees/models-tree/ModelsTreeDefinition.js";

interface CreateModelsTreeProviderProps {
  imodelConnection: IModelConnection;
  searchPaths?: HierarchySearchTree[];
  hierarchyConfig?: ModelsTreeHierarchyConfiguration;
  idsProvider?: ModelsTreeIdsProvider;
  imodelAccess?: ReturnType<typeof createIModelAccess>;
}

export function createModelsTreeProvider({
  imodelConnection,
  searchPaths,
  hierarchyConfig,
  imodelAccess,
  idsProvider,
}: CreateModelsTreeProviderProps): HierarchyProvider & { dispose: () => void; [Symbol.dispose]: () => void } {
  const configOverrides: ModelsTreeHierarchyConfiguration = { subjects: { root: "exclude" }, ...hierarchyConfig };
  const config = mergeWithDefaults({ defaults: defaultHierarchyConfiguration, overrides: configOverrides });
  const createdImodelAccess = imodelAccess ?? createIModelAccess(imodelConnection);
  const baseIdsProvider = new BaseIdsProvider({
    queryExecutor: createdImodelAccess,
    elementClassName: config.elements.baseClass,
    type: "3d",
    excludedElementClassNames: config.elements.excludedClasses,
  });
  const createdIdsProvider =
    idsProvider ??
    new ModelsTreeIdsProvider({ queryExecutor: createdImodelAccess, hierarchyConfig: config, baseIdsProvider });
  const provider = createIModelHierarchyProvider({
    imodelAccess: createdImodelAccess,
    hierarchyDefinition: new ModelsTreeDefinition({
      imodelAccess: createdImodelAccess,
      idsProvider: createdIdsProvider,
      hierarchyConfig: config,
    }),
    ...(searchPaths ? { search: { paths: searchPaths } } : undefined),
  });
  const dispose = () => {
    provider[Symbol.dispose]();
  };
  return {
    hierarchyChanged: provider.hierarchyChanged,
    getNodes: (props) => provider.getNodes(props),
    getNodeInstanceKeys: (props) => provider.getNodeInstanceKeys(props),
    setFormatter: (formatter) => provider.setFormatter(formatter),
    setHierarchySearch: (props) => provider.setHierarchySearch(props),
    dispose,
    [Symbol.dispose]() {
      dispose();
    },
  };
}

export function createSubjectHierarchyNode(props?: {
  ids?: Id64Arg;
  parentKeys?: InstanceKey[];
}): NonGroupingHierarchyNode {
  const instanceKeys = new Array<InstanceKey>();
  for (const id of props?.ids ? Id64.iterable(props.ids) : []) {
    instanceKeys.push({ className: CLASS_NAMES.subject, id });
  }
  return {
    key: { type: "instances", instanceKeys },
    children: false,
    label: "",
    parentKeys: props?.parentKeys
      ? props.parentKeys.map((parentKey) => ({ type: "instances", instanceKeys: [parentKey] }))
      : [],
    extendedData: { type: "subject" },
  };
}
export function createModelHierarchyNode(props?: {
  modelId?: Id64String;
  hasChildren?: boolean;
  parentKeys?: InstanceKey[];
  search?: NonGroupingHierarchyNode["search"];
  className?: EC.FullClassNameDotNotation;
}): NonGroupingHierarchyNode {
  return {
    key: {
      type: "instances",
      instanceKeys: [{ className: props?.className ?? CLASS_NAMES.model, id: props?.modelId ?? "" }],
    },
    children: !!props?.hasChildren,
    label: "",
    parentKeys: props?.parentKeys
      ? props.parentKeys.map((parentKey) => ({ type: "instances", instanceKeys: [parentKey] }))
      : [],
    search: props?.search,
    extendedData: { type: "model", modelId: props?.modelId ?? "0x1" },
  };
}
export function createCategoryHierarchyNode({
  modelId,
  categoryId,
  hasChildren,
  parentKeys,
  search,
  parentElementsPath,
}: {
  modelId?: Id64String;
  categoryId?: Id64Arg;
  hasChildren?: boolean;
  parentKeys?: Array<InstanceKey | ClassGroupingNodeKey>;
  search?: NonGroupingHierarchyNode["search"];
  parentElementsPath?: ParentElementsPath;
}): NonGroupingHierarchyNode {
  return {
    key: {
      type: "instances",
      instanceKeys:
        typeof categoryId === "string"
          ? [{ className: CLASS_NAMES.spatialCategory, id: categoryId }]
          : [...(categoryId ?? [])].map((id) => ({ className: CLASS_NAMES.spatialCategory, id })),
    },
    children: !!hasChildren,
    label: "",
    parentKeys: parentKeys
      ? parentKeys.map((parentKey) =>
          "type" in parentKey ? parentKey : { type: "instances", instanceKeys: [parentKey] },
        )
      : [],
    search,
    extendedData: { type: "category", modelIds: [modelId ?? "0x1"], parentElementsPath: parentElementsPath ?? [] },
  };
}
export function createElementHierarchyNode(props: {
  modelId: Id64String | undefined;
  categoryId: Id64String | undefined;
  hasChildren?: boolean;
  elementId?: Id64String;
  parentKeys?: Array<InstanceKey | ClassGroupingNodeKey>;
  search?: NonGroupingHierarchyNode["search"];
  parentElementsPath?: ParentElementsPath;
  className?: EC.FullClassNameDotNotation;
}): NonGroupingHierarchyNode {
  return {
    key: {
      type: "instances",
      instanceKeys: [{ className: props.className ?? CLASS_NAMES.geometricElement3d, id: props.elementId ?? "" }],
    },
    children: !!props.hasChildren,
    label: "",
    search: props.search,
    parentKeys: props.parentKeys
      ? props.parentKeys.map((parentKey) =>
          "type" in parentKey ? parentKey : { type: "instances", instanceKeys: [parentKey] },
        )
      : [],
    extendedData: {
      type: "element",
      modelId: props.modelId,
      categoryId: props.categoryId,
      parentElementsPath: props.parentElementsPath ?? [],
    },
  };
}
export function createClassGroupingHierarchyNode({
  elements,
  parentKeys,
  modelId,
  categoryId,
  ...props
}: {
  elements: Id64Array;
  className?: EC.FullClassNameDotNotation;
  parentKeys?: Array<InstanceKey | ClassGroupingNodeKey>;
  modelId: Id64String;
  categoryId: Id64String;
  hasDirectNonSearchTargets?: boolean;
  hasSearchTargetAncestor?: boolean;
  parentElementsPath?: ParentElementsPath;
  childrenWhichAreParents?: Set<Id64String>;
}): GroupingHierarchyNode & { key: ClassGroupingNodeKey } {
  const className = props.className ?? CLASS_NAMES.element;
  return {
    key: { type: "class-grouping", className },
    children: !!elements.length,
    groupedInstanceKeys: elements.map((id) => ({ className, id })),
    label: "",
    parentKeys: parentKeys
      ? parentKeys.map((parentKey) =>
          "type" in parentKey ? parentKey : { type: "instances", instanceKeys: [parentKey] },
        )
      : [],
    extendedData: {
      categoryId,
      modelId,
      parentElementsPath: props.parentElementsPath ?? [],
      childrenWhichAreParents: props.childrenWhichAreParents ?? new Set(),
      ...(props.hasDirectNonSearchTargets ? { hasDirectNonSearchTargets: props.hasDirectNonSearchTargets } : {}),
      ...(props.hasSearchTargetAncestor ? { hasSearchTargetAncestor: props.hasSearchTargetAncestor } : {}),
    },
  };
}

export function createAccessAndIdsProvider({
  imodelConnection,
  hierarchyConfig,
}: {
  imodelConnection: IModelConnection;
  hierarchyConfig?: ModelsTreeHierarchyConfiguration;
}) {
  const imodelAccess = createIModelAccess(imodelConnection);
  const requiredHierarchyConfig = mergeWithDefaults({
    defaults: defaultHierarchyConfiguration,
    overrides: hierarchyConfig,
  });
  const baseIdsProvider = new BaseIdsProvider({
    queryExecutor: imodelAccess,
    elementClassName: requiredHierarchyConfig.elements.baseClass,
    type: "3d",
    excludedElementClassNames: requiredHierarchyConfig.elements.excludedClasses,
  });
  const idsProvider = new ModelsTreeIdsProvider({
    queryExecutor: imodelAccess,
    hierarchyConfig: requiredHierarchyConfig,
    baseIdsProvider,
  });
  return { imodelAccess, idsProvider, hierarchyConfig: requiredHierarchyConfig };
}

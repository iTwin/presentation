/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { BaseIdsCache } from "./models-tree/BaseIdsCache.js";
import { CLASS_NAME_GeometricElement3d } from "./models-tree/ClassNameDefinitions.js";
import { defaultHierarchyConfiguration, ModelsTreeDefinition } from "./models-tree/ModelsTreeDefinition.js";
import { ModelsTreeIdsCache } from "./models-tree/ModelsTreeIdsCache.js";
import { mergeWithDefaults } from "./models-tree/Utils.js";

import type { OmitOverUnion, Props } from "@itwin/presentation-shared";
import type { ModelsTreeHierarchyConfiguration } from "./models-tree/ModelsTreeDefinition.js";

/** @public */
export function setupModelsTree(props: {
  imodelAccess: ConstructorParameters<typeof ModelsTreeDefinition>[0]["imodelAccess"];
  hierarchyConfig?: ModelsTreeHierarchyConfiguration;
}) {
  const hierarchyConfig = mergeWithDefaults({
    defaults: defaultHierarchyConfiguration,
    overrides: props.hierarchyConfig,
  });
  const idsCache = new ModelsTreeIdsCache({
    queryExecutor: props.imodelAccess,
    baseIdsCache: new BaseIdsCache({
      queryExecutor: props.imodelAccess,
      type: "3d",
      elementClassName: CLASS_NAME_GeometricElement3d,
      excludedElementClassNames: hierarchyConfig.elements.excludedClasses,
    }),
    hierarchyConfig,
  });
  return {
    definition: new ModelsTreeDefinition({ imodelAccess: props.imodelAccess, idsCache, hierarchyConfig }),
    createInstanceKeyPaths: (
      instanceKeyPathsProps: OmitOverUnion<
        Props<typeof ModelsTreeDefinition.createInstanceKeyPaths>,
        "imodelAccess" | "idsCache" | "hierarchyConfig" | "componentId"
      >,
    ) =>
      ModelsTreeDefinition.createInstanceKeyPaths({
        ...instanceKeyPathsProps,
        imodelAccess: props.imodelAccess,
        idsCache,
        hierarchyConfig,
      }),
    createSearchTree: async (
      instanceKeyPathsProps: OmitOverUnion<
        Props<typeof ModelsTreeDefinition.createSearchTree>,
        "imodelAccess" | "idsCache" | "hierarchyConfig" | "componentId"
      >,
    ) =>
      ModelsTreeDefinition.createSearchTree({
        ...instanceKeyPathsProps,
        imodelAccess: props.imodelAccess,
        idsCache,
        hierarchyConfig,
      }),
  };
}

export * from "./models-tree/ModelsTreeDefinition.js";

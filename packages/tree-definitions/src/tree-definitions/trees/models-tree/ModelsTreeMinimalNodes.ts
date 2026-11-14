/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { firstValueFrom } from "rxjs";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { toObservable } from "../../shared/Rxjs.js";
import { ModelsTreeNode } from "./ModelsTreeNode.js";

import type { Id64String } from "@itwin/core-bentley";
import type {
  createHierarchyNodePaths,
  IModelInstanceKey,
  InstancesNodeKey,
  MinimalHierarchyNode,
} from "@itwin/presentation-hierarchies";
import type { DeepReadonly, Props } from "@itwin/presentation-shared";
import type { ModelsTreeIdsProvider } from "./ModelsTreeIdsProvider.js";

/** @internal */
export async function createModelsTreeMinimalNodeFactory({
  idsProvider,
}: {
  idsProvider: Pick<ModelsTreeIdsProvider, "getHiddenModelIds">;
}): Promise<Props<typeof createHierarchyNodePaths>["createMinimalNode"]> {
  const hiddenModelIds = await firstValueFrom(toObservable(idsProvider.getHiddenModelIds()));
  return ({ instanceKey, parentNode }) => createMinimalNode({ instanceKey, parentNode, hiddenModelIds });
}

/**
 * Creates a parent node with the same key and extended data, that models tree hierarchy definition expects from
 * a node representing the given search path instance key. The parent node must have been created by this function
 * for the previous key in the same search path.
 *
 * Sub-models and models hidden by partition content properties are hidden in the hierarchy.
 */
function createMinimalNode({
  instanceKey,
  parentNode,
  hiddenModelIds,
}: {
  instanceKey: DeepReadonly<IModelInstanceKey>;
  parentNode: MinimalHierarchyNode | undefined;
  hiddenModelIds: ReadonlySet<Id64String>;
}): MinimalHierarchyNode {
  const nodeBase = {
    key: createInstancesNodeKey(instanceKey),
    parentKeys: parentNode ? [...parentNode.parentKeys, parentNode.key] : [],
    label: "",
  };
  const parentId = parentNode?.key.type === "instances" ? parentNode.key.instanceKeys[0].id : undefined;
  switch (instanceKey.className) {
    case CLASS_NAMES.Subject:
      return { ...nodeBase, extendedData: { type: "subject" } };
    case CLASS_NAMES.GeometricModel3d: {
      // sub-models follow their modeled element in search paths and have the same ID as the element
      const subModeledElementCategory =
        parentNode && ModelsTreeNode.isElementNode(parentNode) && parentId === instanceKey.id
          ? parentNode.extendedData.categoryId
          : undefined;
      const isHidden = subModeledElementCategory !== undefined || hiddenModelIds.has(instanceKey.id);
      return {
        ...nodeBase,
        extendedData: {
          type: "model",
          ...(subModeledElementCategory !== undefined ? { subModeledElementCategory } : {}),
        },
        ...(isHidden ? { processingParams: { hideInHierarchy: true } } : {}),
      };
    }
    case CLASS_NAMES.SpatialCategory:
      if (parentNode && ModelsTreeNode.isModelNode(parentNode)) {
        return { ...nodeBase, extendedData: { type: "category", modelIds: [parentId] } };
      }
      if (parentNode && ModelsTreeNode.isElementNode(parentNode)) {
        return {
          ...nodeBase,
          extendedData: { type: "category", modelIds: [parentNode.extendedData.modelId], parentElementIds: [parentId] },
        };
      }
      throw new Error("SpatialCategory must have a nearest ancestor model ID");
    case CLASS_NAMES.GeometricElement3d:
      if (parentNode && ModelsTreeNode.isCategoryNode(parentNode)) {
        return {
          ...nodeBase,
          extendedData: { type: "element", modelId: parentNode.extendedData.modelIds[0], categoryId: parentId },
        };
      }
      if (parentNode && ModelsTreeNode.isElementNode(parentNode)) {
        return {
          ...nodeBase,
          extendedData: {
            type: "element",
            modelId: parentNode.extendedData.modelId,
            categoryId: parentNode.extendedData.categoryId,
          },
        };
      }
      // sub-model elements in the modeled element's category have no category entry between them and the sub-model
      if (
        parentNode &&
        ModelsTreeNode.isModelNode(parentNode) &&
        parentNode.extendedData?.subModeledElementCategory !== undefined
      ) {
        return {
          ...nodeBase,
          extendedData: {
            type: "element",
            modelId: parentId,
            categoryId: parentNode.extendedData.subModeledElementCategory,
          },
        };
      }
      throw new Error("GeometricElement3d must have nearest ancestor model and category IDs");
    default:
      throw new Error(`Unsupported models tree search path class: "${instanceKey.className}"`);
  }
}

function createInstancesNodeKey(key: DeepReadonly<IModelInstanceKey>): InstancesNodeKey {
  return { type: "instances", instanceKeys: [{ className: key.className, id: key.id }] };
}

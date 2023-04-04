/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64, Id64String } from "@itwin/core-bentley";
import { BisCodeSpec, Code, IModel, PhysicalElementProps } from "@itwin/core-common";
import { TestIModelBuilder } from "@itwin/presentation-testing";

export function insertSubject(builder: TestIModelBuilder, label: string, parentId?: Id64String) {
  const className = "BisCore:Subject";
  const id = builder.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: builder.createCode(parentId ?? IModel.rootSubjectId, BisCodeSpec.subject, label),
    parent: {
      id: parentId ?? IModel.rootSubjectId,
      relClassName: "BisCore:SubjectOwnsSubjects",
    },
  });
  return { className, id };
}

export function insertPhysicalModel(builder: TestIModelBuilder, label: string, parentId?: Id64String) {
  const partitionId = builder.insertElement({
    classFullName: "BisCore:PhysicalPartition",
    model: IModel.repositoryModelId,
    code: builder.createCode(parentId ?? IModel.rootSubjectId, BisCodeSpec.informationPartitionElement, label),
    parent: {
      id: parentId ?? IModel.rootSubjectId,
      relClassName: "BisCore:SubjectOwnsPartitionElements",
    },
  });
  const modelClassName = "BisCore:PhysicalModel";
  const modelId = builder.insertModel({
    classFullName: modelClassName,
    modeledElement: { id: partitionId },
  });
  return { className: modelClassName, id: modelId };
}

export function insertSpatialCategory(builder: TestIModelBuilder, label: string, modelId = IModel.dictionaryId) {
  const className = "BisCore:SpatialCategory";
  const id = builder.insertElement({
    classFullName: className,
    model: modelId,
    code: builder.createCode(modelId, BisCodeSpec.spatialCategory, label),
  });
  return { className, id };
}

export function getDefaultSubcategoryKey(categoryId: Id64String) {
  const pair = Id64.getUint32Pair(categoryId);
  pair.lower++; // id of default subcategory is always `category id + 1`
  return {
    className: "BisCore:SubCategory",
    id: Id64.fromUint32PairObject(pair),
  };
}

export function insertSubCategory(builder: TestIModelBuilder, label: string, parentCategoryId: Id64String, modelId = IModel.dictionaryId) {
  const className = "BisCore:SubCategory";
  const id = builder.insertElement({
    classFullName: className,
    model: modelId,
    code: builder.createCode(modelId, BisCodeSpec.subCategory, label),
    parent: {
      id: parentCategoryId,
      relClassName: "BisCore:CategoryOwnsSubCategories",
    },
  });
  return { className, id };
}

export function insertPhysicalElement(builder: TestIModelBuilder, label: string, modelId: Id64String, categoryId: Id64String, parentId?: Id64String) {
  const className = "Generic:PhysicalObject";
  const id = builder.insertElement({
    classFullName: className,
    model: modelId,
    category: categoryId,
    code: Code.createEmpty(),
    userLabel: label,
    ...(parentId
      ? {
          parent: {
            id: parentId,
            relClassName: "BisCore:PhysicalElementAssemblesElements",
          },
        }
      : undefined),
  } as PhysicalElementProps);
  return { className, id };
}

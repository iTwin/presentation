/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { IModelDb, PhysicalModel, PhysicalPartition, SpatialCategory, SubjectOwnsPartitionElements } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { BisCodeSpec, Code, IModel } from "@itwin/core-common";

export function insertPhysicalModelWithPartition(iModel: IModelDb, codeValue: string, partitionParentId?: Id64String) {
  const partitionKey = insertPhysicalPartition(iModel, partitionParentId ?? IModel.rootSubjectId, codeValue);
  return insertPhysicalSubModel(iModel, partitionKey);
}

export function insertSpatialCategory(iModel: IModelDb, codeValue: string) {
  const codeSpec = iModel.codeSpecs.getByName(BisCodeSpec.spatialCategory);
  const model = IModel.dictionaryId;
  const id = iModel.elements.insertElement({
    classFullName: SpatialCategory.classFullName,
    model,
    code: new Code({ scope: model, spec: codeSpec.id, value: codeValue }),
  });
  return id;
}

function insertPhysicalPartition(iModel: IModelDb, parentId: Id64String, codeValue: string) {
  const codeSpec = iModel.codeSpecs.getByName(BisCodeSpec.informationPartitionElement);
  const code = new Code({ spec: codeSpec.id, scope: parentId, value: codeValue });
  const partitionId = iModel.elements.insertElement({
    classFullName: PhysicalPartition.classFullName,
    model: IModel.repositoryModelId,
    code,
    parent: new SubjectOwnsPartitionElements(parentId),
  });
  return partitionId;
}

function insertPhysicalSubModel(iModel: IModelDb, modeledElementId: Id64String) {
  const id = iModel.models.insertModel({
    classFullName: PhysicalModel.classFullName,
    modeledElement: { id: modeledElementId },
  });
  return id;
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { IModelDb, PhysicalModel, PhysicalPartition, SubjectOwnsPartitionElements } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { BisCodeSpec, Code, IModel } from "@itwin/core-common";

export function insertPhysicalModelWithPartition(iModel: IModelDb, codeValue: string, partitionParentId?: Id64String) {
  const partitionKey = insertPhysicalPartition(iModel, partitionParentId ?? IModel.rootSubjectId, codeValue);
  return insertPhysicalSubModel(iModel, partitionKey);
}

function insertPhysicalPartition(iModel: IModelDb, parentId: Id64String, codeValue: string) {
  const codeSpec = iModel.codeSpecs.getByName(BisCodeSpec.informationPartitionElement);
  const code = new Code({ spec: codeSpec.id, scope: parentId, value: codeValue });
  const partitionId = iModel.elements.insertElement({
    classFullName: PhysicalPartition.classFullName,
    model: IModel.repositoryModelId,
    code,
    parent: {
      id: parentId,
      relClassName: SubjectOwnsPartitionElements.classFullName,
    },
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

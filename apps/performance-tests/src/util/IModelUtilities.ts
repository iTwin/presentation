/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { IModelDb, SnapshotDb } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import {
  BisCodeSpec,
  CategoryProps,
  Code,
  CodeScopeProps,
  GeometricModel3dProps,
  IModel,
  InformationPartitionElementProps,
  PhysicalElementProps,
} from "@itwin/core-common";

export async function createIModel(name: string, localPath: string, cb: (iModel: IModelDb) => void | Promise<void>) {
  const iModel = SnapshotDb.createEmpty(localPath, { rootSubject: { name } });
  try {
    await cb(iModel);
  } finally {
    iModel.saveChanges("Initial commit");
    iModel.close();
  }
}

export interface BaseInstanceInsertProps {
  iModel: IModelDb;
  fullClassNameSeparator?: ":" | ".";
}

export function insertPhysicalModelWithPartition(props: BaseInstanceInsertProps & { codeValue: string; partitionParentId?: Id64String }) {
  const { codeValue, partitionParentId, ...baseProps } = props;
  const partitionKey = insertPhysicalPartition({ ...baseProps, codeValue, parentId: partitionParentId ?? IModel.rootSubjectId });
  return insertPhysicalSubModel({ ...baseProps, modeledElementId: partitionKey.id });
}

export function insertPhysicalPartition(
  props: BaseInstanceInsertProps & { codeValue: string; parentId: Id64String } & Partial<Omit<InformationPartitionElementProps, "id" | "parent" | "code">>,
) {
  const { iModel, classFullName, codeValue, parentId, ...partitionProps } = props;
  const defaultModelClassName = `BisCore${props.fullClassNameSeparator ?? "."}PhysicalPartition`;
  const className = classFullName ?? defaultModelClassName;
  const partitionId = iModel.elements.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: createCode(iModel, parentId, BisCodeSpec.informationPartitionElement, codeValue),
    parent: {
      id: parentId,
      relClassName: `BisCore${props.fullClassNameSeparator ?? "."}SubjectOwnsPartitionElements`,
    },
    ...partitionProps,
  });
  return { className, id: partitionId };
}

export function insertPhysicalSubModel(
  props: BaseInstanceInsertProps & { modeledElementId: Id64String } & Partial<Omit<GeometricModel3dProps, "id" | "modeledElement" | "parentModel">>,
) {
  const { iModel, classFullName, modeledElementId, ...modelProps } = props;
  const defaultModelClassName = `BisCore${props.fullClassNameSeparator ?? "."}PhysicalModel`;
  const className = classFullName ?? defaultModelClassName;
  const modelId = iModel.models.insertModel({
    classFullName: className,
    modeledElement: { id: modeledElementId },
    ...modelProps,
  });
  return { className, id: modelId };
}

export function insertPhysicalElement<TAdditionalProps extends {}>(
  props: BaseInstanceInsertProps & { modelId: Id64String; categoryId: Id64String; parentId?: Id64String } & Partial<
      Omit<PhysicalElementProps, "id" | "model" | "category" | "parent">
    > &
    TAdditionalProps,
) {
  const { iModel, classFullName, modelId, categoryId, parentId, ...elementProps } = props;
  const defaultClassName = `Generic${props.fullClassNameSeparator ?? "."}PhysicalObject`;
  const className = classFullName ?? defaultClassName;
  const id = iModel.elements.insertElement({
    classFullName: className,
    model: modelId,
    category: categoryId,
    code: Code.createEmpty(),
    ...(parentId
      ? {
          parent: {
            id: parentId,
            relClassName: `BisCore${props.fullClassNameSeparator ?? "."}PhysicalElementAssemblesElements`,
          },
        }
      : undefined),
    ...elementProps,
  } as PhysicalElementProps);
  return { className, id };
}

export function insertSpatialCategory(
  props: BaseInstanceInsertProps & { codeValue: string; modelId?: Id64String } & Partial<Omit<CategoryProps, "id" | "model" | "parent" | "code">>,
) {
  const { iModel, classFullName, modelId, codeValue, ...categoryProps } = props;
  const defaultClassName = `BisCore${props.fullClassNameSeparator ?? "."}SpatialCategory`;
  const className = classFullName ?? defaultClassName;
  const model = modelId ?? IModel.dictionaryId;
  const id = iModel.elements.insertElement({
    classFullName: className,
    model,
    code: createCode(iModel, model, BisCodeSpec.spatialCategory, codeValue),
    ...categoryProps,
  });
  return { className, id };
}

function createCode(iModel: IModelDb, scopeModelId: CodeScopeProps, codeSpecName: BisCodeSpec, codeValue: string): Code {
  const codeSpec = iModel.codeSpecs.getByName(codeSpecName);
  return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
}

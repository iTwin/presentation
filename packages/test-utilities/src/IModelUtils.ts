/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64, Id64String } from "@itwin/core-bentley";
import {
  BisCodeSpec,
  CategoryProps,
  Code,
  CodeScopeProps,
  ElementAspectProps,
  ElementProps,
  ExternalSourceAspectProps,
  ExternalSourceProps,
  GeometricElement2dProps,
  GeometricModel2dProps,
  GeometricModel3dProps,
  IModel,
  InformationPartitionElementProps,
  ModelProps,
  PhysicalElementProps,
  RepositoryLinkProps,
  SubCategoryProps,
  SubjectProps,
} from "@itwin/core-common";

export interface TestIModelBuilder {
  insertModel(props: ModelProps): Id64String;
  insertElement(props: ElementProps): Id64String;
  insertAspect(props: ElementAspectProps): Id64String;
  createCode(scopeModelId: CodeScopeProps, codeSpecName: BisCodeSpec, codeValue: string): Code;
}

export interface BaseInstanceInsertProps {
  builder: TestIModelBuilder;
  fullClassNameSeparator?: ":" | ".";
}

export function insertSubject(
  props: BaseInstanceInsertProps & { codeValue: string; parentId?: Id64String } & Partial<Omit<SubjectProps, "id" | "parent" | "code" | "model">>,
) {
  const { builder, classFullName, codeValue, parentId, ...subjectProps } = props;
  const defaultClassName = `BisCore${props.fullClassNameSeparator ?? "."}Subject`;
  const className = classFullName ?? defaultClassName;
  const id = builder.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: builder.createCode(parentId ?? IModel.rootSubjectId, BisCodeSpec.subject, codeValue),
    parent: {
      id: parentId ?? IModel.rootSubjectId,
      relClassName: "BisCore.SubjectOwnsSubjects",
    },
    ...subjectProps,
  });
  return { className, id };
}

export function insertPhysicalModelWithPartition(props: BaseInstanceInsertProps & { codeValue: string; partitionParentId?: Id64String }) {
  const { codeValue, partitionParentId, ...baseProps } = props;
  const partitionKey = insertPhysicalPartition({ ...baseProps, codeValue, parentId: partitionParentId ?? IModel.rootSubjectId });
  return insertPhysicalSubModel({ ...baseProps, modeledElementId: partitionKey.id });
}

export function insertPhysicalPartition(
  props: BaseInstanceInsertProps & { codeValue: string; parentId: Id64String } & Partial<Omit<InformationPartitionElementProps, "id" | "parent" | "code">>,
) {
  const { builder, classFullName, codeValue, parentId, ...partitionProps } = props;
  const defaultModelClassName = `BisCore${props.fullClassNameSeparator ?? "."}PhysicalPartition`;
  const className = classFullName ?? defaultModelClassName;
  const partitionId = builder.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: builder.createCode(parentId, BisCodeSpec.informationPartitionElement, codeValue),
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
  const { builder, classFullName, modeledElementId, ...modelProps } = props;
  const defaultModelClassName = `BisCore${props.fullClassNameSeparator ?? "."}PhysicalModel`;
  const className = classFullName ?? defaultModelClassName;
  const modelId = builder.insertModel({
    classFullName: className,
    modeledElement: { id: modeledElementId },
    ...modelProps,
  });
  return { className, id: modelId };
}

export function insertDrawingModelWithPartition(props: BaseInstanceInsertProps & { codeValue: string; partitionParentId?: Id64String }) {
  const { codeValue, partitionParentId, ...baseProps } = props;
  const partitionKey = insertDrawingPartition({ ...baseProps, codeValue, parentId: partitionParentId ?? IModel.rootSubjectId });
  return insertDrawingSubModel({ ...baseProps, modeledElementId: partitionKey.id });
}

export function insertDrawingPartition(
  props: BaseInstanceInsertProps & { codeValue: string; parentId: Id64String } & Partial<
      Omit<InformationPartitionElementProps, "id" | "parent" | "code" | "userLabel">
    >,
) {
  const { builder, classFullName, codeValue, parentId, ...partitionProps } = props;
  const defaultModelClassName = `BisCore${props.fullClassNameSeparator ?? "."}Drawing`;
  const className = classFullName ?? defaultModelClassName;
  const partitionId = builder.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: builder.createCode(parentId, BisCodeSpec.informationPartitionElement, codeValue),
    parent: {
      id: parentId,
      relClassName: `BisCore${props.fullClassNameSeparator ?? "."}SubjectOwnsPartitionElements`,
    },
    ...partitionProps,
  });
  return { className, id: partitionId };
}

export function insertDrawingSubModel(
  props: BaseInstanceInsertProps & { modeledElementId: Id64String } & Partial<Omit<GeometricModel2dProps, "id" | "modeledElement" | "parentModel">>,
) {
  const { builder, classFullName, modeledElementId, ...modelProps } = props;
  const defaultModelClassName = `BisCore${props.fullClassNameSeparator ?? "."}DrawingModel`;
  const className = classFullName ?? defaultModelClassName;
  const modelId = builder.insertModel({
    classFullName: className,
    modeledElement: { id: modeledElementId },
    ...modelProps,
  });
  return { className, id: modelId };
}

export function insertSpatialCategory(
  props: BaseInstanceInsertProps & { codeValue: string; modelId?: Id64String } & Partial<Omit<CategoryProps, "id" | "model" | "parent" | "code">>,
) {
  const { builder, classFullName, modelId, codeValue, ...categoryProps } = props;
  const defaultClassName = `BisCore${props.fullClassNameSeparator ?? "."}SpatialCategory`;
  const className = classFullName ?? defaultClassName;
  const model = modelId ?? IModel.dictionaryId;
  const id = builder.insertElement({
    classFullName: className,
    model,
    code: builder.createCode(model, BisCodeSpec.spatialCategory, codeValue),
    ...categoryProps,
  });
  return { className, id };
}

export function insertDrawingCategory(
  props: BaseInstanceInsertProps & { codeValue: string; modelId?: Id64String } & Partial<Omit<CategoryProps, "id" | "model" | "parent" | "code">>,
) {
  const { builder, classFullName, modelId, codeValue, ...categoryProps } = props;
  const defaultClassName = `BisCore${props.fullClassNameSeparator ?? "."}DrawingCategory`;
  const className = classFullName ?? defaultClassName;
  const model = modelId ?? IModel.dictionaryId;
  const id = builder.insertElement({
    classFullName: className,
    model,
    code: builder.createCode(model, BisCodeSpec.drawingCategory, codeValue),
    ...categoryProps,
  });
  return { className, id };
}

export function getDefaultSubcategoryKey(categoryId: Id64String, fullClassNameSeparator?: string) {
  const pair = Id64.getUint32Pair(categoryId);
  pair.lower++; // id of default subcategory is always `category id + 1`
  return {
    className: `BisCore${fullClassNameSeparator ?? "."}SubCategory`,
    id: Id64.fromUint32PairObject(pair),
  };
}

export function insertSubCategory(
  props: BaseInstanceInsertProps & { codeValue: string; parentCategoryId: Id64String; modelId?: Id64String } & Partial<
      Omit<SubCategoryProps, "id" | "model" | "parent" | "code">
    >,
) {
  const { builder, classFullName, modelId, codeValue, parentCategoryId, ...subCategoryProps } = props;
  const defaultClassName = `BisCore${props.fullClassNameSeparator ?? "."}SubCategory`;
  const className = classFullName ?? defaultClassName;
  const model = modelId ?? IModel.dictionaryId;
  const id = builder.insertElement({
    classFullName: className,
    model,
    code: builder.createCode(model, BisCodeSpec.subCategory, codeValue),
    parent: {
      id: parentCategoryId,
      relClassName: `BisCore${props.fullClassNameSeparator ?? "."}CategoryOwnsSubCategories`,
    },
    ...subCategoryProps,
  });
  return { className, id };
}

export function insertPhysicalElement<TAdditionalProps extends {}>(
  props: BaseInstanceInsertProps & { modelId: Id64String; categoryId: Id64String; parentId?: Id64String } & Partial<
      Omit<PhysicalElementProps, "id" | "model" | "category" | "parent">
    > &
    TAdditionalProps,
) {
  const { builder, classFullName, modelId, categoryId, parentId, ...elementProps } = props;
  const defaultClassName = `Generic${props.fullClassNameSeparator ?? "."}PhysicalObject`;
  const className = classFullName ?? defaultClassName;
  const id = builder.insertElement({
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

export function insertDrawingGraphic<TAdditionalProps extends {}>(
  props: BaseInstanceInsertProps & { modelId: Id64String; categoryId: Id64String; parentId?: Id64String } & Partial<
      Omit<GeometricElement2dProps, "id" | "model" | "category" | "parent">
    > &
    TAdditionalProps,
) {
  const { builder, classFullName, modelId, categoryId, parentId, ...elementProps } = props;
  const defaultClassName = `BisCore${props.fullClassNameSeparator ?? "."}DrawingGraphic`;
  const className = classFullName ?? defaultClassName;
  const id = builder.insertElement({
    classFullName: className,
    model: modelId,
    category: categoryId,
    code: Code.createEmpty(),
    ...(parentId
      ? {
          parent: {
            id: parentId,
            relClassName: `BisCore${props.fullClassNameSeparator ?? "."}ElementOwnsChildElements`,
          },
        }
      : undefined),
    ...elementProps,
  } as GeometricElement2dProps);
  return { className, id };
}

export function insertRepositoryLink(
  props: BaseInstanceInsertProps & { repositoryUrl: string; repositoryLabel: string } & Partial<
      Omit<RepositoryLinkProps, "id" | "model" | "url" | "userLabel">
    >,
) {
  const { builder, classFullName, repositoryUrl, repositoryLabel, ...repoLinkProps } = props;
  const defaultClassName = `BisCore${props.fullClassNameSeparator ?? "."}RepositoryLink`;
  const className = classFullName ?? defaultClassName;
  const id = builder.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    url: repositoryUrl,
    userLabel: repositoryLabel,
    ...repoLinkProps,
  } as RepositoryLinkProps);
  return { className, id };
}

export function insertExternalSourceAspect(
  props: BaseInstanceInsertProps & { elementId: Id64String; identifier: String; repositoryId?: Id64String } & Partial<
      Omit<ExternalSourceAspectProps, "id" | "classFullName" | "element" | "source">
    >,
) {
  const { builder, repositoryId, elementId, identifier, ...externalSourceAspectProps } = props;
  const externalSourceId = builder.insertElement({
    classFullName: `BisCore${props.fullClassNameSeparator ?? "."}ExternalSource`,
    model: IModel.repositoryModelId,
    repository: repositoryId
      ? {
          id: repositoryId,
        }
      : undefined,
  } as ExternalSourceProps);

  const className = `BisCore${props.fullClassNameSeparator ?? "."}ExternalSourceAspect`;
  const id = builder.insertAspect({
    classFullName: className,
    kind: "ExternalSource",
    element: {
      id: elementId,
    },
    source: {
      id: externalSourceId,
    },
    identifier,
    ...externalSourceAspectProps,
  } as ExternalSourceAspectProps);

  return { className, id };
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64, Id64String } from "@itwin/core-bentley";
import {
  BisCodeSpec,
  CategoryProps,
  Code,
  ExternalSourceAspectProps,
  ExternalSourceProps,
  GeometricModel3dProps,
  IModel,
  PhysicalElementProps,
  RepositoryLinkProps,
  SubCategoryProps,
  SubjectProps,
} from "@itwin/core-common";
import { TestIModelBuilder } from "@itwin/presentation-testing";

export function insertSubject(
  props: { builder: TestIModelBuilder; label: string; parentId?: Id64String } & Partial<Omit<SubjectProps, "id" | "parent" | "code" | "model">>,
) {
  const { builder, classFullName, label, parentId, ...subjectProps } = props;
  const defaultClassName = "BisCore:Subject";
  const className = classFullName ?? defaultClassName;
  const id = builder.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: builder.createCode(parentId ?? IModel.rootSubjectId, BisCodeSpec.subject, label),
    parent: {
      id: parentId ?? IModel.rootSubjectId,
      relClassName: "BisCore:SubjectOwnsSubjects",
    },
    ...subjectProps,
  });
  return { className, id };
}

export function insertPhysicalModelWithPartition(props: { builder: TestIModelBuilder; label: string; partitionParentId?: Id64String }) {
  const { builder, label, partitionParentId } = props;
  const partitionId = builder.insertElement({
    classFullName: "BisCore:PhysicalPartition",
    model: IModel.repositoryModelId,
    code: builder.createCode(partitionParentId ?? IModel.rootSubjectId, BisCodeSpec.informationPartitionElement, label),
    parent: {
      id: partitionParentId ?? IModel.rootSubjectId,
      relClassName: "BisCore:SubjectOwnsPartitionElements",
    },
  });
  return insertPhysicalSubModel({ builder, modeledElementId: partitionId });
}

export function insertPhysicalSubModel(
  props: { builder: TestIModelBuilder; modeledElementId: Id64String } & Partial<Omit<GeometricModel3dProps, "id" | "modeledElement" | "parentModel">>,
) {
  const { builder, classFullName, modeledElementId, ...modelProps } = props;
  const defaultModelClassName = "BisCore:PhysicalModel";
  const className = classFullName ?? defaultModelClassName;
  const modelId = builder.insertModel({
    classFullName: className,
    modeledElement: { id: modeledElementId },
    ...modelProps,
  });
  return { className, id: modelId };
}

export function insertSpatialCategory(
  props: { builder: TestIModelBuilder; label: string; modelId?: Id64String } & Partial<Omit<CategoryProps, "id" | "model" | "parent" | "code">>,
) {
  const { builder, classFullName, modelId, label, ...categoryProps } = props;
  const defaultClassName = "BisCore:SpatialCategory";
  const className = classFullName ?? defaultClassName;
  const model = modelId ?? IModel.dictionaryId;
  const id = builder.insertElement({
    classFullName: className,
    model,
    code: builder.createCode(model, BisCodeSpec.spatialCategory, label),
    ...categoryProps,
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

export function insertSubCategory(
  props: { builder: TestIModelBuilder; label: string; parentCategoryId: Id64String; modelId?: Id64String } & Partial<
    Omit<SubCategoryProps, "id" | "model" | "parent" | "code">
  >,
) {
  const { builder, classFullName, modelId, label, parentCategoryId, ...subCategoryProps } = props;
  const defaultClassName = "BisCore:SubCategory";
  const className = classFullName ?? defaultClassName;
  const model = modelId ?? IModel.dictionaryId;
  const id = builder.insertElement({
    classFullName: className,
    model,
    code: builder.createCode(model, BisCodeSpec.subCategory, label),
    parent: {
      id: parentCategoryId,
      relClassName: "BisCore:CategoryOwnsSubCategories",
    },
    ...subCategoryProps,
  });
  return { className, id };
}

export function insertPhysicalElement(
  props: { builder: TestIModelBuilder; modelId: Id64String; categoryId: Id64String; parentId?: Id64String } & Partial<
    Omit<PhysicalElementProps, "id" | "model" | "category" | "parent">
  >,
) {
  const { builder, classFullName, modelId, categoryId, parentId, ...elementProps } = props;
  const defaultClassName = "Generic:PhysicalObject";
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
            relClassName: "BisCore:PhysicalElementAssemblesElements",
          },
        }
      : undefined),
    ...elementProps,
  } as PhysicalElementProps);
  return { className, id };
}

export function insertRepositoryLink(
  props: { builder: TestIModelBuilder; repositoryUrl: string; repositoryLabel: string } & Partial<
    Omit<RepositoryLinkProps, "id" | "model" | "url" | "userLabel">
  >,
) {
  const { builder, classFullName, repositoryUrl, repositoryLabel, ...repoLinkProps } = props;
  const defaultClassName = "BisCore:RepositoryLink";
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
  props: { builder: TestIModelBuilder; elementId: Id64String; identifier: String; repositoryId?: Id64String } & Partial<
    Omit<ExternalSourceAspectProps, "id" | "classFullName" | "element" | "source">
  >,
) {
  const { builder, repositoryId, elementId, identifier, ...externalSourceAspectProps } = props;
  const externalSourceId = builder.insertElement({
    classFullName: "BisCore:ExternalSource",
    model: IModel.repositoryModelId,
    repository: repositoryId
      ? {
          id: repositoryId,
        }
      : undefined,
  } as ExternalSourceProps);

  const className = "BisCore:ExternalSourceAspect";
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

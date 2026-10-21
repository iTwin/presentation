/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64 } from "@itwin/core-bentley";
import { BisCodeSpec, Code, IModel } from "@itwin/core-common";

import type { EditTxn } from "@itwin/core-backend";
import type { Id64String } from "@itwin/core-bentley";
import type {
  CategoryProps,
  DefinitionElementProps,
  ElementAspectProps,
  ElementProps,
  ExternalSourceAspectProps,
  ExternalSourceProps,
  FunctionalElementProps,
  GeometricElement2dProps,
  GeometricModel2dProps,
  GeometricModel3dProps,
  InformationPartitionElementProps,
  PhysicalElementProps,
  RepositoryLinkProps,
  SheetIndexFolderProps,
  SubCategoryProps,
  SubjectProps,
} from "@itwin/core-common";

// cspell:words ecdbmap

type FullClassName = `${string}.${string}`;

interface InstanceKey {
  className: FullClassName;
  id: Id64String;
}

interface BaseInstanceInsertProps {
  txn: EditTxn;
  classFullName?: FullClassName;
}

export function insertSubject(
  props: BaseInstanceInsertProps & { codeValue: string; parentId?: Id64String } & Partial<
      Omit<SubjectProps, "id" | "parent" | "code" | "model">
    >,
): InstanceKey {
  const { txn, classFullName, codeValue, parentId, ...subjectProps } = props;
  const defaultClassName = `BisCore.Subject`;
  const className = classFullName ?? defaultClassName;
  const id = txn.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: new Code({
      spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.subject).id,
      scope: parentId ?? IModel.rootSubjectId,
      value: codeValue,
    }),
    parent: { id: parentId ?? IModel.rootSubjectId, relClassName: "BisCore.SubjectOwnsSubjects" },
    ...subjectProps,
  });
  return { className, id };
}

export function insertPhysicalModelWithPartition(
  props: BaseInstanceInsertProps & { codeValue: string; partitionParentId?: Id64String },
): InstanceKey {
  const { codeValue, partitionParentId, ...baseProps } = props;
  const partitionKey = insertPhysicalPartition({
    ...baseProps,
    codeValue,
    parentId: partitionParentId ?? IModel.rootSubjectId,
  });
  return insertPhysicalSubModel({ ...baseProps, modeledElementId: partitionKey.id });
}

export function insertPhysicalPartition(
  props: BaseInstanceInsertProps & { codeValue: string; parentId: Id64String } & Partial<
      Omit<InformationPartitionElementProps, "id" | "parent" | "code">
    >,
): InstanceKey {
  const { txn, classFullName, codeValue, parentId, ...partitionProps } = props;
  const defaultModelClassName = `BisCore.PhysicalPartition`;
  const className = classFullName ?? defaultModelClassName;
  const partitionId = txn.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: new Code({
      spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.informationPartitionElement).id,
      scope: parentId,
      value: codeValue,
    }),
    parent: { id: parentId, relClassName: `BisCore.SubjectOwnsPartitionElements` },
    ...partitionProps,
  });
  return { className, id: partitionId };
}

export function insertPhysicalSubModel(
  props: BaseInstanceInsertProps & { modeledElementId: Id64String } & Partial<
      Omit<GeometricModel3dProps, "id" | "modeledElement" | "parentModel">
    >,
): InstanceKey {
  const { txn, classFullName, modeledElementId, ...modelProps } = props;
  const defaultModelClassName = `BisCore.PhysicalModel`;
  const className = classFullName ?? defaultModelClassName;
  const modelId = txn.insertModel({
    classFullName: className,
    modeledElement: { id: modeledElementId },
    ...modelProps,
  });
  return { className, id: modelId };
}

export function insertDrawingModelWithPartition(
  props: BaseInstanceInsertProps & { codeValue: string; partitionParentId?: Id64String },
): InstanceKey {
  const { codeValue, partitionParentId, ...baseProps } = props;
  const partitionKey = insertDrawingPartition({
    ...baseProps,
    codeValue,
    parentId: partitionParentId ?? IModel.rootSubjectId,
  });
  return insertDrawingSubModel({ ...baseProps, modeledElementId: partitionKey.id });
}

export function insertDrawingPartition(
  props: BaseInstanceInsertProps & { codeValue: string; parentId: Id64String } & Partial<
      Omit<InformationPartitionElementProps, "id" | "parent" | "code" | "userLabel">
    >,
): InstanceKey {
  const { txn, classFullName, codeValue, parentId, ...partitionProps } = props;
  const defaultModelClassName = `BisCore.Drawing`;
  const className = classFullName ?? defaultModelClassName;
  const partitionId = txn.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: new Code({
      spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.informationPartitionElement).id,
      scope: parentId,
      value: codeValue,
    }),
    parent: { id: parentId, relClassName: `BisCore.SubjectOwnsPartitionElements` },
    ...partitionProps,
  });
  return { className, id: partitionId };
}

export function insertDrawingSubModel(
  props: BaseInstanceInsertProps & { modeledElementId: Id64String } & Partial<
      Omit<GeometricModel2dProps, "id" | "modeledElement" | "parentModel">
    >,
): InstanceKey {
  const { txn, classFullName, modeledElementId, ...modelProps } = props;
  const defaultModelClassName = `BisCore.DrawingModel`;
  const className = classFullName ?? defaultModelClassName;
  const modelId = txn.insertModel({
    classFullName: className,
    modeledElement: { id: modeledElementId },
    ...modelProps,
  });
  return { className, id: modelId };
}

export function insertSpatialCategory(
  props: BaseInstanceInsertProps & { codeValue: string; modelId?: Id64String } & Partial<
      Omit<CategoryProps, "id" | "model" | "parent" | "code">
    >,
): InstanceKey {
  const { txn, classFullName, modelId, codeValue, ...categoryProps } = props;
  const defaultClassName = `BisCore.SpatialCategory`;
  const className = classFullName ?? defaultClassName;
  const model = modelId ?? IModel.dictionaryId;
  const id = txn.insertElement({
    classFullName: className,
    model,
    code: new Code({
      spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.spatialCategory).id,
      scope: model,
      value: codeValue,
    }),
    ...categoryProps,
  });
  return { className, id };
}

export function insertDrawingCategory(
  props: BaseInstanceInsertProps & { codeValue: string; modelId?: Id64String } & Partial<
      Omit<CategoryProps, "id" | "model" | "parent" | "code">
    >,
): InstanceKey {
  const { txn, classFullName, modelId, codeValue, ...categoryProps } = props;
  const defaultClassName = `BisCore.DrawingCategory`;
  const className = classFullName ?? defaultClassName;
  const model = modelId ?? IModel.dictionaryId;
  const id = txn.insertElement({
    classFullName: className,
    model,
    code: new Code({
      spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.drawingCategory).id,
      scope: model,
      value: codeValue,
    }),
    ...categoryProps,
  });
  return { className, id };
}

export function getDefaultSubcategoryKey(categoryId: Id64String): InstanceKey {
  const pair = Id64.getUint32Pair(categoryId);
  pair.lower++; // id of default subcategory is always `category id + 1`
  return { className: `BisCore.SubCategory`, id: Id64.fromUint32PairObject(pair) };
}

export function insertSubCategory(
  props: BaseInstanceInsertProps & { codeValue: string; parentCategoryId: Id64String; modelId?: Id64String } & Partial<
      Omit<SubCategoryProps, "id" | "model" | "parent" | "code">
    >,
): InstanceKey {
  const { txn, classFullName, modelId, codeValue, parentCategoryId, ...subCategoryProps } = props;
  const defaultClassName = `BisCore.SubCategory`;
  const className = classFullName ?? defaultClassName;
  const model = modelId ?? IModel.dictionaryId;
  const id = txn.insertElement({
    classFullName: className,
    model,
    code: new Code({
      spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.subCategory).id,
      scope: model,
      value: codeValue,
    }),
    parent: { id: parentCategoryId, relClassName: `BisCore.CategoryOwnsSubCategories` },
    ...subCategoryProps,
  });
  return { className, id };
}

export function insertPhysicalElement<TAdditionalProps extends {}>(
  props: BaseInstanceInsertProps & {
    modelId: Id64String;
    categoryId: Id64String;
    codeValue?: string;
    parentId?: Id64String;
    typeDefinitionId?: Id64String;
  } & Partial<Omit<PhysicalElementProps, "id" | "model" | "category" | "parent" | "typeDefinition" | "code">> &
    TAdditionalProps,
): InstanceKey {
  const { txn, classFullName, modelId, categoryId, parentId, typeDefinitionId, codeValue, ...elementProps } = props;
  const defaultClassName = `Generic.PhysicalObject`;
  const className = classFullName ?? defaultClassName;
  const id = txn.insertElement({
    classFullName: className,
    model: modelId,
    category: categoryId,
    code: codeValue
      ? new Code({
          spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).id,
          scope: parentId ?? modelId,
          value: codeValue,
        })
      : Code.createEmpty(),
    ...(parentId ? { parent: { id: parentId, relClassName: `BisCore.PhysicalElementAssemblesElements` } } : undefined),
    ...(typeDefinitionId
      ? { typeDefinition: { id: typeDefinitionId, relClassName: `BisCore.PhysicalElementIsOfType` } }
      : undefined),
    ...elementProps,
  } satisfies PhysicalElementProps);
  return { className, id };
}

export function insertPhysicalType<TAdditionalProps extends {}>(
  props: BaseInstanceInsertProps & { modelId?: Id64String } & Partial<Omit<DefinitionElementProps, "id" | "model">> &
    TAdditionalProps,
): InstanceKey {
  const { txn, classFullName, modelId, ...elementProps } = props;
  const defaultClassName = `Generic.PhysicalType`;
  const className = classFullName ?? defaultClassName;
  const id = txn.insertElement({
    classFullName: className,
    model: modelId ?? IModel.dictionaryId,
    code: Code.createEmpty(),
    ...elementProps,
  } satisfies DefinitionElementProps);
  return { className, id };
}

export function insertPhysicalMaterial<TAdditionalProps extends {}>(
  props: BaseInstanceInsertProps & { modelId?: Id64String } & Partial<Omit<DefinitionElementProps, "id" | "model">> &
    TAdditionalProps,
): InstanceKey {
  const { txn, classFullName, modelId, ...elementProps } = props;
  const defaultClassName = `Generic.PhysicalMaterial`;
  const className = classFullName ?? defaultClassName;
  const id = txn.insertElement({
    classFullName: className,
    model: modelId ?? IModel.dictionaryId,
    code: Code.createEmpty(),
    ...elementProps,
  } satisfies DefinitionElementProps);
  return { className, id };
}

export function insertDrawingGraphic<TAdditionalProps extends {}>(
  props: BaseInstanceInsertProps & { modelId: Id64String; categoryId: Id64String; parentId?: Id64String } & Partial<
      Omit<GeometricElement2dProps, "id" | "model" | "category" | "parent">
    > &
    TAdditionalProps,
): InstanceKey {
  const { txn, classFullName, modelId, categoryId, parentId, ...elementProps } = props;
  const defaultClassName = `BisCore.DrawingGraphic`;
  const className = classFullName ?? defaultClassName;
  const id = txn.insertElement({
    classFullName: className,
    model: modelId,
    category: categoryId,
    code: Code.createEmpty(),
    ...(parentId ? { parent: { id: parentId, relClassName: `BisCore.ElementOwnsChildElements` } } : undefined),
    ...elementProps,
  } satisfies GeometricElement2dProps);
  return { className, id };
}

export function insertRepositoryLink(
  props: BaseInstanceInsertProps & { repositoryUrl?: string; repositoryLabel?: string } & Partial<
      Omit<RepositoryLinkProps, "id" | "model" | "url" | "userLabel">
    >,
): InstanceKey {
  const { txn, classFullName, repositoryUrl, repositoryLabel, ...repoLinkProps } = props;
  const defaultClassName = `BisCore.RepositoryLink`;
  const className = classFullName ?? defaultClassName;
  const id = txn.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    url: repositoryUrl,
    userLabel: repositoryLabel,
    code: Code.createEmpty(),
    ...repoLinkProps,
  } satisfies RepositoryLinkProps as ElementProps);
  return { className, id };
}

export function insertExternalSourceAspect(
  props: BaseInstanceInsertProps & { elementId: Id64String; identifier: string; repositoryId?: Id64String } & Partial<
      Omit<ExternalSourceAspectProps, "id" | "classFullName" | "element" | "source">
    >,
): InstanceKey {
  const { txn, repositoryId, elementId, identifier, ...externalSourceAspectProps } = props;
  const externalSourceId = txn.insertElement({
    classFullName: `BisCore.ExternalSource`,
    model: IModel.repositoryModelId,
    code: Code.createEmpty(),
    repository: repositoryId ? { id: repositoryId } : undefined,
  } satisfies ExternalSourceProps as ElementProps);

  const className = `BisCore.ExternalSourceAspect`;
  const id = txn.insertAspect({
    classFullName: className,
    kind: "ExternalSource",
    element: { id: elementId },
    source: { id: externalSourceId },
    scope: { id: elementId },
    identifier,
    ...externalSourceAspectProps,
  } satisfies ExternalSourceAspectProps as ElementAspectProps);

  return { className, id };
}

export function insertFunctionalModelWithPartition(
  props: BaseInstanceInsertProps & { codeValue: string; partitionParentId?: Id64String },
): InstanceKey {
  const { codeValue, partitionParentId, ...baseProps } = props;
  const partitionKey = insertFunctionalPartition({
    ...baseProps,
    codeValue,
    parentId: partitionParentId ?? IModel.rootSubjectId,
  });
  return insertFunctionalSubModel({ ...baseProps, modeledElementId: partitionKey.id });
}

export function insertFunctionalPartition(
  props: BaseInstanceInsertProps & { codeValue: string; parentId: Id64String } & Partial<
      Omit<InformationPartitionElementProps, "id" | "parent" | "code">
    >,
): InstanceKey {
  const { txn, classFullName, codeValue, parentId, ...partitionProps } = props;
  const defaultModelClassName = `Functional.FunctionalPartition`;
  const className = classFullName ?? defaultModelClassName;
  const partitionId = txn.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: new Code({
      spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.informationPartitionElement).id,
      scope: parentId,
      value: codeValue,
    }),
    parent: { id: parentId, relClassName: `BisCore.SubjectOwnsPartitionElements` },
    ...partitionProps,
  });
  return { className, id: partitionId };
}

export function insertFunctionalSubModel(
  props: BaseInstanceInsertProps & { modeledElementId: Id64String } & Partial<
      Omit<GeometricModel3dProps, "id" | "modeledElement" | "parentModel">
    >,
): InstanceKey {
  const { txn, classFullName, modeledElementId, ...modelProps } = props;
  const defaultModelClassName = `Functional.FunctionalModel`;
  const className = classFullName ?? defaultModelClassName;
  const modelId = txn.insertModel({
    classFullName: className,
    modeledElement: { id: modeledElementId },
    ...modelProps,
  });
  return { className, id: modelId };
}

export function insertFunctionalElement(
  props: BaseInstanceInsertProps & {
    modelId: Id64String;
    representedElementId: Id64String;
    relationshipName: "DrawingGraphicRepresentsFunctionalElement" | "PhysicalElementFulfillsFunction";
    parentId?: string;
  } & Partial<Omit<FunctionalElementProps, "id" | "parent" | "code" | "model">>,
): InstanceKey {
  const { txn, modelId, representedElementId, relationshipName, parentId, ...elementProps } = props;
  const className = `Functional.FunctionalComposite`;
  const id = txn.insertElement({
    classFullName: className,
    model: modelId,
    code: Code.createEmpty(),
    parent: parentId ? { id: parentId, relClassName: `BisCore.ElementOwnsChildElements` } : undefined,
    ...elementProps,
  } satisfies FunctionalElementProps);
  txn.insertRelationship({
    sourceId: representedElementId,
    targetId: id,
    classFullName: `Functional.${relationshipName}`,
  });
  return { className, id };
}

export function insertGroupInformationModelWithPartition(
  props: BaseInstanceInsertProps & { codeValue: string; partitionParentId?: Id64String },
): InstanceKey {
  const { codeValue, partitionParentId, ...baseProps } = props;
  const partitionKey = insertGroupInformationPartition({
    ...baseProps,
    codeValue,
    parentId: partitionParentId ?? IModel.rootSubjectId,
  });
  return insertGroupInformationSubModel({ ...baseProps, modeledElementId: partitionKey.id });
}

export function insertGroupInformationPartition(
  props: BaseInstanceInsertProps & { codeValue: string; parentId: Id64String } & Partial<
      Omit<InformationPartitionElementProps, "id" | "parent" | "code">
    >,
): InstanceKey {
  const { txn, classFullName, codeValue, parentId, ...partitionProps } = props;
  const defaultModelClassName = `BisCore.GroupInformationPartition`;
  const className = classFullName ?? defaultModelClassName;
  const partitionId = txn.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: new Code({
      spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.informationPartitionElement).id,
      scope: parentId,
      value: codeValue,
    }),
    parent: { id: parentId, relClassName: `BisCore.SubjectOwnsPartitionElements` },
    ...partitionProps,
  });
  return { className, id: partitionId };
}

export function insertGroupInformationSubModel(
  props: BaseInstanceInsertProps & { modeledElementId: Id64String } & Partial<
      Omit<GeometricModel3dProps, "id" | "modeledElement" | "parentModel">
    >,
): InstanceKey {
  const { txn, classFullName, modeledElementId, ...modelProps } = props;
  const defaultModelClassName = `Generic.GroupModel`;
  const className = classFullName ?? defaultModelClassName;
  const modelId = txn.insertModel({
    classFullName: className,
    modeledElement: { id: modeledElementId },
    ...modelProps,
  });
  return { className, id: modelId };
}

export function insertGroupInformationElement(
  props: BaseInstanceInsertProps & { modelId: Id64String } & Partial<
      Omit<FunctionalElementProps, "id" | "parent" | "code" | "model">
    >,
): InstanceKey {
  const { txn, modelId, ...elementProps } = props;
  const className = `Generic.Group`;
  const id = txn.insertElement({ classFullName: className, model: modelId, code: Code.createEmpty(), ...elementProps });
  return { className, id };
}

export function insertSheetIndexFolder(
  props: BaseInstanceInsertProps & Partial<Omit<SheetIndexFolderProps, "id" | "parent" | "code" | "model">>,
): InstanceKey {
  const { txn, ...elementProps } = props;
  const className = `BisCore.SheetIndexFolder`;
  const id = txn.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: Code.createEmpty(),
    ...elementProps,
  });
  return { className, id };
}

export interface GetFullSchemaXmlProps {
  schemaName: string;
  schemaAlias?: string;
  schemaVersion?: `${string}.${string}.${string}`;
  schemaContentXml: string;
}

/**
 * Adds boilerplate to the XML schema.
 */
export function getFullSchemaXml(props: GetFullSchemaXmlProps) {
  const schemaAlias = props.schemaAlias ?? `test`;
  return `
    <?xml version="1.0" encoding="UTF-8"?>
    <ECSchema schemaName="${props.schemaName}" alias="${schemaAlias}" version="${props.schemaVersion ?? "01.00.00"}" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      <ECSchemaReference name="CoreCustomAttributes" version="01.00.03" alias="CoreCA" />
      <ECSchemaReference name="ECDbMap" version="02.00.01" alias="ecdbmap" />
      ${props.schemaContentXml}
    </ECSchema>
  `;
}

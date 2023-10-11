/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECDb } from "@itwin/core-backend";
import { Id64, Id64String } from "@itwin/core-bentley";
import {
  BisCodeSpec,
  CategoryProps,
  Code,
  ExternalSourceAspectProps,
  ExternalSourceProps,
  GeometricElement2dProps,
  GeometricModel2dProps,
  GeometricModel3dProps,
  IModel,
  InformationPartitionElementProps,
  PhysicalElementProps,
  RepositoryLinkProps,
  SubCategoryProps,
  SubjectProps,
} from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { buildTestIModel, createFileNameFromString, setupOutputFileLocation, TestIModelBuilder } from "@itwin/presentation-testing";

export async function withECDb<TResult extends {}>(
  mochaContext: Mocha.Context,
  setup: (db: ECDb, mochaContext: Mocha.Context) => Promise<TResult>,
  use: (db: ECDb, res: TResult) => Promise<void>,
) {
  let res!: TResult;
  const name = createFileNameFromString(mochaContext.test!.fullTitle());
  const outputFile = setupOutputFileLocation(name);
  const db = new ECDb();
  db.createDb(outputFile);
  try {
    res = await setup(db, mochaContext);
  } catch (e) {
    db.dispose();
    throw e;
  } finally {
    db.saveChanges("Created test ECDb");
  }
  try {
    await use(db, res);
  } finally {
    db.dispose();
  }
}

export async function buildIModel(
  mochaContext: Mocha.Context,
  setup?: (builder: TestIModelBuilder, mochaContext: Mocha.Context) => Promise<void>,
): Promise<{ imodel: IModelConnection }>;
export async function buildIModel<TResult extends {}>(
  mochaContext: Mocha.Context,
  setup: (builder: TestIModelBuilder, mochaContext: Mocha.Context) => Promise<TResult>,
): Promise<{ imodel: IModelConnection } & TResult>;
export async function buildIModel<TResult extends {} | undefined>(
  mochaContext: Mocha.Context,
  setup?: (builder: TestIModelBuilder, mochaContext: Mocha.Context) => Promise<TResult>,
) {
  let res!: TResult;
  // eslint-disable-next-line deprecation/deprecation
  const imodel = await buildTestIModel(mochaContext, async (builder) => {
    if (setup) {
      res = await setup(builder, mochaContext);
    }
  });
  return { ...res, imodel };
}

export async function importSchema(
  mochaContext: Mocha.Context,
  imodel: { importSchema: (xml: string) => void | Promise<void> },
  classes: string[],
  schemaReferences?: string[],
) {
  const schemaName = `SCHEMA_${mochaContext.test!.fullTitle()}`.replace(/[^\w\d_]/gi, "_").replace(/_+/g, "_");
  const schemaAlias = `test`;
  const schemaXml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <ECSchema schemaName="${schemaName}" alias="${schemaAlias}" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
      <ECSchemaReference name="CoreCustomAttributes" version="01.00.03" alias="CoreCA" />
      <ECSchemaReference name="ECDbMap" version="02.00.01" alias="ecdbmap" />
      ${schemaReferences?.map((referenceXml) => referenceXml).join("\n") ?? ""}
      ${classes.map((classXml) => classXml).join("\n")}
    </ECSchema>
  `;
  await imodel.importSchema(schemaXml);
  return {
    schemaName,
    schemaAlias,
    classes: classes.reduce<{ [className: string]: { name: string; fullName: string } }>((classesObj, classXml) => {
      const className = parseClassNameFromXml(classXml);
      return {
        ...classesObj,
        [className]: {
          name: className,
          fullName: `${schemaName}.${className}`,
        },
      };
    }, {}),
  };
}

function parseClassNameFromXml(xml: string) {
  const re = /typename="([\w\d_]+)"/i;
  const match = xml.match(re);
  if (!match) {
    throw new Error(`Given XML doesn't contain a "typename": ${xml}`);
  }
  return match[1];
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

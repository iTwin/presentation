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
  GeometricModel3dProps,
  IModel,
  InformationPartitionElementProps,
  PhysicalElementProps,
  RepositoryLinkProps,
  SubCategoryProps,
  SubjectProps,
} from "@itwin/core-common";
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

export async function buildIModel<TResult extends {}>(
  mochaContext: Mocha.Context,
  setup: (builder: TestIModelBuilder, mochaContext: Mocha.Context) => Promise<TResult>,
) {
  let res!: TResult;
  // eslint-disable-next-line deprecation/deprecation
  const imodel = await buildTestIModel(mochaContext, async (builder) => {
    res = await setup(builder, mochaContext);
  });
  return { ...res, imodel };
}

export async function importSchema(
  mochaContext: Mocha.Context,
  imodel: { importSchema: (xml: string) => void | Promise<void> },
  classes: string[],
  schemaReferences?: string[],
) {
  const schemaName = `schema-${mochaContext.currentTest!.fullTitle()}`;
  const schemaAlias = `test`;
  const schemaXml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <ECSchema schemaName="${schemaName}" alias="${schemaAlias}" version="01.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.1">
      <ECSchemaReference name="CoreCustomAttributes" version="1.0" alias="CoreCA" />
      <ECSchemaReference name="ECDbMap" version="2.0" alias="ecdbmap" />
      ${schemaReferences?.map((referenceXml) => referenceXml)}
      ${classes.map((classXml) => classXml)}
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
  const partitionKey = insertPhysicalPartition({ builder, label, parentId: partitionParentId ?? IModel.rootSubjectId });
  return insertPhysicalSubModel({ builder, modeledElementId: partitionKey.id });
}

export function insertPhysicalPartition(
  props: { builder: TestIModelBuilder; label: string; parentId: Id64String } & Partial<
    Omit<InformationPartitionElementProps, "id" | "parent" | "code" | "userLabel">
  >,
) {
  const { builder, classFullName, label, parentId, ...partitionProps } = props;
  const defaultModelClassName = "BisCore:PhysicalPartition";
  const className = classFullName ?? defaultModelClassName;
  const partitionId = builder.insertElement({
    classFullName: className,
    model: IModel.repositoryModelId,
    code: builder.createCode(parentId, BisCodeSpec.informationPartitionElement, label),
    parent: {
      id: parentId,
      relClassName: "BisCore:SubjectOwnsPartitionElements",
    },
    ...partitionProps,
  });
  return { className, id: partitionId };
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

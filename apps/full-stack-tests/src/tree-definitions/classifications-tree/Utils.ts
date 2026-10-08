/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import { createRequire } from "node:module";
import { BisCodeSpec, Code, IModel } from "@itwin/core-common";
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { createClassificationsTree } from "@itwin/presentation-tree-definitions";
import { importSchema } from "../../SchemaUtils.js";
import { createIModelAccess } from "../Common.js";

import type { EditTxn, IModelDb } from "@itwin/core-backend";
import type { Id64String } from "@itwin/core-bentley";
import type { DefinitionElementProps } from "@itwin/core-common";
import type { IModelConnection } from "@itwin/core-frontend";
import type { HierarchyProvider } from "@itwin/presentation-hierarchies";
import type { EC } from "@itwin/presentation-shared";
import type { ClassificationsTreeHierarchyConfiguration } from "@itwin/presentation-tree-definitions/internal";

function insertDefinitionSubModel(props: {
  txn: EditTxn;
  modeledElementId: Id64String;
  relationshipName: EC.FullClassNameDotNotation;
}) {
  const { txn, modeledElementId, relationshipName } = props;
  txn.insertModel({
    classFullName: `BisCore.DefinitionModel`,
    modeledElement: { id: modeledElementId, relClassName: relationshipName },
  });
}

export function createClassificationsTreeProvider(
  imodel: IModelConnection,
  hierarchyConfig: ClassificationsTreeHierarchyConfiguration,
): HierarchyProvider & Disposable {
  const imodelAccess = createIModelAccess(imodel);
  const { definition } = createClassificationsTree({ imodelAccess, hierarchyConfig });
  const hierarchyProvider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition: definition });
  return {
    hierarchyChanged: hierarchyProvider.hierarchyChanged,
    getNodes: (props) => hierarchyProvider.getNodes(props),
    getNodeInstanceKeys: (props) => hierarchyProvider.getNodeInstanceKeys(props),
    setFormatter: (formatter) => hierarchyProvider.setFormatter(formatter),
    setHierarchySearch: (props) => hierarchyProvider.setHierarchySearch(props),
    [Symbol.dispose]() {
      hierarchyProvider[Symbol.dispose]();
    },
  };
}

export function insertClassificationSystem(
  props: { txn: EditTxn; modelId?: Id64String; codeValue?: string } & Partial<
    Omit<DefinitionElementProps, "id" | "parent" | "code" | "model">
  >,
) {
  const { txn, codeValue, modelId, ...elementProps } = props;
  const className: EC.FullClassNameDotNotation = `ClassificationSystems.ClassificationSystem`;
  const id = txn.insertElement({
    classFullName: className,
    model: modelId ?? IModel.dictionaryId,
    code: codeValue
      ? new Code({
          spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).id,
          scope: modelId ?? IModel.dictionaryId,
          value: codeValue,
        })
      : Code.createEmpty(),
    ...elementProps,
  });
  return { className, id };
}

export function insertClassificationTable(
  props: { txn: EditTxn; modelId?: Id64String; parentId?: Id64String; codeValue?: string } & Partial<
    Omit<DefinitionElementProps, "id" | "parent" | "code" | "model">
  >,
) {
  const { txn, codeValue, modelId, parentId, ...elementProps } = props;
  const className: EC.FullClassNameDotNotation = `ClassificationSystems.ClassificationTable`;
  const id = txn.insertElement({
    classFullName: className,
    model: modelId ?? IModel.dictionaryId,
    code: codeValue
      ? new Code({
          spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).id,
          scope: parentId ?? modelId ?? IModel.dictionaryId,
          value: codeValue,
        })
      : Code.createEmpty(),
    parent: parentId
      ? { id: parentId, relClassName: "ClassificationSystems.ClassificationSystemOwnsClassificationTable" }
      : undefined,
    ...elementProps,
  });
  insertDefinitionSubModel({
    txn,
    modeledElementId: id,
    relationshipName: "ClassificationSystems.DefinitionModelBreaksDownClassificationTable",
  });
  return { className, id };
}

export function insertClassification(
  props: { txn: EditTxn; modelId: Id64String; parentId?: Id64String; codeValue?: string } & Partial<
    Omit<DefinitionElementProps, "id" | "parent" | "code" | "model">
  >,
) {
  const { txn, codeValue, modelId, parentId, ...elementProps } = props;
  const className: EC.FullClassNameDotNotation = `ClassificationSystems.Classification`;
  const id = txn.insertElement({
    classFullName: className,
    model: modelId,
    code: codeValue
      ? new Code({
          spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).id,
          scope: parentId ?? modelId,
          value: codeValue,
        })
      : Code.createEmpty(),
    parent: parentId
      ? { id: parentId, relClassName: "ClassificationSystems.ClassificationOwnsSubClassifications" }
      : undefined,
    ...elementProps,
  });
  return { className, id };
}

export function insertElementHasClassificationsRelationship(props: {
  txn: EditTxn;
  elementId: Id64String;
  classificationId: Id64String;
}) {
  const { txn, elementId, classificationId } = props;
  return txn.insertRelationship({
    classFullName: "ClassificationSystems.ElementHasClassifications",
    sourceId: elementId,
    targetId: classificationId,
  });
}

export async function importClassificationSchema(imodel: IModelDb) {
  const require = createRequire(import.meta.url);
  const schemaPath = require.resolve("@bentley/classification-systems-schema/ClassificationSystems.ecschema.xml");
  const schemaXml = fs.readFileSync(fs.realpathSync(schemaPath), { encoding: "utf-8" });
  await imodel.importSchemaStrings([schemaXml]);
}

export const CATEGORY_SYMBOLIZES_CLASSIFICATION_RELATIONSHIP_SCHEMA = "TestClassificationSchema";

export function insertCategorySymbolizesClassificationRelationship(props: {
  txn: EditTxn;
  categoryId: Id64String;
  classificationId: Id64String;
}) {
  const { txn, categoryId, classificationId } = props;
  return txn.insertRelationship({
    classFullName: `${CATEGORY_SYMBOLIZES_CLASSIFICATION_RELATIONSHIP_SCHEMA}.CategorySymbolizesClassification`,
    sourceId: categoryId,
    targetId: classificationId,
  });
}

export function insertClassificationIsSymbolizedByCategoryRelationship(props: {
  txn: EditTxn;
  categoryId: Id64String;
  classificationId: Id64String;
}) {
  const { txn, categoryId, classificationId } = props;
  return txn.insertRelationship({
    classFullName: `${CATEGORY_SYMBOLIZES_CLASSIFICATION_RELATIONSHIP_SCHEMA}.ClassificationIsSymbolizedByCategory`,
    sourceId: classificationId,
    targetId: categoryId,
  });
}

export async function importCategorySymbolizesClassificationSchema(imodel: IModelDb) {
  // cspell:disable
  await importSchema(
    { schemaName: CATEGORY_SYMBOLIZES_CLASSIFICATION_RELATIONSHIP_SCHEMA, schemaAlias: "tst" },
    imodel,
    `
      <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
      <ECSchemaReference name="ClassificationSystems" version="01.00.04" alias="clsf" />
      <ECRelationshipClass typeName="CategorySymbolizesClassification" modifier="None" strength="referencing">
        <BaseClass>bis.ElementRefersToElements</BaseClass>
        <Source multiplicity="(0..*)" roleLabel="symbolizes" polymorphic="true">
          <Class class="bis.Category" />
        </Source>
        <Target multiplicity="(0..*)" roleLabel="is symbolized by" polymorphic="true">
          <Class class="clsf.Classification" />
        </Target>
      </ECRelationshipClass>
      <ECRelationshipClass typeName="ClassificationIsSymbolizedByCategory" modifier="None" strength="referencing">
        <BaseClass>bis.ElementRefersToElements</BaseClass>
        <Source multiplicity="(0..*)" roleLabel="is symbolized by" polymorphic="true">
          <Class class="clsf.Classification" />
        </Source>
        <Target multiplicity="(0..*)" roleLabel="symbolizes" polymorphic="true">
          <Class class="bis.Category" />
        </Target>
      </ECRelationshipClass>
    `,
  );
  // cspell:enable
}

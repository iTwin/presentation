/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertDrawingCategory,
  insertDrawingGraphic,
  insertDrawingModelWithPartition,
  insertDrawingSubModel,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalSubModel,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { BisCodeSpec, Code, IModel } from "@itwin/core-common";
import { TestSchema } from "../../IModelUtils.js";

import type { EditTxn } from "@itwin/core-backend";
import type { Id64String } from "@itwin/core-bentley";
import type { ElementProps, ModelProps } from "@itwin/core-common";
import type { EC, InstanceKey } from "@itwin/presentation-shared";
import type { ElementId } from "../../../tree-definitions/shared/Types.js";

export function insertDefinitionContainer(
  props: {
    txn: EditTxn;
    classFullName?: EC.FullClassNameDotNotation;
    codeValue: string;
    modelId?: Id64String;
    isPrivate?: boolean;
  } & Partial<Omit<ElementProps, "id" | "model" | "parent" | "code">>,
): InstanceKey {
  const { txn, classFullName, modelId, codeValue, ...elementProps } = props;
  const className = classFullName ?? `BisCore.DefinitionContainer`;
  const model = modelId ?? IModel.dictionaryId;
  const id = txn.insertElement({
    classFullName: className,
    model,
    code: new Code({
      spec: txn.iModel.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).id,
      scope: model,
      value: codeValue,
    }),
    ...elementProps,
  });
  return { className, id };
}

export function insertSubModel(
  props: {
    txn: EditTxn;
    classFullName: EC.FullClassNameDotNotation;
    modeledElementId: Id64String;
    relationshipName?: EC.FullClassNameDotNotation;
  } & Partial<Omit<ModelProps, "id" | "modeledElement" | "parentModel">>,
): InstanceKey {
  const { txn, classFullName, modeledElementId, relationshipName, ...modelProps } = props;
  const id = txn.insertModel({
    classFullName,
    modeledElement: { id: modeledElementId, relClassName: relationshipName },
    ...modelProps,
  });
  return { className: classFullName, id };
}

export function getInsertFunctionByViewType(viewType: "2d" | "3d") {
  const insertCategory = viewType === "3d" ? insertSpatialCategory : insertDrawingCategory;
  const insertElement = viewType === "3d" ? insertPhysicalElement : insertDrawingGraphic;
  const insertElementsModel = viewType === "3d" ? insertPhysicalModelWithPartition : insertDrawingModelWithPartition;
  const insertElementsSubModel =
    viewType === "3d"
      ? insertPhysicalSubModel
      : (props: { txn: EditTxn; modeledElementId: string }) =>
          insertDrawingSubModel({ ...props, classFullName: `${TestSchema.name}.${TestSchema.subModel2dClassName}` });
  const insertModeledElement = (props: {
    txn: EditTxn;
    modelId: Id64String;
    categoryId: Id64String;
    parentId?: ElementId;
    userLabel?: string;
  }): InstanceKey =>
    insertElement({
      ...props,
      classFullName: `${TestSchema.name}.${viewType === "3d" ? TestSchema.modeledElement3dClassName : TestSchema.modeledElement2dClassName}`,
    });
  return { insertCategory, insertElement, insertElementsModel, insertElementsSubModel, insertModeledElement };
}

export function getDefaultSubCategoryId(categoryId: Id64String) {
  const categoryIdNumber = Number.parseInt(categoryId, 16);
  const subCategoryId = `0x${(categoryIdNumber + 1).toString(16)}`;
  return subCategoryId;
}

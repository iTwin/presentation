/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from "node:crypto";
import {
  insertDrawingPartition,
  insertDrawingSubModel,
  insertPhysicalPartition,
  insertPhysicalSubModel,
} from "presentation-test-utilities";
import { expect } from "vitest";
import { IModel } from "@itwin/core-common";
import { buildTestIModel } from "../IModelUtils.js";
import { importSchema } from "../SchemaUtils.js";

import type { EditTxn, IModelDb } from "@itwin/core-backend";
import type { Id64String } from "@itwin/core-bentley";
import type { ModelProps } from "@itwin/core-common";
import type { IModelConnection } from "@itwin/core-frontend";
import type { EC } from "@itwin/presentation-shared";

function getUniqueIModelName(): string {
  const testName =
    expect.getState().currentTestName?.replace(/[^\w]/gi, "-").replace(/-+/g, "-").toLowerCase() ?? "unknown";
  // `currentTestName` is the same for every `buildIModel` call made within a single test (or `undefined`/"unknown" when called
  // outside of a test, e.g. in `beforeAll`), and can also collide across different test files running in parallel. Appending a
  // random suffix avoids different imodels colliding on the same backing file, which would corrupt already open connections.
  return `${testName}-${randomUUID()}`;
}

export namespace TestSchema {
  export const name = "TestSchema";
  export const modeledElement2dClassName = "SubModelableDrawingGraphic";
  export const subModel2dClassName = "DrawingGraphicModel";
  export const modeledElement3dClassName = "SubModelablePhysicalObject";
}

export function insertGeometricModelWithPartition({
  txn,
  codeValue,
  viewType = "3d",
  partitionParentId = IModel.rootSubjectId,
  ...modelFlags
}: { txn: EditTxn; codeValue: string; viewType?: "2d" | "3d"; partitionParentId?: Id64String } & Pick<
  ModelProps,
  "isPrivate" | "isTemplate"
>) {
  const insertPartition = viewType === "3d" ? insertPhysicalPartition : insertDrawingPartition;
  const insertModel = viewType === "3d" ? insertPhysicalSubModel : insertDrawingSubModel;
  const partition = insertPartition({ txn, codeValue, parentId: partitionParentId });
  return insertModel({ txn, modeledElementId: partition.id, ...modelFlags });
}

export async function buildIModel(
  setup?: (imodel: IModelDb, testSchema: TestSchemaDefinition) => Promise<void>,
): Promise<{ imodelConnection: IModelConnection } & AsyncDisposable>;
export async function buildIModel<TResult extends object>(
  setup: (imodel: IModelDb, testSchema: TestSchemaDefinition) => Promise<TResult>,
): Promise<{ imodelConnection: IModelConnection } & TResult & AsyncDisposable>;
export async function buildIModel<TResult extends object | undefined>(
  setup?: (imodel: IModelDb, testSchema: TestSchemaDefinition) => Promise<TResult>,
) {
  const testName = getUniqueIModelName();
  const res = await buildTestIModel(testName, async (imodel) => {
    const testSchema = (await importSchema(
      { schemaName: TestSchema.name, schemaAlias: "test" },
      imodel,
      `
        <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
        <ECEntityClass typeName="${TestSchema.modeledElement3dClassName}" displayLabel="Test Physical Object" modifier="Sealed" description="Similar to generic:PhysicalObject but also sub-modelable.">
          <BaseClass>bis:PhysicalElement</BaseClass>
          <BaseClass>bis:ISubModeledElement</BaseClass>
        </ECEntityClass>
        <ECEntityClass typeName="${TestSchema.modeledElement2dClassName}" displayLabel="Test Drawing Graphic" modifier="Sealed" description="A sub-modelable 2d graphic that is a sibling of bis:DrawingGraphic (not derived from it).">
          <BaseClass>bis:GraphicalElement2d</BaseClass>
          <BaseClass>bis:ISubModeledElement</BaseClass>
        </ECEntityClass>
        <ECEntityClass typeName="${TestSchema.subModel2dClassName}" displayLabel="Drawing Graphic Model" modifier="Sealed" description="A 2d geometric model that can sub-model a DrawingGraphic element.">
          <BaseClass>bis:GraphicalModel2d</BaseClass>
        </ECEntityClass>
        <ECRelationshipClass typeName="DrawingGraphicModelBreaksDownSubModelableDrawingGraphic" strength="embedding" strengthDirection="backward" modifier="None">
          <BaseClass>bis:ModelModelsElement</BaseClass>
          <Source multiplicity="(0..1)" roleLabel="models" polymorphic="true">
              <Class class="DrawingGraphicModel"/>
          </Source>
          <Target multiplicity="(0..1)" roleLabel="is modeled by" polymorphic="true">
              <Class class="SubModelableDrawingGraphic"/>
          </Target>
        </ECRelationshipClass>
      `,
    )) as TestSchemaDefinition;
    const setupResult = setup ? await setup(imodel, testSchema) : undefined;
    return { ...setupResult, testSchema };
  });
  return {
    ...res,
    [Symbol.asyncDispose]: async () => {
      await res.imodelConnection.close();
    },
  };
}

interface TestSchemaDefinition extends Awaited<ReturnType<typeof importSchema>> {
  items: {
    [TestSchema.modeledElement3dClassName]: { name: string; fullName: EC.FullClassNameDotNotation; label: string };
    [TestSchema.modeledElement2dClassName]: { name: string; fullName: EC.FullClassNameDotNotation; label: string };
    [TestSchema.subModel2dClassName]: { name: string; fullName: EC.FullClassNameDotNotation; label: string };
  };
}

/** Imports one element class hidden by `HiddenClass` and one hidden by its schema's `HiddenSchema` attribute. */
export async function importHiddenElementClasses(
  imodel: IModelDb,
  baseClassName: "PhysicalElement" | "GraphicalElement2d" = "PhysicalElement",
): Promise<Record<"hiddenClass" | "hiddenSchema", EC.FullClassNameDotNotation>> {
  const importHiddenElementClass = async (
    schemaName: string,
    schemaAlias: string,
    customAttributeName: "HiddenClass" | "HiddenSchema",
  ) => {
    const customAttributes = `<ECCustomAttributes><${customAttributeName} xmlns="CoreCustomAttributes.01.00.01" /></ECCustomAttributes>`;
    const schema = await importSchema(
      { schemaName, schemaAlias },
      imodel,
      `
        <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
        ${customAttributeName === "HiddenSchema" ? customAttributes : ""}
        <ECEntityClass typeName="HiddenElement">
          <BaseClass>bis:${baseClassName}</BaseClass>
          ${customAttributeName === "HiddenClass" ? customAttributes : ""}
        </ECEntityClass>
      `,
    );
    return schema.items.HiddenElement.fullName;
  };
  return {
    hiddenClass: await importHiddenElementClass("HiddenClassTest", "hiddenClass", "HiddenClass"),
    hiddenSchema: await importHiddenElementClass("HiddenSchemaTest", "hiddenSchema", "HiddenSchema"),
  };
}

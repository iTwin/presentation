/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelDb, IModelJsFs, SnapshotDb, StandaloneDb } from "@itwin/core-backend";
import { OpenMode } from "@itwin/core-bentley";
import { Code } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { Schema, SchemaContext } from "@itwin/ecschema-metadata";
import { createFileNameFromString, getTestName, setupOutputFileLocation } from "./FilenameUtils.js";

import type { ECDb } from "@itwin/core-backend";
import type { Id64String } from "@itwin/core-bentley";
import type {
  BisCodeSpec,
  CodeScopeProps,
  ElementAspectProps,
  ElementProps,
  ModelProps,
  RelationshipProps,
} from "@itwin/core-common";
import type { SchemaInfo, SchemaKey, SchemaMatchType } from "@itwin/ecschema-metadata";

export interface IIModelBuilder {
  insertModel<TProps extends ModelProps>(props: TProps): Id64String;
  insertElement<TProps extends ElementProps>(props: TProps): Id64String;
  insertAspect<TProps extends ElementAspectProps>(props: TProps): Id64String;
  insertRelationship<TProps extends RelationshipProps>(props: TProps): Id64String;
  createCode(scopeModelId: CodeScopeProps, codeSpecName: BisCodeSpec, codeValue: string): Code;
  importSchema(schemaXml: string): Promise<void>;
  deleteElement(elementId: Id64String): void;
  updateElement<TProps extends ElementProps>(props: Partial<Omit<TProps, "id">> & { id: Id64String }): void;
}

export class TestIModelBuilderImpl implements IIModelBuilder {
  private _imodel: IModelDb;

  constructor(iModel: IModelDb) {
    this._imodel = iModel;
  }

  public insertModel<TProps extends ModelProps>(props: TProps): Id64String {
    return this._imodel.models.insertModel(props);
  }

  public insertElement<TProps extends ElementProps>(props: TProps): Id64String {
    return this._imodel.elements.insertElement(props);
  }

  public insertAspect<TProps extends ElementAspectProps>(props: TProps): Id64String {
    return this._imodel.elements.insertAspect(props);
  }

  public insertRelationship<TProps extends RelationshipProps>(props: TProps): Id64String {
    return this._imodel.relationships.insertInstance(props);
  }

  public deleteElement(elementId: Id64String): void {
    this._imodel.elements.deleteElement(elementId);
  }

  public updateElement<TProps extends ElementProps>(props: Partial<Omit<TProps, "id">> & { id: Id64String }): void {
    this._imodel.elements.updateElement(props);
  }

  public createCode(scopeModelId: CodeScopeProps, codeSpecName: BisCodeSpec, codeValue: string): Code {
    const codeSpec = this._imodel.codeSpecs.getByName(codeSpecName);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  public async importSchema(schemaXml: string) {
    await this._imodel.importSchemaStrings([schemaXml]);
  }
}

/**
 * Create test iModel and returns a connection to it.
 *
 * **Note:** do not call this function outside `it` block without name. It uses `expect.getState().currentTestName` to determine the test name.
 */
export async function buildTestIModel<TResult extends {} | void>(
  cb: (builder: IIModelBuilder, testName: string) => TResult | Promise<TResult>,
): Promise<TResult & { imodel: TestIModelConnection }>;
export async function buildTestIModel<TResult extends {} | void>(
  name: string,
  cb: (builder: IIModelBuilder, testName: string) => TResult | Promise<TResult>,
): Promise<TResult & { imodel: TestIModelConnection }>;
export async function buildTestIModel(
  cb?: (builder: IIModelBuilder, testName: string) => void | Promise<void>,
): Promise<{ imodel: TestIModelConnection }>;
export async function buildTestIModel(
  name: string,
  cb?: (builder: IIModelBuilder, testName: string) => void | Promise<void>,
): Promise<{ imodel: TestIModelConnection }>;
export async function buildTestIModel<TResult extends {} | void>(
  nameOrCb?: string | ((builder: IIModelBuilder, testName: string) => TResult | Promise<TResult>),
  cb?: (builder: IIModelBuilder, testName: string) => TResult | Promise<TResult>,
): Promise<TResult & { imodel: TestIModelConnection }> {
  const name = typeof nameOrCb === "string" ? nameOrCb : getTestName();
  const callback = typeof nameOrCb === "function" ? nameOrCb : cb;
  const fileName = createFileNameFromString(`${name}.bim`);
  const outputFile = setupOutputFileLocation(fileName);
  const db = SnapshotDb.createEmpty(outputFile, { rootSubject: { name } });
  const builder = new TestIModelBuilderImpl(db);
  let result!: TResult;
  try {
    if (callback) {
      result = await callback(builder, name);
    }
  } finally {
    db.saveChanges("Created test IModel");
    db.close();
  }
  return { ...result, imodel: TestIModelConnection.openFile(outputFile) };
}

async function cloneIModel<TResult extends {}>(
  sourceIModelPath: string,
  targetIModelName: string,
  setup: (db: IIModelBuilder) => Promise<TResult>,
): Promise<TResult & { imodel: IModelConnection; imodelPath: string }> {
  const targetIModelPath = setupOutputFileLocation(`${targetIModelName}.bim`);
  IModelJsFs.existsSync(targetIModelPath) && IModelJsFs.unlinkSync(targetIModelPath);
  IModelJsFs.copySync(sourceIModelPath, targetIModelPath);

  const imodel = StandaloneDb.openFile(targetIModelPath, OpenMode.ReadWrite);
  try {
    const res = await setup(new TestIModelBuilderImpl(imodel));
    imodel.saveChanges("Updated cloned iModel");
    return { ...res, imodel: new TestIModelConnection(imodel, targetIModelPath), imodelPath: targetIModelPath };
  } catch (e) {
    imodel.close();
    throw e;
  }
}

export async function createChangedIModels<TResultBase extends {}, TResultChangeset1 extends {}>(
  setupBase: (imodel: IIModelBuilder) => Promise<TResultBase>,
  setupChangeset1: (imodel: IIModelBuilder, before: TResultBase) => Promise<TResultChangeset1>,
) {
  const testName = getTestName();
  const base = await buildTestIModel(`${testName}-base`, setupBase);
  const baseIModelPath = base.imodel.filePath;
  const changeset1 = await cloneIModel(baseIModelPath, `${testName}-changeset1`, async (ecdb) =>
    setupChangeset1(ecdb, base),
  );
  return {
    base,
    changeset1,
    async [Symbol.asyncDispose]() {
      await base.imodel.close();
      await changeset1.imodel.close();
    },
  };
}

export function createSchemaContext(imodel: IModelConnection | IModelDb | ECDb) {
  if (imodel instanceof IModelConnection) {
    return imodel.schemaContext;
  }
  if (imodel instanceof IModelDb) {
    return imodel.schemaContext;
  }
  const schemas = new SchemaContext();
  schemas.addLocater({
    getSchemaSync<T extends Schema>(
      _schemaKey: Readonly<SchemaKey>,
      _matchType: SchemaMatchType,
      _schemaContext: SchemaContext,
    ): T | undefined {
      throw new Error(`getSchemaSync not implemented`);
    },
    async getSchemaInfo(
      schemaKey: Readonly<SchemaKey>,
      matchType: SchemaMatchType,
      schemaContext: SchemaContext,
    ): Promise<SchemaInfo | undefined> {
      const schemaJson = imodel.getSchemaProps(schemaKey.name);
      const schemaInfo = await Schema.startLoadingFromJson(schemaJson, schemaContext);
      if (schemaInfo.schemaKey.matches(schemaKey as SchemaKey, matchType)) {
        return schemaInfo;
      }
      return undefined;
    },
    async getSchema<T extends Schema>(
      schemaKey: Readonly<SchemaKey>,
      matchType: SchemaMatchType,
      schemaContext: SchemaContext,
    ): Promise<T | undefined> {
      await this.getSchemaInfo(schemaKey as SchemaKey, matchType, schemaContext);
      // eslint-disable-next-line @itwin/no-internal
      const schema = await schemaContext.getCachedSchema(schemaKey as SchemaKey, matchType);
      return schema as T;
    },
  });
  return schemas;
}

export class TestIModelConnection extends IModelConnection {
  constructor(
    private readonly _db: IModelDb,
    public readonly filePath: string,
  ) {
    // eslint-disable-next-line @itwin/no-internal
    super(_db.getConnectionProps());
    IModelConnection.onOpen.raiseEvent(this);
  }

  public override get isClosed(): boolean {
    // eslint-disable-next-line @itwin/no-internal
    return !this._db.isOpen;
  }

  public override async close(): Promise<void> {
    this._db.close();
    this.onClose.raiseEvent(this);
    IModelConnection.onClose.raiseEvent(this);
  }

  public static openFile(filePath: string): TestIModelConnection {
    return new TestIModelConnection(SnapshotDb.openFile(filePath), filePath);
  }
}

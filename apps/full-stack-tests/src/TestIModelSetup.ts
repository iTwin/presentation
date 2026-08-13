/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "vitest";
import { EditTxn, IModelDb, SnapshotDb, withEditTxn } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import {
  BisCodeSpec,
  Code,
  CodeScopeProps,
  CodeSpec,
  ElementAspectProps,
  ElementProps,
  ModelProps,
  RelationshipProps,
} from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { createFileNameFromString, setupOutputFileLocation } from "./FilenameUtils.js";

export interface TestIModelBuilder {
  insertModel<TProps extends ModelProps>(props: TProps): Id64String;
  insertElement<TProps extends ElementProps>(props: TProps): Id64String;
  insertAspect<TProps extends ElementAspectProps>(props: TProps): Id64String;
  insertRelationship<TProps extends RelationshipProps>(props: TProps): Id64String;
  createCode(scopeModelId: CodeScopeProps, codeSpecName: BisCodeSpec, codeValue: string): Code;
  importSchema(schemaXml: string): Promise<void>;
}

class TestIModelBuilderImpl implements TestIModelBuilder {
  private _txn: EditTxn;

  constructor(txn: EditTxn) {
    this._txn = txn;
  }

  public insertModel<TProps extends ModelProps>(props: TProps): Id64String {
    return this._txn.insertModel(props);
  }

  public insertElement<TProps extends ElementProps>(props: TProps): Id64String {
    return this._txn.insertElement(props);
  }

  public insertAspect<TProps extends ElementAspectProps>(props: TProps): Id64String {
    return this._txn.insertAspect(props);
  }

  public insertRelationship<TProps extends RelationshipProps>(props: TProps): Id64String {
    return this._txn.insertRelationship(props);
  }

  public createCode(scopeModelId: CodeScopeProps, codeSpecName: BisCodeSpec, codeValue: string): Code {
    const codeSpec: CodeSpec = this._txn.iModel.codeSpecs.getByName(codeSpecName);
    return new Code({ spec: codeSpec.id, scope: scopeModelId, value: codeValue });
  }

  public async importSchema(schemaXml: string) {
    await this._txn.iModel.importSchemaStrings([schemaXml]);
  }
}

function getTestName() {
  return expect.getState().currentTestName!;
}

/**
 * Create test iModel and returns a connection to it.
 *
 * **Note:** do not call this function outside `it` block without name. It uses `expect.getState().currentTestName` to determine the test name.
 */
export async function buildTestIModel<TResult extends {} | void>(
  cb: (builder: TestIModelBuilder, testName: string) => TResult | Promise<TResult>,
): Promise<TResult & { imodel: IModelConnection }>;
export async function buildTestIModel<TResult extends {} | void>(
  name: string,
  cb: (builder: TestIModelBuilder, testName: string) => TResult | Promise<TResult>,
): Promise<TResult & { imodel: IModelConnection }>;
export async function buildTestIModel(
  cb?: (builder: TestIModelBuilder, testName: string) => void | Promise<void>,
): Promise<{ imodel: IModelConnection }>;
export async function buildTestIModel(
  name: string,
  cb?: (builder: TestIModelBuilder, testName: string) => void | Promise<void>,
): Promise<{ imodel: IModelConnection }>;
export async function buildTestIModel<TResult extends {} | void>(
  nameOrCb?: string | ((builder: TestIModelBuilder, testName: string) => TResult | Promise<TResult>),
  cb?: (builder: TestIModelBuilder, testName: string) => TResult | Promise<TResult>,
): Promise<TResult & { imodel: IModelConnection }> {
  const name = typeof nameOrCb === "string" ? nameOrCb : getTestName();
  const callback = typeof nameOrCb === "function" ? nameOrCb : cb;
  const fileName = createFileNameFromString(`${name}.bim`);
  const outputFile = setupOutputFileLocation(fileName);
  const db = SnapshotDb.createEmpty(outputFile, { rootSubject: { name } });
  let result!: TResult;
  try {
    if (callback) {
      await withEditTxn(db, async (txn) => {
        const builderWithTxn = new TestIModelBuilderImpl(txn);
        result = await callback(builderWithTxn, name);
      });
    }
  } finally {
    db.close();
  }
  return { ...result, imodel: TestIModelConnection.openFile(outputFile) };
}

export class TestIModelConnection extends IModelConnection {
  constructor(private readonly _db: IModelDb) {
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

  public static openFile(filePath: string): IModelConnection {
    return new TestIModelConnection(SnapshotDb.openFile(filePath));
  }
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IModel
 */

import { IModelDb, SnapshotDb } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { BisCodeSpec, Code, CodeScopeProps, ElementAspectProps, ElementProps, ModelProps, RelationshipProps } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { createFileNameFromString, setupOutputFileLocation } from "./FilenameUtils.js";
import { TestIModelBuilderImpl } from "./IModelBuilderImpl.js";

/**
 * Interface for IModel builder pattern. Used for building IModels to test rulesets.
 * @beta
 */
export interface TestIModelBuilder {
  /** Insert a model into the builder's iModel */
  insertModel<TProps extends ModelProps>(props: TProps): Id64String;
  /** Insert an element into the builder's iModel */
  insertElement<TProps extends ElementProps>(props: TProps): Id64String;
  /** Insert an element aspect into the specified element */
  insertAspect<TProps extends ElementAspectProps>(props: TProps): Id64String;
  /**
   * Insert a relationship between two instances. The relationship is expected to be a subclass
   * of `BisCore:ElementRefersToElements` or `BisCore:ElementDrivesElement`.
   */
  insertRelationship<TProps extends RelationshipProps>(props: TProps): Id64String;
  /**
   * Create code for specified element.
   * Code value has to be unique within its scope (see [Codes documentation page]($docs/bis/guide/fundamentals/codes.md)).
   */
  createCode(scopeModelId: CodeScopeProps, codeSpecName: BisCodeSpec, codeValue: string): Code;
  /**
   * Import an ECSchema in a form of XML string into the builder's iModel.
   */
  importSchema(schemaXml: string): Promise<void>;
}

/**
 * Function that creates an iModel and returns a connection to it.
 * @param name Name of test IModel
 * @param cb Callback function that receives an [[TestIModelBuilder]] to fill the iModel with data
 * @beta
 * @deprecated in 4.x. Use an overload with `cb` returning a promise.
 */
export async function buildTestIModel(name: string, cb: (builder: TestIModelBuilder) => void): Promise<IModelConnection>;
/**
 * Function that creates an iModel and returns a connection to it.
 * @param name Name of test IModel
 * @param cb Callback function that receives an [[TestIModelBuilder]] to fill the iModel with data
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/unified-signatures
export async function buildTestIModel(name: string, cb: (builder: TestIModelBuilder) => Promise<void>): Promise<IModelConnection>;
/**
 * Function that creates an iModel and returns a connection to it.
 * @param mochaContext Mocha context to generate iModel name from
 * @param cb Callback function that receives an [[TestIModelBuilder]] to fill the iModel with data
 * @beta
 * @deprecated in 4.x. Use an overload with `cb` returning a promise.
 */
// eslint-disable-next-line @typescript-eslint/unified-signatures
export async function buildTestIModel(mochaContext: Mocha.Context, cb: (builder: TestIModelBuilder) => void): Promise<IModelConnection>;
/**
 * Function that creates an iModel and returns a connection to it.
 * @param mochaContext Mocha context to generate iModel name from
 * @param cb Callback function that receives an [[TestIModelBuilder]] to fill the iModel with data
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/unified-signatures
export async function buildTestIModel(mochaContext: Mocha.Context, cb: (builder: TestIModelBuilder) => Promise<void>): Promise<IModelConnection>;
export async function buildTestIModel(nameParam: string | Mocha.Context, cb: (builder: TestIModelBuilder) => void | Promise<void>): Promise<IModelConnection> {
  const name = typeof nameParam === "string" ? nameParam : createFileNameFromString(nameParam.test!.fullTitle());
  const outputFile = setupOutputFileLocation(`${name}.bim`);
  const db = SnapshotDb.createEmpty(outputFile, { rootSubject: { name } });
  const builder = new TestIModelBuilderImpl(db);
  try {
    await cb(builder);
  } finally {
    db.saveChanges("Created test IModel");
    db.close();
  }
  return TestIModelConnection.openFile(outputFile);
}

/**
 * This was added based on this: https://github.com/iTwin/itwinjs-core/pull/7171/files#diff-9d26b04e7ae074b911fb87be3425360d7bd55a7c9f947f5aed1ba36d359f01eb
 * @beta
 */
/* c8 ignore next start*/
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
  }

  public static openFile(filePath: string): IModelConnection {
    return new TestIModelConnection(SnapshotDb.openFile(filePath));
  }
}
/* c8 ignore next end*/

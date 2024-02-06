/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IModel
 */

import { SnapshotDb } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { BisCodeSpec, Code, CodeScopeProps, ElementAspectProps, ElementProps, ModelProps, RelationshipProps } from "@itwin/core-common";
import { IModelConnection, SnapshotConnection } from "@itwin/core-frontend";
import { TestIModelBuilderImpl } from "./IModelBuilderImpl";
import { createFileNameFromString, setupOutputFileLocation } from "./InternalUtils";

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
  const outputFile = setupOutputFileLocation(name);
  const db = SnapshotDb.createEmpty(outputFile, { rootSubject: { name } });
  const builder = new TestIModelBuilderImpl(db);
  try {
    await cb(builder);
  } finally {
    db.saveChanges("Created test IModel");
    db.close();
  }
  return SnapshotConnection.openFile(outputFile);
}

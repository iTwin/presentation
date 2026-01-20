/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECDb, IModelDb, IModelJsFs, StandaloneDb } from "@itwin/core-backend";
import { Id64String, OpenMode } from "@itwin/core-bentley";
import { BisCodeSpec, Code, CodeScopeProps, ElementAspectProps, ElementProps, ModelProps, RelationshipProps } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { buildTestIModel, setupOutputFileLocation, TestIModelBuilder, TestIModelConnection } from "@itwin/presentation-testing";

interface IIModelBuilder extends TestIModelBuilder {
  deleteElement(elementId: Id64String): void;
  updateElement<TProps extends ElementProps>(props: Partial<Omit<TProps, "id">> & { id: Id64String }): void;
}

export async function buildIModel<TFirstArg extends Mocha.Context | string>(
  mochaContextOrTestName: TFirstArg,
  setup?: (builder: TestIModelBuilder, mochaContextOrTestName: TFirstArg) => Promise<void>,
): Promise<{ imodel: IModelConnection }>;
export async function buildIModel<TFirstArg extends Mocha.Context | string, TResult extends {}>(
  mochaContextOrTestName: TFirstArg,
  setup: (builder: TestIModelBuilder, mochaContextOrTestName: TFirstArg) => Promise<TResult>,
): Promise<{ imodel: IModelConnection } & TResult>;
export async function buildIModel<TFirstArg extends Mocha.Context | string, TResult extends {} | undefined>(
  mochaContextOrTestName: TFirstArg,
  setup?: (builder: TestIModelBuilder, mochaContextOrTestName: TFirstArg) => Promise<TResult>,
) {
  let res!: TResult;
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const imodel = await buildTestIModel(mochaContextOrTestName as any, async (builder) => {
    if (setup) {
      res = await setup(builder, mochaContextOrTestName);
    }
  });
  return { ...res, imodel };
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
  if (!imodel) {
    throw new Error("Failed to open cloned iModel");
  }
  try {
    const res = await setup(new TestIModelBuilderImpl(imodel));
    imodel.saveChanges("Updated cloned iModel");
    return { ...res, imodel: new TestIModelConnection(imodel), imodelPath: targetIModelPath };
  } catch (e) {
    imodel.close();
    throw e;
  }
}

export async function createChangedIModels<TResultBase extends {}, TResultChangeset1 extends {}>(
  mochaContext: Mocha.Context,
  setupBase: (imodel: TestIModelBuilder) => Promise<TResultBase>,
  setupChangeset1: (imodel: IIModelBuilder, before: TResultBase) => Promise<TResultChangeset1>,
) {
  const baseIModelPath = setupOutputFileLocation(`${mochaContext.test!.fullTitle()}-base.bim`);
  const base = await buildIModel(`${mochaContext.test!.fullTitle()}-base`, setupBase);
  const changeset1 = await cloneIModel(baseIModelPath, `${mochaContext.test!.fullTitle()}-changeset1`, async (ecdb) => setupChangeset1(ecdb, base));
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
  const schemas = new SchemaContext();
  if (imodel instanceof IModelConnection) {
    schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
  } else {
    schemas.addLocater({
      getSchemaSync<T extends Schema>(_schemaKey: Readonly<SchemaKey>, _matchType: SchemaMatchType, _schemaContext: SchemaContext): T | undefined {
        throw new Error(`getSchemaSync not implemented`);
      },
      async getSchemaInfo(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<SchemaInfo | undefined> {
        const schemaJson = imodel.getSchemaProps(schemaKey.name);
        const schemaInfo = await Schema.startLoadingFromJson(schemaJson, schemaContext);
        if (schemaInfo !== undefined && schemaInfo.schemaKey.matches(schemaKey as SchemaKey, matchType)) {
          return schemaInfo;
        }
        return undefined;
      },
      async getSchema<T extends Schema>(schemaKey: Readonly<SchemaKey>, matchType: SchemaMatchType, schemaContext: SchemaContext): Promise<T | undefined> {
        await this.getSchemaInfo(schemaKey as SchemaKey, matchType, schemaContext);
        // eslint-disable-next-line @itwin/no-internal
        const schema = await schemaContext.getCachedSchema(schemaKey as SchemaKey, matchType);
        return schema as T;
      },
    });
  }
  return schemas;
}

class TestIModelBuilderImpl implements IIModelBuilder {
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

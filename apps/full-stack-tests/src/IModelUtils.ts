/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import hash from "object-hash";
import { getFullSchemaXml } from "presentation-test-utilities";
import { ECDb, ECDbOpenMode, ECSqlWriteStatement, IModelDb, IModelJsFs } from "@itwin/core-backend";
import { BentleyError, DbResult, Guid, Id64, Id64String, OrderedId64Iterable } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { Schema, SchemaContext, SchemaInfo, SchemaKey, SchemaMatchType } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { ECSqlBinding, InstanceKey, parseFullClassName, PrimitiveValue } from "@itwin/presentation-shared";
import { buildTestIModel, createFileNameFromString, limitFilePathLength, setupOutputFileLocation, TestIModelBuilder } from "@itwin/presentation-testing";
import { safeDispose } from "./Utils.js";

// cspell:words jpath

function isBinding(value: ECSqlBinding | PrimitiveValue): value is ECSqlBinding {
  return typeof value === "object" && (value as ECSqlBinding).type !== undefined && (value as ECSqlBinding).value !== undefined;
}

export class ECDbBuilder {
  public constructor(
    private _ecdb: ECDb,
    private _filePath: string,
  ) {}

  public importSchema(schemaXml: string) {
    // sadly, there's no API to import schema from string, so we have to save the XML into a file first...
    const schemaFilePath = limitFilePathLength(`${this._filePath}-${hash(schemaXml)}`);
    fs.writeFileSync(schemaFilePath, schemaXml);
    this._ecdb.importSchema(schemaFilePath);
  }

  private createECSqlStatementBinder(values: { [propertyName: string]: ECSqlBinding | PrimitiveValue | undefined }) {
    return (stmt: ECSqlWriteStatement) => {
      Object.values(values).forEach((value, i) => {
        const bindingIndex = i + 1;
        switch (typeof value) {
          case "undefined":
            stmt.bindNull(bindingIndex);
            return;
          case "boolean":
            stmt.bindBoolean(bindingIndex, value);
            return;
          case "number":
            if (Number.isInteger(value)) {
              stmt.bindInteger(bindingIndex, value);
            } else {
              stmt.bindDouble(bindingIndex, value);
            }
            return;
          case "string":
            if (Id64.isId64(value)) {
              stmt.bindId(bindingIndex, value);
            } else {
              stmt.bindString(bindingIndex, value);
            }
            return;
          case "object":
            if (value instanceof Date) {
              stmt.bindDateTime(bindingIndex, value.toISOString());
            } else if (isBinding(value)) {
              if (value.value === undefined) {
                stmt.bindNull(bindingIndex);
                return;
              }
              switch (value.type) {
                case "boolean":
                  stmt.bindBoolean(bindingIndex, value.value);
                  break;
                case "double":
                  stmt.bindDouble(bindingIndex, value.value);
                  break;
                case "id":
                  stmt.bindId(bindingIndex, value.value);
                  break;
                case "idset":
                  stmt.bindIdSet(bindingIndex, OrderedId64Iterable.sortArray(value.value));
                  break;
                case "int":
                case "long":
                  stmt.bindInteger(bindingIndex, value.value);
                  break;
                case "point2d":
                  stmt.bindPoint2d(bindingIndex, value.value);
                  break;
                case "point3d":
                  stmt.bindPoint3d(bindingIndex, value.value);
                  break;
                case "string":
                  stmt.bindString(bindingIndex, value.value);
                  break;
              }
            } else if (PrimitiveValue.isPoint3d(value)) {
              stmt.bindPoint3d(bindingIndex, value);
            } else if (PrimitiveValue.isPoint2d(value)) {
              stmt.bindPoint2d(bindingIndex, value);
            }
        }
      });
    };
  }

  private createInsertQuery(fullClassName: string, props?: { [propertyName: string]: ECSqlBinding | PrimitiveValue | undefined }) {
    if (!props) {
      props = { ecInstanceId: undefined };
    }
    const { schemaName, className } = parseFullClassName(fullClassName);
    const clause = `
      INSERT INTO [${schemaName}].[${className}] (${Object.keys(props).join(", ")})
      VALUES (${Object.keys(props)
        .map(() => "?")
        .join(", ")})
    `;
    return { clause, binder: this.createECSqlStatementBinder(props) };
  }

  private createUpdateQuery(key: InstanceKey, props: { [propertyName: string]: ECSqlBinding | PrimitiveValue | undefined }) {
    const { schemaName, className } = parseFullClassName(key.className);
    const clause = `
      UPDATE [${schemaName}].[${className}]
      SET ${Object.keys(props)
        .map((k) => `${k} = ?`)
        .join(", ")}
      WHERE ECInstanceId = ?
    `;
    return { clause, binder: this.createECSqlStatementBinder({ ...props, ecInstanceId: key.id }) };
  }

  public insertInstance(fullClassName: string, props?: { [propertyName: string]: PrimitiveValue | undefined }) {
    const query = this.createInsertQuery(fullClassName, props);
    return this._ecdb.withWriteStatement(query.clause, (stmt) => {
      query.binder(stmt);
      const res = stmt.stepForInsert();
      if (res.status !== DbResult.BE_SQLITE_DONE) {
        throw new BentleyError(res.status, `Failed to insert instance of class "${fullClassName}". Query: ${query.clause}`);
      }
      return { className: fullClassName, id: res.id! };
    });
  }

  public insertRelationship(fullClassName: string, sourceId: Id64String, targetId: Id64String, props?: { [propertyName: string]: PrimitiveValue | undefined }) {
    const query = this.createInsertQuery(fullClassName, {
      ...props,
      sourceECInstanceId: sourceId,
      targetECInstanceId: targetId,
    });
    return this._ecdb.withWriteStatement(query.clause, (stmt) => {
      query.binder(stmt);
      const res = stmt.stepForInsert();
      if (res.status !== DbResult.BE_SQLITE_DONE) {
        throw new BentleyError(res.status, `Failed to insert instance of relationship "${fullClassName}". Query: ${query.clause}`);
      }
      return { className: fullClassName, id: res.id! };
    });
  }

  public updateInstance(key: InstanceKey, props: { [propertyName: string]: PrimitiveValue | undefined }) {
    const query = this.createUpdateQuery(key, props);
    return this._ecdb.withWriteStatement(query.clause, (stmt) => {
      query.binder(stmt);
      const res = stmt.step();
      if (res !== DbResult.BE_SQLITE_DONE) {
        throw new BentleyError(res, `Failed to update instance of class "${key.className}", id: ${key.id}.`);
      }
    });
  }

  public deleteInstance(key: InstanceKey) {
    const { schemaName, className } = parseFullClassName(key.className);
    const clause = `
      DELETE FROM [${schemaName}].[${className}] WHERE ECInstanceId = ?
    `;
    this._ecdb.withWriteStatement(clause, (stmt) => {
      stmt.bindId(1, key.id);
      const res = stmt.step();
      if (res !== DbResult.BE_SQLITE_DONE) {
        throw new BentleyError(res, `Failed to delete instance of class "${key.className}", id: ${key.id}.`);
      }
    });
  }
}

export async function createECDb<TResult extends {}>(
  mochaContextOrName: Mocha.Context | string,
  setup: (db: ECDbBuilder) => Promise<TResult>,
): Promise<TResult & { ecdb: ECDb; ecdbPath: string }> {
  const name = createFileNameFromString(typeof mochaContextOrName === "string" ? mochaContextOrName : mochaContextOrName.test!.fullTitle());
  const ecdbPath = setupOutputFileLocation(`${name}.bim`);
  const ecdb = new ECDb();
  ecdb.createDb(ecdbPath);
  try {
    const res = await setup(new ECDbBuilder(ecdb, ecdbPath));
    return { ...res, ecdb, ecdbPath };
  } catch (e) {
    ecdb[Symbol.dispose]();
    throw e;
  } finally {
    ecdb.saveChanges("Created test ECDb");
  }
}
export async function cloneECDb<TResult extends {}>(
  sourceECDbPath: string,
  targetECDbName: string,
  setup: (db: ECDbBuilder) => Promise<TResult>,
): Promise<TResult & { ecdb: ECDb; ecdbPath: string }> {
  const targetECDbPath = setupOutputFileLocation(`${targetECDbName}.bim`);
  IModelJsFs.existsSync(targetECDbPath) && IModelJsFs.unlinkSync(targetECDbPath);
  IModelJsFs.copySync(sourceECDbPath, targetECDbPath);

  const ecdb = new ECDb();
  ecdb.openDb(targetECDbPath, ECDbOpenMode.ReadWrite);
  if (!ecdb.isOpen) {
    throw new Error("Failed to open cloned ECDb");
  }
  try {
    const res = await setup(new ECDbBuilder(ecdb, targetECDbPath));
    return { ...res, ecdb, ecdbPath: targetECDbPath };
  } finally {
    ecdb.saveChanges("Updated cloned ECDb");
  }
}

export async function withECDb(
  mochaContext: Mocha.Context,
  setup: (db: ECDbBuilder, mochaContext: Mocha.Context) => Promise<void>,
  use: (db: ECDb) => Promise<void>,
): Promise<void>;
export async function withECDb<TResult extends {}>(
  mochaContext: Mocha.Context,
  setup: (db: ECDbBuilder, mochaContext: Mocha.Context) => Promise<TResult>,
  use: (db: ECDb, res: TResult) => Promise<void>,
): Promise<void>;
export async function withECDb<TResult extends {} | undefined>(
  mochaContext: Mocha.Context,
  setup: (db: ECDbBuilder, mochaContext: Mocha.Context) => Promise<TResult | undefined>,
  use: (db: ECDb, res: TResult | undefined) => Promise<void>,
) {
  const name = createFileNameFromString(mochaContext.test!.fullTitle());
  const outputFile = setupOutputFileLocation(name);
  using db = new ECDb();

  db.createDb(outputFile);
  const res = await setup(new ECDbBuilder(db, outputFile), mochaContext);
  db.saveChanges("Created test ECDb");
  await use(db, res);
  safeDispose(db);
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

export async function importSchema(
  mochaContextOrTestName: Mocha.Context | string,
  imodel: { importSchema: (xml: string) => Promise<void> | void },
  schemaContentXml: string,
) {
  const testName = typeof mochaContextOrTestName === "string" ? mochaContextOrTestName : mochaContextOrTestName.test!.fullTitle();
  const schemaName = `SCHEMA_${testName}`.replace(/[^\w\d_]/gi, "_").replace(/_+/g, "_");
  const schemaAlias = `a_${Guid.createValue().replaceAll("-", "")}`;
  const schemaXml = getFullSchemaXml({ schemaName, schemaAlias, schemaContentXml });
  await imodel.importSchema(schemaXml);

  const parsedSchema = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    isArray: (_, jpath) => jpath.startsWith("ECSchema."),
  }).parse(schemaXml);
  const schemaItems = Object.values(parsedSchema.ECSchema)
    .flatMap<any>((itemDef) => itemDef)
    .filter((itemDef: any) => !!itemDef.typeName);

  return {
    schemaName,
    schemaAlias,
    items: schemaItems.reduce<{ [className: string]: { name: string; fullName: string; label: string } }>((classesObj, schemaItemDef) => {
      const name = schemaItemDef.typeName;
      return {
        ...classesObj,
        [name]: {
          fullName: `${schemaName}.${name}`,
          name,
          label: schemaItemDef.displayLabel,
        },
      };
    }, {}),
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

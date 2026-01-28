/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import hash from "object-hash";
import { ECDb, ECDbOpenMode, IModelJsFs } from "@itwin/core-backend";
import { BentleyError, DbResult, Id64, OrderedId64Iterable } from "@itwin/core-bentley";
import { parseFullClassName, PrimitiveValue } from "@itwin/presentation-shared";
import { createFileNameFromString, limitFilePathLength, setupOutputFileLocation } from "@itwin/presentation-testing";
import { safeDispose } from "./Utils.js";

import type { ECSqlWriteStatement } from "@itwin/core-backend";
import type { Id64String } from "@itwin/core-bentley";
import type { ECSqlBinding, InstanceKey } from "@itwin/presentation-shared";

export class ECDbBuilder {
  public constructor(
    private _ecdb: ECDb,
    private _filePath: string,
  ) {}

  public importSchema(schemaXml: string) {
    // sadly, there's no API to import schema from string, so we have to save the XML into a file first...
    const schemaFilePath = limitFilePathLength(`${this._filePath}-${hash(schemaXml)}.xml`);
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

function isBinding(value: ECSqlBinding | PrimitiveValue): value is ECSqlBinding {
  return typeof value === "object" && "type" in value && "value" in value;
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
    ecdb.saveChanges("Created test ECDb");
    return { ...res, ecdb, ecdbPath };
  } catch (e) {
    ecdb[Symbol.dispose]();
    throw e;
  }
}

async function cloneECDb<TResult extends {}>(
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
    ecdb.saveChanges("Updated cloned ECDb");
    return { ...res, ecdb, ecdbPath: targetECDbPath };
  } catch (e) {
    ecdb[Symbol.dispose]();
    throw e;
  }
}

export async function createChangedDbs<TResultBase extends {}, TResultChangeset1 extends {}>(
  mochaContext: Mocha.Context,
  setupBase: (db: ECDbBuilder) => Promise<TResultBase>,
  setupChangeset1: (db: ECDbBuilder, before: TResultBase) => Promise<TResultChangeset1>,
): Promise<{ base: Awaited<ReturnType<typeof createECDb>> & TResultBase; changeset1: Awaited<ReturnType<typeof createECDb>> & TResultChangeset1 } & Disposable>;
export async function createChangedDbs<TResultBase extends {}, TResultChangeset1 extends {}, TResultChangeset2 extends {}>(
  mochaContext: Mocha.Context,
  setupBase: (db: ECDbBuilder) => Promise<TResultBase>,
  setupChangeset1: (db: ECDbBuilder, before: TResultBase) => Promise<TResultChangeset1>,
  setupChangeset2: (db: ECDbBuilder, before: TResultChangeset1) => Promise<TResultChangeset2>,
): Promise<
  {
    base: Awaited<ReturnType<typeof createECDb>> & TResultBase;
    changeset1: Awaited<ReturnType<typeof createECDb>> & TResultChangeset1;
    changeset2: Awaited<ReturnType<typeof createECDb>> & TResultChangeset2;
  } & Disposable
>;
export async function createChangedDbs<TResultBase extends {}, TResultChangeset1 extends {}, TResultChangeset2 extends {}>(
  mochaContext: Mocha.Context,
  setupBase: (db: ECDbBuilder) => Promise<TResultBase>,
  setupChangeset1: (db: ECDbBuilder, before: TResultBase) => Promise<TResultChangeset1>,
  setupChangeset2?: (db: ECDbBuilder, before: TResultChangeset1) => Promise<TResultChangeset2>,
) {
  const base = await createECDb(`${mochaContext.test!.fullTitle()}-base`, setupBase);
  const changeset1 = await cloneECDb(base.ecdbPath, `${mochaContext.test!.fullTitle()}-changeset1`, async (ecdb) => setupChangeset1(ecdb, base));
  const changeset2 = setupChangeset2
    ? await cloneECDb(changeset1.ecdbPath, `${mochaContext.test!.fullTitle()}-changeset2`, async (ecdb) => setupChangeset2(ecdb, changeset1))
    : undefined;
  return {
    base,
    changeset1,
    changeset2,
    [Symbol.dispose]() {
      base.ecdb[Symbol.dispose]();
      changeset1.ecdb[Symbol.dispose]();
      changeset2?.ecdb[Symbol.dispose]();
    },
  };
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

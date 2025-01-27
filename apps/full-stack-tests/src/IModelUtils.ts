/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import hash from "object-hash";
import { getFullSchemaXml } from "presentation-test-utilities";
import { ECDb, ECSqlStatement } from "@itwin/core-backend";
import { BentleyError, DbResult, Guid, Id64, Id64String, OrderedId64Iterable } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { ECSqlBinding, parseFullClassName, PrimitiveValue } from "@itwin/presentation-shared";
import { buildTestIModel, createFileNameFromString, limitFilePathLength, setupOutputFileLocation, TestIModelBuilder } from "@itwin/presentation-testing";

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
    // eslint-disable-next-line @itwin/no-internal, @typescript-eslint/no-deprecated
    const schemaFilePath = limitFilePathLength(`${this._filePath}-${hash(schemaXml)}`);
    fs.writeFileSync(schemaFilePath, schemaXml);
    this._ecdb.importSchema(schemaFilePath);
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
    const binder = (stmt: ECSqlStatement) => {
      Object.values(props).forEach((value, i) => {
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
    return { clause, binder };
  }

  public insertInstance(fullClassName: string, props?: { [propertyName: string]: PrimitiveValue | undefined }) {
    const query = this.createInsertQuery(fullClassName, props);
    return this._ecdb.withStatement(query.clause, (stmt) => {
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
    return this._ecdb.withStatement(query.clause, (stmt) => {
      query.binder(stmt);
      const res = stmt.stepForInsert();
      if (res.status !== DbResult.BE_SQLITE_DONE) {
        throw new BentleyError(res.status, `Failed to insert instance of relationship "${fullClassName}". Query: ${query.clause}`);
      }
      return { className: fullClassName, id: res.id! };
    });
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
  let res: TResult | undefined;
  const name = createFileNameFromString(mochaContext.test!.fullTitle());
  const outputFile = setupOutputFileLocation(name);
  const db = new ECDb();

  db.createDb(outputFile);
  try {
    res = await setup(new ECDbBuilder(db, outputFile), mochaContext);
    db.saveChanges("Created test ECDb");
  } catch (e) {
    db.dispose();
    throw e;
  }
  try {
    await use(db, res);
  } finally {
    db.dispose();
  }
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

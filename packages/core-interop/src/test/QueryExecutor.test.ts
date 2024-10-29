/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { QueryBinder, QueryOptions, QueryRowFormat } from "@itwin/core-common";
import { Point2d, Point3d } from "@itwin/core-geometry";
import { ECSqlBinding } from "@itwin/presentation-shared";
import { createECSqlQueryExecutor } from "../core-interop/QueryExecutor.js";

describe("createECSqlQueryExecutor", () => {
  describe("createQueryReader", () => {
    it("calls IModel's `createQueryReader` with default params", async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createCoreECSqlReaderStub([{}, {}])),
      };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).to.be.calledOnceWithExactly(
        "ecsql",
        sinon.match((binder: QueryBinder) => Object.keys(binder.serialize()).length === 0),
        sinon.match((options: QueryOptions) => Object.keys(options).length === 0),
      );
    });

    it("calls IModel's `createQueryReader` with CTEs", async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createCoreECSqlReaderStub([{}, {}])),
      };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ctes: ["cte1", "cte2"], ecsql: "ecsql" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).to.be.calledOnceWith("WITH RECURSIVE cte1, cte2 ecsql");
    });

    it("calls IModel's `createQueryReader` with whitespace removed from ECSQL and CTEs", async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createCoreECSqlReaderStub([])),
      };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ctes: [" cte  with   whitespace "], ecsql: " ( ecsql , with   whitespace) " });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).to.be.calledOnceWith("WITH RECURSIVE cte with whitespace (ecsql, with whitespace)");
    });

    it("calls IModel's `createQueryReader` with `ECSqlPropertyNames` row format", async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createCoreECSqlReaderStub([])),
      };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { rowFormat: "ECSqlPropertyNames" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).to.be.calledOnceWithExactly(
        "ecsql",
        sinon.match((binder: QueryBinder) => Object.keys(binder.serialize()).length === 0),
        sinon.match((options: QueryOptions) => options.rowFormat === QueryRowFormat.UseECSqlPropertyNames),
      );
    });

    it("calls IModel's `createQueryReader` with `Indexes` row format", async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createCoreECSqlReaderStub([])),
      };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { rowFormat: "Indexes" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).to.be.calledOnceWithExactly(
        "ecsql",
        sinon.match((binder: QueryBinder) => Object.keys(binder.serialize()).length === 0),
        sinon.match((options: QueryOptions) => options.rowFormat === QueryRowFormat.UseECSqlPropertyIndexes),
      );
    });

    it("calls IModel's `createQueryReader` with `restartToken`", async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createCoreECSqlReaderStub([])),
      };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { restartToken: "TestToken" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).to.be.calledOnceWithExactly(
        "ecsql",
        sinon.match((binder: QueryBinder) => Object.keys(binder.serialize()).length === 0),
        sinon.match((options: QueryOptions) => options.restartToken === "TestToken"),
      );
    });

    it("calls IModel's `createQueryReader` with different bindings", async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createCoreECSqlReaderStub([])),
      };

      const bindings: ECSqlBinding[] = [
        {
          type: "boolean",
          value: true,
        },
        {
          type: "double",
          value: 1.23,
        },
        {
          type: "id",
          value: "0x123",
        },
        {
          type: "idset",
          value: ["0x123", "0x456"],
        },
        {
          type: "int",
          value: 123,
        },
        { type: "long", value: 456 },
        {
          type: "point2d",
          value: { x: 1.23, y: 4.56 },
        },
        {
          type: "point3d",
          value: { x: 1.23, y: 4.56, z: 7.89 },
        },
        {
          type: "string",
          value: "xxx",
        },
        {
          type: "string",
          value: undefined,
        },
      ];

      const expectedBinder = new QueryBinder();
      expectedBinder.bindBoolean(1, true);
      expectedBinder.bindDouble(2, 1.23);
      expectedBinder.bindId(3, "0x123");
      expectedBinder.bindIdSet(4, ["0x123", "0x456"]);
      expectedBinder.bindInt(5, 123);
      expectedBinder.bindLong(6, 456);
      expectedBinder.bindPoint2d(7, Point2d.create(1.23, 4.56));
      expectedBinder.bindPoint3d(8, Point3d.create(1.23, 4.56, 7.89));
      expectedBinder.bindString(9, "xxx");
      expectedBinder.bindNull(10);

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql", bindings }, undefined);
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).to.be.calledOnceWithExactly(
        "ecsql",
        sinon.match((binder: QueryBinder) => JSON.stringify(expectedBinder.serialize()) === JSON.stringify(binder.serialize())),
        sinon.match((options: QueryOptions) => Object.keys(options).length === 0),
      );
    });

    it("creates iterable reader for rows as objects", async () => {
      const rows = [{ x: 1 }, { y: 2 }];
      const imodel = {
        createQueryReader: sinon.stub().returns(createCoreECSqlReaderStub(rows)),
      };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { rowFormat: "ECSqlPropertyNames" });

      const resultRows = new Array<any>();
      for await (const row of reader) {
        resultRows.push(row);
      }

      expect(resultRows).to.deep.eq(rows);
    });

    it("creates iterable reader for rows as arrays", async () => {
      const rows = [
        [1, 2],
        [3, 4],
      ];
      const imodel = {
        createQueryReader: sinon.stub().returns(createCoreECSqlReaderStub(rows)),
      };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { rowFormat: "Indexes" });

      const resultRows = new Array<any>();
      for await (const row of reader) {
        resultRows.push(row);
      }

      expect(resultRows).to.deep.eq(rows);
    });
  });
});

function createCoreECSqlReaderStub(rows: object[]) {
  let curr = -1;
  const reader = {
    next: sinon.fake(async () => {
      ++curr;
      if (curr < rows.length) {
        return { done: false, value: createQueryRowProxy(rows[curr]) };
      }
      return { done: true, value: undefined };
    }),
  };
  return {
    ...reader,
    async *[Symbol.asyncIterator]() {
      return reader;
    },
  };
}

function createQueryRowProxy(data: object) {
  return {
    ...data,
    toArray: () => data,
    toRow: () => data,
  };
}

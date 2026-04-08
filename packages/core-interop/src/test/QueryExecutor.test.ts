/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import { Point2d, Point3d } from "@itwin/core-geometry";
import { createECSqlQueryExecutor } from "../core-interop/QueryExecutor.js";

import type { ECSqlBinding } from "@itwin/presentation-shared";

describe("createECSqlQueryExecutor", () => {
  describe("createQueryReader", () => {
    it("calls IModel's `createQueryReader` with default params", async () => {
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub([{}, {}])) };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).toHaveBeenCalledOnce();
      const [ecsql, binder, options] = imodel.createQueryReader.mock.calls[0];
      expect(ecsql).toBe("ecsql");
      expect(Object.keys(binder.serialize()).length).toBe(0);
      expect(Object.keys(options).length).toBe(0);
    });

    it("calls IModel's `createQueryReader` with CTEs", async () => {
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub([{}, {}])) };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ctes: ["cte1", "cte2"], ecsql: "ecsql" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).toHaveBeenCalledOnce();
      expect(imodel.createQueryReader.mock.calls[0][0]).toBe("WITH RECURSIVE cte1, cte2 ecsql");
    });

    it("calls IModel's `createQueryReader` with whitespace removed from ECSQL and CTEs", async () => {
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub([])) };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({
        ctes: [" cte  with   whitespace "],
        ecsql: " ( ecsql , with   whitespace) ",
      });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).toHaveBeenCalledOnce();
      expect(imodel.createQueryReader.mock.calls[0][0]).toBe(
        "WITH RECURSIVE cte with whitespace (ecsql, with whitespace)",
      );
    });

    it("calls IModel's `createQueryReader` with `ECSqlPropertyNames` row format", async () => {
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub([])) };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { rowFormat: "ECSqlPropertyNames" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).toHaveBeenCalledOnce();
      const [ecsql, binder, options] = imodel.createQueryReader.mock.calls[0];
      expect(ecsql).toBe("ecsql");
      expect(Object.keys(binder.serialize()).length).toBe(0);
      expect(options.rowFormat).toBe(QueryRowFormat.UseECSqlPropertyNames);
    });

    it("calls IModel's `createQueryReader` with `Indexes` row format", async () => {
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub([])) };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { rowFormat: "Indexes" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).toHaveBeenCalledOnce();
      const [ecsql, binder, options] = imodel.createQueryReader.mock.calls[0];
      expect(ecsql).toBe("ecsql");
      expect(Object.keys(binder.serialize()).length).toBe(0);
      expect(options.rowFormat).toBe(QueryRowFormat.UseECSqlPropertyIndexes);
    });

    it("calls IModel's `createQueryReader` with `restartToken`", async () => {
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub([])) };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { restartToken: "TestToken" });
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).toHaveBeenCalledOnce();
      const [ecsql, binder, options] = imodel.createQueryReader.mock.calls[0];
      expect(ecsql).toBe("ecsql");
      expect(Object.keys(binder.serialize()).length).toBe(0);
      expect(options.restartToken).toBe("TestToken");
    });

    it("calls IModel's `createQueryReader` with different bindings", async () => {
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub([])) };

      const bindings: ECSqlBinding[] = [
        { type: "boolean", value: true },
        { type: "double", value: 1.23 },
        { type: "id", value: "0x123" },
        { type: "idset", value: ["0x123", "0x456"] },
        { type: "int", value: 123 },
        { type: "long", value: 456 },
        { type: "point2d", value: { x: 1.23, y: 4.56 } },
        { type: "point3d", value: { x: 1.23, y: 4.56, z: 7.89 } },
        { type: "string", value: "xxx" },
        { type: "string", value: undefined },
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

      expect(imodel.createQueryReader).toHaveBeenCalledOnce();
      const [ecsql, binder, options] = imodel.createQueryReader.mock.calls[0];
      expect(ecsql).toBe("ecsql");
      expect(JSON.stringify(binder.serialize())).toBe(JSON.stringify(expectedBinder.serialize()));
      expect(Object.keys(options).length).toBe(0);
    });

    it("creates iterable reader for rows as objects", async () => {
      const rows = [{ x: 1 }, { y: 2 }];
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub(rows)) };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { rowFormat: "ECSqlPropertyNames" });

      const resultRows = new Array<any>();
      for await (const row of reader) {
        resultRows.push(row);
      }

      expect(resultRows).toEqual(rows);
    });

    it("creates iterable reader for rows as arrays", async () => {
      const rows = [
        [1, 2],
        [3, 4],
      ];
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub(rows)) };

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql" }, { rowFormat: "Indexes" });

      const resultRows = new Array<any>();
      for await (const row of reader) {
        resultRows.push(row);
      }

      expect(resultRows).toEqual(rows);
    });
  });
});

function createCoreECSqlReaderStub(rows: object[]) {
  let curr = -1;
  const reader = {
    next: vi.fn(async () => {
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
  return { ...data, toArray: () => data, toRow: () => data };
}

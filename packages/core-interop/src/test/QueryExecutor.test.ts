/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import { Point2d, Point3d } from "@itwin/core-geometry";
import { createECSqlQueryExecutor, QUERY_CANCEL_DELAY_MS } from "../core-interop/QueryExecutor.js";

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
      expect(binder).toBeUndefined();
      expect(options.restartToken).toBeTruthy();
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
      expect(binder).toBeUndefined();
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
      expect(binder).toBeUndefined();
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
      expect(binder).toBeUndefined();
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
      expect(options.restartToken).toBeTruthy();
    });

    it("calls IModel's `createQueryReader` with named bindings", async () => {
      const imodel = { createQueryReader: vi.fn().mockReturnValue(createCoreECSqlReaderStub([])) };

      const bindings: Record<string, ECSqlBinding> = {
        boolParam: { type: "boolean", value: true },
        idParam: { type: "id", value: "0x123" },
        idsetParam: { type: "idset", value: ["0x456", "0x789"] },
        nullParam: { type: "string", value: undefined },
      };

      const expectedBinder = new QueryBinder();
      expectedBinder.bindBoolean("boolParam", true);
      expectedBinder.bindId("idParam", "0x123");
      expectedBinder.bindIdSet("idsetParam", ["0x456", "0x789"]);
      expectedBinder.bindNull("nullParam");

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader({ ecsql: "ecsql", bindings }, undefined);
      for await (const _ of reader) {
      }

      expect(imodel.createQueryReader).toHaveBeenCalledOnce();
      const [ecsql, binder, options] = imodel.createQueryReader.mock.calls[0];
      expect(ecsql).toBe("ecsql");
      expect(JSON.stringify(binder.serialize())).toBe(JSON.stringify(expectedBinder.serialize()));
      expect(options.restartToken).toBeTruthy();
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

    describe("return()", () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it("forwards to core reader's return() when available", async () => {
        const coreReader = createCoreECSqlReaderStub([{}], { withReturn: true });
        const imodel = { createQueryReader: vi.fn().mockReturnValue(coreReader) };

        const executor = createECSqlQueryExecutor(imodel);
        const reader = executor.createQueryReader({ ecsql: "ecsql" });
        await reader.return!();

        expect(coreReader.return).toHaveBeenCalledOnce();
        expect(imodel.createQueryReader).toHaveBeenCalledOnce();
      });

      it("falls back to restart-token cancellation when core reader lacks return()", async () => {
        vi.useFakeTimers();
        const coreReader = createCoreECSqlReaderStub([{}]);
        const imodel = {
          createQueryReader: vi.fn().mockReturnValueOnce(coreReader).mockReturnValue(createCoreECSqlReaderStub([])),
        };

        const executor = createECSqlQueryExecutor(imodel);
        const reader = executor.createQueryReader({ ecsql: "ecsql" });
        await reader.return!();

        expect(imodel.createQueryReader).toHaveBeenCalledOnce();

        await vi.advanceTimersByTimeAsync(QUERY_CANCEL_DELAY_MS);

        expect(imodel.createQueryReader).toHaveBeenCalledTimes(2);
        expect(imodel.createQueryReader.mock.calls[1][0]).toBe("SELECT 1");
        expect(imodel.createQueryReader.mock.calls[1][1]).toBeUndefined();
        const originalToken = imodel.createQueryReader.mock.calls[0][2].restartToken;
        expect(imodel.createQueryReader.mock.calls[1][2].restartToken).toBe(originalToken);
      });

      it("uses caller-provided restartToken for cancellation", async () => {
        vi.useFakeTimers();
        const coreReader = createCoreECSqlReaderStub([], { withReturn: false });
        const imodel = {
          createQueryReader: vi.fn().mockReturnValueOnce(coreReader).mockReturnValue(createCoreECSqlReaderStub([])),
        };

        const executor = createECSqlQueryExecutor(imodel);
        const reader = executor.createQueryReader({ ecsql: "ecsql" }, { restartToken: "my-token" });
        await reader.return!();

        await vi.advanceTimersByTimeAsync(QUERY_CANCEL_DELAY_MS);

        expect(imodel.createQueryReader.mock.calls[0][2].restartToken).toBe("my-token");
        expect(imodel.createQueryReader.mock.calls[1][2].restartToken).toBe("my-token");
      });

      it("generates internal restartToken when caller doesn't provide one", async () => {
        vi.useFakeTimers();
        const coreReader = createCoreECSqlReaderStub([], { withReturn: false });
        const imodel = {
          createQueryReader: vi.fn().mockReturnValueOnce(coreReader).mockReturnValue(createCoreECSqlReaderStub([])),
        };

        const executor = createECSqlQueryExecutor(imodel);
        const reader = executor.createQueryReader({ ecsql: "ecsql" });

        const originalToken = imodel.createQueryReader.mock.calls[0][2].restartToken;
        expect(typeof originalToken).toBe("string");
        expect(originalToken.length).toBeGreaterThan(0);

        await reader.return!();
        await vi.advanceTimersByTimeAsync(QUERY_CANCEL_DELAY_MS);

        expect(imodel.createQueryReader.mock.calls[1][2].restartToken).toBe(originalToken);
      });

      it("clears cancel timer if query finishes naturally after return() is called", async () => {
        vi.useFakeTimers();
        const coreReader = createCoreECSqlReaderStub([], { withReturn: false });
        const imodel = { createQueryReader: vi.fn().mockReturnValue(coreReader) };

        const executor = createECSqlQueryExecutor(imodel);
        const reader = executor.createQueryReader({ ecsql: "ecsql" });

        await reader.return!(); // schedules the cancel timer
        await reader.next(); // returns done:true, should clear the timer

        await vi.advanceTimersByTimeAsync(QUERY_CANCEL_DELAY_MS);

        expect(imodel.createQueryReader).toHaveBeenCalledOnce(); // no cancel call
      });

      it("break in for await triggers return() on the wrapper", async () => {
        const coreReader = createCoreECSqlReaderStub([{ x: 1 }, { y: 2 }], { withReturn: true });
        const imodel = { createQueryReader: vi.fn().mockReturnValue(coreReader) };

        const executor = createECSqlQueryExecutor(imodel);
        const reader = executor.createQueryReader({ ecsql: "ecsql" });

        for await (const _ of reader) {
          break;
        }

        expect(coreReader.return).toHaveBeenCalledOnce();
      });
    });
  });
});

function createCoreECSqlReaderStub(rows: object[], opts?: { withReturn?: boolean }) {
  let curr = -1;
  const returnFn = opts?.withReturn ? vi.fn(async () => ({ done: true as const, value: undefined })) : undefined;
  return {
    next: vi.fn(async () => {
      ++curr;
      if (curr < rows.length) {
        return { done: false as const, value: createQueryRowProxy(rows[curr]) };
      }
      return { done: true as const, value: undefined };
    }),
    return: returnFn,
    async *[Symbol.asyncIterator]() {},
  };
}

function createQueryRowProxy(data: object) {
  return { ...data, toArray: () => data, toRow: () => data };
}

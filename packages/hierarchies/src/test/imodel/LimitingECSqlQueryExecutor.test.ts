/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { ECSqlQueryExecutor, trimWhitespace } from "@itwin/presentation-shared";
import { RowsLimitExceededError } from "../../hierarchies/HierarchyErrors.js";
import { createLimitingECSqlQueryExecutor } from "../../hierarchies/imodel/LimitingECSqlQueryExecutor.js";

describe("createLimitingECSqlQueryExecutor", () => {
  const baseExecutor = { createQueryReader: vi.fn<ECSqlQueryExecutor["createQueryReader"]>() };

  it("returns base executor's result", async () => {
    const row = [1, 2, 3];
    baseExecutor.createQueryReader.mockReturnValue(createAsyncIterator([row]));
    const limitingExecutor = createLimitingECSqlQueryExecutor(baseExecutor, 1);
    const rows = await collect(limitingExecutor.createQueryReader({ ecsql: "query" }));
    expect(rows).toEqual([row]);
  });

  it("throws when base executor returns more rows than the limit", async () => {
    baseExecutor.createQueryReader.mockReturnValue(createAsyncIterator([{}, {}]));
    const limitingExecutor = createLimitingECSqlQueryExecutor(baseExecutor, 1);
    await expect(collect(limitingExecutor.createQueryReader({ ecsql: "query" }))).rejects.toBeInstanceOf(
      RowsLimitExceededError,
    );
  });

  it(`calls base executor with original query when limit is "unbounded"`, async () => {
    baseExecutor.createQueryReader.mockReturnValue(createAsyncIterator([{}]));
    await collect(createLimitingECSqlQueryExecutor(baseExecutor, "unbounded").createQueryReader({ ecsql: "query" }));
    expect(baseExecutor.createQueryReader).toHaveBeenCalledOnce();
    expect(baseExecutor.createQueryReader.mock.calls[0][0]).toEqual({ ecsql: "query" });
  });

  it(`calls base executor with added CTEs`, async () => {
    baseExecutor.createQueryReader.mockReturnValue(createAsyncIterator([{}]));
    await collect(
      createLimitingECSqlQueryExecutor(baseExecutor, "unbounded").createQueryReader({
        ecsql: "query",
        ctes: ["cte1", "cte2"],
      }),
    );
    expect(baseExecutor.createQueryReader).toHaveBeenCalledOnce();
    expect(baseExecutor.createQueryReader.mock.calls[0][0]).toEqual({ ecsql: "query", ctes: ["cte1", "cte2"] });
  });

  it(`calls base executor with added limits`, async () => {
    baseExecutor.createQueryReader.mockReturnValue(createAsyncIterator([{}]));
    await collect(createLimitingECSqlQueryExecutor(baseExecutor, 1).createQueryReader({ ecsql: "query" }));
    expect(baseExecutor.createQueryReader).toHaveBeenCalledOnce();
    const calledArgs = baseExecutor.createQueryReader.mock.calls[0][0];
    expect(trimWhitespace(calledArgs.ecsql)).toBe(trimWhitespace("SELECT * FROM (query) LIMIT 2"));
  });
});

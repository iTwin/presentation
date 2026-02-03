/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import { trimWhitespace } from "@itwin/presentation-shared";
import { RowsLimitExceededError } from "../../hierarchies/HierarchyErrors.js";
import { createLimitingECSqlQueryExecutor } from "../../hierarchies/imodel/LimitingECSqlQueryExecutor.js";

import type { ECSqlQueryExecutor } from "@itwin/presentation-shared";

describe("createLimitingECSqlQueryExecutor", () => {
  const baseExecutor = {
    createQueryReader: sinon.stub<Parameters<ECSqlQueryExecutor["createQueryReader"]>, ReturnType<ECSqlQueryExecutor["createQueryReader"]>>(),
  };

  beforeEach(() => {
    baseExecutor.createQueryReader.reset();
  });

  it("returns base executor's result", async () => {
    const row = [1, 2, 3];
    baseExecutor.createQueryReader.returns(createAsyncIterator([row]));
    const limitingExecutor = createLimitingECSqlQueryExecutor(baseExecutor, 1);
    const rows = await collect(limitingExecutor.createQueryReader({ ecsql: "query" }));
    expect(rows).to.deep.eq([row]);
  });

  it("throws when base executor returns more rows than the limit", async () => {
    baseExecutor.createQueryReader.returns(createAsyncIterator([{}, {}]));
    const limitingExecutor = createLimitingECSqlQueryExecutor(baseExecutor, 1);
    await expect(collect(limitingExecutor.createQueryReader({ ecsql: "query" }))).to.eventually.be.rejectedWith(RowsLimitExceededError);
  });

  it(`calls base executor with original query when limit is "unbounded"`, async () => {
    baseExecutor.createQueryReader.returns(createAsyncIterator([{}]));
    await collect(createLimitingECSqlQueryExecutor(baseExecutor, "unbounded").createQueryReader({ ecsql: "query" }));
    expect(baseExecutor.createQueryReader).to.be.calledOnceWith({ ecsql: "query" });
  });

  it(`calls base executor with added CTEs`, async () => {
    baseExecutor.createQueryReader.returns(createAsyncIterator([{}]));
    await collect(createLimitingECSqlQueryExecutor(baseExecutor, "unbounded").createQueryReader({ ecsql: "query", ctes: ["cte1", "cte2"] }));
    expect(baseExecutor.createQueryReader).to.be.calledOnceWith({ ecsql: "query", ctes: ["cte1", "cte2"] });
  });

  it(`calls base executor with added limits`, async () => {
    baseExecutor.createQueryReader.returns(createAsyncIterator([{}]));
    await collect(createLimitingECSqlQueryExecutor(baseExecutor, 1).createQueryReader({ ecsql: "query" }));
    expect(baseExecutor.createQueryReader).to.be.calledOnceWith(
      sinon.match(({ ecsql }) => trimWhitespace(ecsql) === trimWhitespace("SELECT * FROM (query) LIMIT 2")),
    );
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { RowsLimitExceededError } from "../../hierarchy-builder/HierarchyErrors";
import { IECSqlQueryExecutor } from "../../hierarchy-builder/queries/ECSqlCore";
import { createLimitingECSqlQueryExecutor } from "../../hierarchy-builder/queries/LimitingECSqlQueryExecutor";
import { trimWhitespace } from "../queries/Utils";
import { createFakeQueryReader, toArray } from "../Utils";

describe("createLimitingECSqlQueryExecutor", () => {
  const baseExecutor = {
    createQueryReader: sinon.stub<Parameters<IECSqlQueryExecutor["createQueryReader"]>, ReturnType<IECSqlQueryExecutor["createQueryReader"]>>(),
  };

  beforeEach(() => {
    baseExecutor.createQueryReader.reset();
  });

  it("returns base executor's result", async () => {
    const row = [1, 2, 3];
    baseExecutor.createQueryReader.returns(createFakeQueryReader([row]));
    const limitingExecutor = createLimitingECSqlQueryExecutor(baseExecutor, 1);
    const rows = await toArray(limitingExecutor.createQueryReader({ ecsql: "query" }));
    expect(rows).to.deep.eq([row]);
  });

  it("throws when base executor returns more rows than the limit", async () => {
    baseExecutor.createQueryReader.returns(createFakeQueryReader([{}, {}]));
    const limitingExecutor = createLimitingECSqlQueryExecutor(baseExecutor, 1);
    await expect(toArray(limitingExecutor.createQueryReader({ ecsql: "query" }))).to.eventually.be.rejectedWith(RowsLimitExceededError);
  });

  it(`calls base executor with original query when limit is "unbounded"`, async () => {
    baseExecutor.createQueryReader.returns(createFakeQueryReader([{}]));
    await toArray(createLimitingECSqlQueryExecutor(baseExecutor, "unbounded").createQueryReader({ ecsql: "query" }));
    expect(baseExecutor.createQueryReader).to.be.calledOnceWith("query");
  });

  it(`calls base executor with added CTEs`, async () => {
    baseExecutor.createQueryReader.returns(createFakeQueryReader([{}]));
    await toArray(createLimitingECSqlQueryExecutor(baseExecutor, "unbounded").createQueryReader({ ecsql: "query", ctes: ["cte1", "cte2"] }));
    expect(baseExecutor.createQueryReader).to.be.calledOnceWith("WITH RECURSIVE cte1, cte2 query");
  });

  it(`calls base executor with added limits`, async () => {
    baseExecutor.createQueryReader.returns(createFakeQueryReader([{}]));
    await toArray(createLimitingECSqlQueryExecutor(baseExecutor, 1).createQueryReader({ ecsql: "query" }));
    expect(baseExecutor.createQueryReader).to.be.calledOnceWith(
      sinon.match((ecsql) => trimWhitespace(ecsql) === trimWhitespace("SELECT * FROM (query) LIMIT 2")),
    );
  });

  it(`calls base executor with added CTEs and limits`, async () => {
    baseExecutor.createQueryReader.returns(createFakeQueryReader([{}]));
    await toArray(createLimitingECSqlQueryExecutor(baseExecutor, 1).createQueryReader({ ecsql: "query", ctes: ["cte1", "cte2"] }));
    expect(baseExecutor.createQueryReader).to.be.calledOnceWith(
      sinon.match((ecsql) => trimWhitespace(ecsql) === trimWhitespace("WITH RECURSIVE cte1, cte2 SELECT * FROM (query) LIMIT 2")),
    );
  });
});

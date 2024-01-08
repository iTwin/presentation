/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { QueryBinder, QueryOptions, QueryRowFormat } from "@itwin/core-common";
import { Point2d, Point3d } from "@itwin/core-geometry";
import { ECSqlBinding } from "@itwin/presentation-hierarchy-builder";
import { createECSqlQueryExecutor, IECSqlReaderFactory } from "../core-interop/QueryExecutor";
import { createECSqlReaderStub } from "./Utils";

describe("createECSqlQueryExecutor", () => {
  describe("createQueryReader", () => {
    it("calls IModel's `createQueryReader` with default params", async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createECSqlReaderStub([{}, {}])),
      } as unknown as IECSqlReaderFactory;

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader("ecsql");
      for await (const _ of reader) {
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(imodel.createQueryReader).to.be.calledOnceWithExactly(
        "ecsql",
        sinon.match((binder: QueryBinder) => Object.keys(binder.serialize()).length === 0),
        sinon.match((options: QueryOptions) => Object.keys(options).length === 0),
      );
    });

    it('calls IModel\'s `createQueryReader` with "ECSqlPropertyNames" row format', async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createECSqlReaderStub([])),
      } as unknown as IECSqlReaderFactory;

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader("ecsql", undefined, { rowFormat: "ECSqlPropertyNames" });
      for await (const _ of reader) {
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(imodel.createQueryReader).to.be.calledOnceWithExactly(
        "ecsql",
        sinon.match((binder: QueryBinder) => Object.keys(binder.serialize()).length === 0),
        sinon.match((options: QueryOptions) => options.rowFormat === QueryRowFormat.UseECSqlPropertyNames),
      );
    });

    it('calls IModel\'s `createQueryReader` with "Indexes" row format', async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createECSqlReaderStub([])),
      } as unknown as IECSqlReaderFactory;

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader("ecsql", undefined, { rowFormat: "Indexes" });
      for await (const _ of reader) {
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(imodel.createQueryReader).to.be.calledOnceWithExactly(
        "ecsql",
        sinon.match((binder: QueryBinder) => Object.keys(binder.serialize()).length === 0),
        sinon.match((options: QueryOptions) => options.rowFormat === QueryRowFormat.UseECSqlPropertyIndexes),
      );
    });

    it("calls IModel's `createQueryReader` with different bindings", async () => {
      const imodel = {
        createQueryReader: sinon.stub().returns(createECSqlReaderStub([])),
      } as unknown as IECSqlReaderFactory;

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
      const reader = executor.createQueryReader("ecsql", bindings, undefined);
      for await (const _ of reader) {
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(imodel.createQueryReader).to.be.calledOnceWithExactly(
        "ecsql",
        sinon.match((binder: QueryBinder) => JSON.stringify(expectedBinder.serialize()) === JSON.stringify(binder.serialize())),
        sinon.match((options: QueryOptions) => Object.keys(options).length === 0),
      );
    });

    it("creates iterable reader", async () => {
      const rows = [{ x: 1 }, { y: 2 }];
      const imodel = {
        createQueryReader: sinon.stub().returns(createECSqlReaderStub(rows)),
      } as unknown as IECSqlReaderFactory;

      const executor = createECSqlQueryExecutor(imodel);
      const reader = executor.createQueryReader("ecsql");

      const resultRows = new Array<any>();
      for await (const row of reader) {
        resultRows.push(row);
      }

      expect(resultRows).to.deep.eq(rows);
    });
  });
});

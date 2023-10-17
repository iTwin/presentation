/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { ParsedHierarchyNode } from "../../hierarchy-builder/HierarchyNode";
import { applyLimit, defaultNodesParser, RowDef, TreeQueryResultsReader } from "../../hierarchy-builder/internal/TreeNodesReader";
import { ECSqlBinding, ECSqlQueryReader, ECSqlQueryReaderOptions, ECSqlQueryRow } from "../../hierarchy-builder/queries/ECSql";
import { ConcatenatedValue } from "../../hierarchy-builder/values/ConcatenatedValue";
import { trimWhitespace } from "../queries/Utils";

describe("TreeQueryResultsReader", () => {
  const parser = sinon.stub<[{ [columnName: string]: any }], ParsedHierarchyNode>();
  const executor = {
    createQueryReader: sinon.stub<[string, ECSqlBinding[] | undefined, ECSqlQueryReaderOptions | undefined], ECSqlQueryReader>(),
  };

  beforeEach(() => {
    parser.reset();
    executor.createQueryReader.reset();
  });

  it("returns all rows from executor", async () => {
    const ids = [1, 2, 3];
    const nodes = ids.map((id) => ({ label: id.toString(), key: id.toString(), children: false }));
    executor.createQueryReader.returns(createFakeQueryReader(ids.map((id) => ({ id }))));
    ids.forEach((_, i) => parser.onCall(i).returns(nodes[i]));

    const reader = new TreeQueryResultsReader({ parser });
    const result = await reader.read(executor, { ecsql: "QUERY" });
    expect(executor.createQueryReader).to.be.calledOnceWith("QUERY");
    expect(parser).to.be.calledThrice;
    expect(result).to.deep.eq(nodes);
  });

  it("throws when row limit is exceeded", async () => {
    executor.createQueryReader.returns(createFakeQueryReader([{ id: 1 }, { id: 2 }, { id: 3 }]));
    const reader = new TreeQueryResultsReader({ parser, limit: 2 });
    await expect(reader.read(executor, { ecsql: "QUERY" })).to.eventually.be.rejected;
  });

  function createFakeQueryReader(rows: object[]): ECSqlQueryReader {
    return {
      async *[Symbol.asyncIterator](): AsyncIterableIterator<ECSqlQueryRow> {
        for (const row of rows) {
          yield {
            ...row,
            toRow: () => row,
          } as ECSqlQueryRow;
        }
      },
    };
  }
});

describe("defaultNodesParser", () => {
  /* eslint-disable @typescript-eslint/naming-convention */
  it("parses ecsql row into `ParsedHierarchyNode`", () => {
    const row: RowDef = {
      FullClassName: "schema.class",
      ECInstanceId: "0x1",
      DisplayLabel: "test label",
      AutoExpand: true,
      ExtendedData: JSON.stringify({
        test: 123,
      }),
      GroupByClass: true,
      GroupByLabel: true,
      HasChildren: true,
      HideIfNoChildren: true,
      HideNodeInHierarchy: true,
      MergeByLabelId: "merge id",
    };
    const node = defaultNodesParser(row);
    expect(node).to.deep.eq({
      key: {
        type: "instances",
        instanceKeys: [{ className: "schema.class", id: "0x1" }],
      },
      label: [
        {
          type: "String",
          value: "test label",
        },
      ],
      extendedData: {
        test: 123,
      },
      children: true,
      autoExpand: true,
      processingParams: {
        hideIfNoChildren: true,
        hideInHierarchy: true,
        groupByClass: true,
        groupByLabel: true,
        mergeByLabelId: "merge id",
      },
    } as ParsedHierarchyNode);
  });

  it("parses empty label", () => {
    const row: RowDef = {
      FullClassName: "schema.class",
      ECInstanceId: "0x1",
      DisplayLabel: "",
    };
    const node = defaultNodesParser(row);
    expect(node.label).to.deep.eq([]);
  });

  it("parses complex label of one part", () => {
    const labelPart: ConcatenatedValue = {
      type: "Boolean",
      value: true,
    };
    const row: RowDef = {
      FullClassName: "schema.class",
      ECInstanceId: "0x1",
      DisplayLabel: JSON.stringify(labelPart),
    };
    const node = defaultNodesParser(row);
    expect(node.label).to.deep.eq([labelPart]);
  });

  it("parses complex label of multiple parts", () => {
    const labelParts: ConcatenatedValue = [
      {
        type: "Integer",
        value: 123,
      },
      {
        className: "x.y",
        propertyName: "p",
        value: "test",
      },
    ];
    const row: RowDef = {
      FullClassName: "schema.class",
      ECInstanceId: "0x1",
      DisplayLabel: JSON.stringify(labelParts),
    };
    const node = defaultNodesParser(row);
    expect(node.label).to.deep.eq(labelParts);
  });
  /* eslint-enable @typescript-eslint/naming-convention */
});

describe("applyLimit", () => {
  it("applies default limit on given query", () => {
    expect(trimWhitespace(applyLimit({ ecsql: "QUERY" }))).to.eq("SELECT * FROM (QUERY) LIMIT 1001");
  });

  it("applies custom limit +1 on given query", () => {
    expect(trimWhitespace(applyLimit({ ecsql: "QUERY", limit: 123 }))).to.eq("SELECT * FROM (QUERY) LIMIT 124");
  });

  it("applies limit on query with ctes", () => {
    expect(trimWhitespace(applyLimit({ ecsql: "QUERY", ctes: ["CTE1, CTE2"] }))).to.eq("WITH RECURSIVE CTE1, CTE2 SELECT * FROM (QUERY) LIMIT 1001");
  });
});

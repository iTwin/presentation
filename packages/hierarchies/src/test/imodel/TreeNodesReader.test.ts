/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, createAsyncIterator } from "presentation-test-utilities";
import { map } from "rxjs";
import sinon from "sinon";
import { ConcatenatedValue } from "@itwin/presentation-shared";
import { SourceHierarchyNode, SourceInstanceHierarchyNode } from "../../hierarchies/imodel/IModelHierarchyNode.js";
import { LimitingECSqlQueryExecutor } from "../../hierarchies/imodel/LimitingECSqlQueryExecutor.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import { defaultNodesParser, readNodes, RowDef } from "../../hierarchies/imodel/TreeNodesReader.js";
import { createTestSourceInstanceNode } from "../Utils.js";

describe("readNodes", () => {
  const parser = sinon.stub<[{ [columnName: string]: any }], SourceInstanceHierarchyNode>();
  const queryExecutor = {
    createQueryReader: sinon.stub<Parameters<LimitingECSqlQueryExecutor["createQueryReader"]>, ReturnType<LimitingECSqlQueryExecutor["createQueryReader"]>>(),
  };

  beforeEach(() => {
    parser.reset();
    queryExecutor.createQueryReader.reset();
  });

  it("returns all rows from queryExecutor", async () => {
    const ids = [1, 2, 3];
    const nodes = ids.map((id) =>
      createTestSourceInstanceNode({
        label: id.toString(),
        key: { type: "instances", instanceKeys: [{ className: "x", id: id.toString() }] },
        children: false,
      }),
    );
    queryExecutor.createQueryReader.returns(createAsyncIterator(ids.map((id) => ({ id }))));
    ids.forEach((_, i) => parser.onCall(i).returns(nodes[i]));

    const query = { ecsql: "QUERY", ctes: ["CTE1, CTE2"] };
    const result = await collect(readNodes({ queryExecutor, query, parser: (obs) => obs.pipe(map((props) => parser(props))) }));
    expect(queryExecutor.createQueryReader).to.be.calledOnceWith(query, { rowFormat: "ECSqlPropertyNames" });
    expect(parser).to.be.calledThrice;
    expect(result).to.deep.eq(nodes);
  });

  it("passes limit override to query queryExecutor", async () => {
    queryExecutor.createQueryReader.returns(createAsyncIterator([]));
    const query = { ecsql: "QUERY" };
    await collect(readNodes({ queryExecutor, query, limit: 123, parser: (obs) => obs.pipe(map((props) => parser(props))) }));
    expect(queryExecutor.createQueryReader).to.be.calledOnceWith(query, { rowFormat: "ECSqlPropertyNames", limit: 123 });
  });
});

describe("defaultNodesParser", () => {
  it("parses ecsql row into `SourceHierarchyNode`", () => {
    const row: RowDef = {
      [NodeSelectClauseColumnNames.FullClassName]: "schema.class",
      [NodeSelectClauseColumnNames.ECInstanceId]: "0x1",
      [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
      [NodeSelectClauseColumnNames.HasChildren]: true,
      [NodeSelectClauseColumnNames.HideIfNoChildren]: true,
      [NodeSelectClauseColumnNames.HideNodeInHierarchy]: true,
      [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
        byBaseClasses: {
          fullClassNames: [],
          hideIfNoSiblings: true,
          hideIfOneGroupedNode: true,
        },
        byClass: true,
        byLabel: true,
      }),
      [NodeSelectClauseColumnNames.ExtendedData]: JSON.stringify({
        test: 123,
      }),
      [NodeSelectClauseColumnNames.AutoExpand]: true,
      [NodeSelectClauseColumnNames.SupportsFiltering]: true,
    };
    const node = defaultNodesParser(row);
    expect(node).to.deep.eq({
      key: {
        type: "instances",
        instanceKeys: [{ className: "schema.class", id: "0x1" }],
      },
      label: "test label",
      extendedData: {
        test: 123,
      },
      children: true,
      autoExpand: true,
      supportsFiltering: true,
      processingParams: {
        hideIfNoChildren: true,
        hideInHierarchy: true,
        grouping: {
          byBaseClasses: {
            fullClassNames: [],
            hideIfNoSiblings: true,
            hideIfOneGroupedNode: true,
          },
          byClass: true,
          byLabel: true,
        },
      },
    } satisfies SourceHierarchyNode);
  });

  it("parses falsy `HasChildren`", () => {
    const row: RowDef = {
      [NodeSelectClauseColumnNames.FullClassName]: "schema.class",
      [NodeSelectClauseColumnNames.ECInstanceId]: "0x1",
      [NodeSelectClauseColumnNames.DisplayLabel]: "",
      [NodeSelectClauseColumnNames.HasChildren]: 0 as any,
    };
    const node = defaultNodesParser(row);
    expect(node.children).to.eq(false);
  });

  it("parses undefined `HasChildren`", () => {
    const row: RowDef = {
      [NodeSelectClauseColumnNames.FullClassName]: "schema.class",
      [NodeSelectClauseColumnNames.ECInstanceId]: "0x1",
      [NodeSelectClauseColumnNames.DisplayLabel]: "",
      [NodeSelectClauseColumnNames.HasChildren]: undefined,
    };
    const node = defaultNodesParser(row);
    expect(node.children).to.be.undefined;
  });

  it("parses complex label of multiple parts", () => {
    const labelParts: ConcatenatedValue = [
      {
        type: "Integer",
        value: 123,
      },
      "test",
      [
        {
          type: "Boolean",
          value: true,
        },
        "xxx",
      ],
    ];
    const row: RowDef = {
      [NodeSelectClauseColumnNames.FullClassName]: "schema.class",
      [NodeSelectClauseColumnNames.ECInstanceId]: "0x1",
      [NodeSelectClauseColumnNames.DisplayLabel]: JSON.stringify(labelParts),
    };
    const node = defaultNodesParser(row);
    expect(node.label).to.deep.eq(labelParts);
  });
});

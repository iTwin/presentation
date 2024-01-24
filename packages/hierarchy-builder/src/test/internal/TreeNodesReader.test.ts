/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { ParsedHierarchyNode, ParsedInstanceHierarchyNode } from "../../hierarchy-builder/HierarchyNode";
import { defaultNodesParser, RowDef, TreeQueryResultsReader } from "../../hierarchy-builder/internal/TreeNodesReader";
import { ILimitingECSqlQueryExecutor } from "../../hierarchy-builder/queries/ECSqlCore";
import { NodeSelectClauseColumnNames } from "../../hierarchy-builder/queries/NodeSelectQueryFactory";
import { ConcatenatedValue } from "../../hierarchy-builder/values/ConcatenatedValue";
import { createFakeQueryReader, createTestParsedInstanceNode, toArray } from "../Utils";

describe("TreeQueryResultsReader", () => {
  const parser = sinon.stub<[{ [columnName: string]: any }], ParsedInstanceHierarchyNode>();
  const executor = {
    createQueryReader: sinon.stub<Parameters<ILimitingECSqlQueryExecutor["createQueryReader"]>, ReturnType<ILimitingECSqlQueryExecutor["createQueryReader"]>>(),
  };

  beforeEach(() => {
    parser.reset();
    executor.createQueryReader.reset();
  });

  it("returns all rows from executor", async () => {
    const ids = [1, 2, 3];
    const nodes = ids.map((id) =>
      createTestParsedInstanceNode({
        label: id.toString(),
        key: { type: "instances", instanceKeys: [{ className: "x", id: id.toString() }] },
        children: false,
      }),
    );
    executor.createQueryReader.returns(createFakeQueryReader(ids.map((id) => ({ id }))));
    ids.forEach((_, i) => parser.onCall(i).returns(nodes[i]));

    const reader = new TreeQueryResultsReader({ parser });
    const query = { ecsql: "QUERY", ctes: ["CTE1, CTE2"] };
    const result = await toArray(reader.read(executor, query));
    expect(executor.createQueryReader).to.be.calledOnceWith(query, { rowFormat: "ECSqlPropertyNames", limit: undefined });
    expect(parser).to.be.calledThrice;
    expect(result).to.deep.eq(nodes);
  });
});

describe("defaultNodesParser", () => {
  it("parses ecsql row into `ParsedHierarchyNode`", () => {
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
    } as ParsedHierarchyNode);
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

  it("parses empty label", () => {
    const row: RowDef = {
      [NodeSelectClauseColumnNames.FullClassName]: "schema.class",
      [NodeSelectClauseColumnNames.ECInstanceId]: "0x1",
      [NodeSelectClauseColumnNames.DisplayLabel]: "",
    };
    const node = defaultNodesParser(row);
    expect(node.label).to.eq("");
  });

  it("parses complex label of one part", () => {
    const labelPart: ConcatenatedValue = {
      type: "Boolean",
      value: true,
    };
    const row: RowDef = {
      [NodeSelectClauseColumnNames.FullClassName]: "schema.class",
      [NodeSelectClauseColumnNames.ECInstanceId]: "0x1",
      [NodeSelectClauseColumnNames.DisplayLabel]: JSON.stringify(labelPart),
    };
    const node = defaultNodesParser(row);
    expect(node.label).to.deep.eq(labelPart);
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
      [NodeSelectClauseColumnNames.FullClassName]: "schema.class",
      [NodeSelectClauseColumnNames.ECInstanceId]: "0x1",
      [NodeSelectClauseColumnNames.DisplayLabel]: JSON.stringify(labelParts),
    };
    const node = defaultNodesParser(row);
    expect(node.label).to.deep.eq(labelParts);
  });
});

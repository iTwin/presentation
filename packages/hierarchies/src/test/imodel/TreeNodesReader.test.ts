/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator } from "presentation-test-utilities";
import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { ConcatenatedValue } from "@itwin/presentation-shared";
import { SourceHierarchyNode, SourceInstanceHierarchyNode } from "../../hierarchies/imodel/IModelHierarchyNode.js";
import { LimitingECSqlQueryExecutor } from "../../hierarchies/imodel/LimitingECSqlQueryExecutor.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import { defaultNodesParser, readNodes, RowDef } from "../../hierarchies/imodel/TreeNodesReader.js";
import { createTestSourceInstanceNode } from "../Utils.js";

describe("readNodes", () => {
  const parser = vi.fn<(row: { [columnName: string]: any }) => SourceInstanceHierarchyNode>();
  const createQueryReaderMock = vi.fn();
  const queryExecutor = { createQueryReader: createQueryReaderMock } as unknown as LimitingECSqlQueryExecutor;

  it("returns all rows from queryExecutor", async () => {
    const ids = [1, 2, 3];
    const nodes = ids.map((id) =>
      createTestSourceInstanceNode({
        label: id.toString(),
        key: { type: "instances", instanceKeys: [{ className: "x", id: id.toString() }] },
        children: false,
      }),
    );
    createQueryReaderMock.mockReturnValue(createAsyncIterator(ids.map((id) => ({ id }))));
    nodes.forEach((node) => parser.mockReturnValueOnce(node));

    const query = { ecsql: "QUERY", ctes: ["CTE1, CTE2"] };
    const result = await collect(readNodes({ queryExecutor, query, parser: (row) => of(parser(row)) }));
    expect(createQueryReaderMock).toHaveBeenCalledExactlyOnceWith(
      query,
      expect.objectContaining({ rowFormat: "ECSqlPropertyNames", restartToken: expect.any(String) }),
    );
    expect(parser).toHaveBeenCalledTimes(3);
    expect(result).toEqual(nodes);
  });

  it("passes limit override to query queryExecutor", async () => {
    createQueryReaderMock.mockReturnValue(createAsyncIterator([]));
    const query = { ecsql: "QUERY" };
    await collect(readNodes({ queryExecutor, query, limit: 123, parser: (row) => of(parser(row)) }));
    expect(createQueryReaderMock).toHaveBeenCalledExactlyOnceWith(
      query,
      expect.objectContaining({ rowFormat: "ECSqlPropertyNames", limit: 123, restartToken: expect.any(String) }),
    );
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
        byBaseClasses: { fullClassNames: [], hideIfNoSiblings: true, hideIfOneGroupedNode: true },
        byClass: true,
        byLabel: true,
      }),
      [NodeSelectClauseColumnNames.ExtendedData]: JSON.stringify({ test: 123 }),
      [NodeSelectClauseColumnNames.AutoExpand]: true,
      [NodeSelectClauseColumnNames.SupportsFiltering]: true,
    };
    const node = defaultNodesParser(row);
    expect(node).toEqual({
      key: { type: "instances", instanceKeys: [{ className: "schema.class", id: "0x1" }] },
      label: "test label",
      extendedData: { test: 123 },
      children: true,
      autoExpand: true,
      supportsFiltering: true,
      processingParams: {
        hideIfNoChildren: true,
        hideInHierarchy: true,
        grouping: {
          byBaseClasses: { fullClassNames: [], hideIfNoSiblings: true, hideIfOneGroupedNode: true },
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
    expect(node.children).toBe(false);
  });

  it("parses undefined `HasChildren`", () => {
    const row: RowDef = {
      [NodeSelectClauseColumnNames.FullClassName]: "schema.class",
      [NodeSelectClauseColumnNames.ECInstanceId]: "0x1",
      [NodeSelectClauseColumnNames.DisplayLabel]: "",
      [NodeSelectClauseColumnNames.HasChildren]: undefined,
    };
    const node = defaultNodesParser(row);
    expect(node.children).toBeUndefined();
  });

  it("parses complex label of multiple parts", () => {
    const labelParts: ConcatenatedValue = [
      { type: "Integer", value: 123 },
      "test",
      [{ type: "Boolean", value: true }, "xxx"],
    ];
    const row: RowDef = {
      [NodeSelectClauseColumnNames.FullClassName]: "schema.class",
      [NodeSelectClauseColumnNames.ECInstanceId]: "0x1",
      [NodeSelectClauseColumnNames.DisplayLabel]: JSON.stringify(labelParts),
    };
    const node = defaultNodesParser(row);
    expect(node.label).toEqual(labelParts);
  });
});

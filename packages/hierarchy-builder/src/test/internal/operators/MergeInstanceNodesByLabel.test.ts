/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from, Observable } from "rxjs";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createMergeInstanceNodesByLabelOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/MergeInstanceNodesByLabel";
import { createTestInstanceKey, createTestNode, getObservableResult } from "../../Utils";

describe("MergeInstanceNodesByLabel", () => {
  before(() => {
    Logger.initializeToConsole();
    Logger.turnOffCategories();
    Logger.setLevel(LOGGING_NAMESPACE, LogLevel.Trace);
  });

  const directNodesCache = new Map<string, Observable<HierarchyNode>>();
  beforeEach(() => {
    directNodesCache.clear();
  });

  it("doesnt merge nodes that have `mergeByLabelId = undefined`", async () => {
    const nodes = [
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] } }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator(directNodesCache)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesnt merge nodes that have empty `mergeByLabelId`", async () => {
    const nodes = [
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] }, params: { mergeByLabelId: "" } }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, params: { mergeByLabelId: "" } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator(directNodesCache)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesnt merge nodes that have different `mergeByLabelId`", async () => {
    const nodes = [
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] }, params: { mergeByLabelId: "a" } }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, params: { mergeByLabelId: "b" } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator(directNodesCache)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesnt merge nodes that have different labels", async () => {
    const nodes = [
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] }, label: "a", params: { mergeByLabelId: "x" } }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, label: "b", params: { mergeByLabelId: "x" } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator(directNodesCache)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesnt merge nodes of different types", async () => {
    const nodes = [
      createTestNode({ key: "custom", params: { mergeByLabelId: "x" } }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, params: { mergeByLabelId: "x" } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator(directNodesCache)));
    expect(result).to.deep.eq(nodes);
  });

  it("merges nodes that have same `mergeByLabelId` and label", async () => {
    const nodes = [
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] }, label: "a", params: { mergeByLabelId: "x" } }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, label: "b", params: { mergeByLabelId: "y" } }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x3" })] }, label: "a", params: { mergeByLabelId: "x" } }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x4" })] }, label: "b", params: { mergeByLabelId: "y" } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator(directNodesCache)));
    expect(result).to.deep.eq([
      createTestNode({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x3" })],
        },
        label: "a",
        params: {
          mergeByLabelId: "x",
        },
      }),
      createTestNode({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x2" }), createTestInstanceKey({ id: "0x4" })],
        },
        label: "b",
        params: {
          mergeByLabelId: "y",
        },
      }),
    ]);
  });
});

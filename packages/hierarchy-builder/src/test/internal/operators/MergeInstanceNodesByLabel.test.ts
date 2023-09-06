/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from, Observable } from "rxjs";
import { InProgressHierarchyNode } from "../../../hierarchy-builder/internal/Common";
import { createMergeInstanceNodesByLabelOperator } from "../../../hierarchy-builder/internal/operators/MergeInstanceNodesByLabel";
import { createTestInstanceKey, createTestNode, getObservableResult } from "../../Utils";

describe("mergeInstanceNodesByLabelOperator", () => {
  const directNodesCache = new Map<string, Observable<InProgressHierarchyNode>>();
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
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] }, mergeByLabelId: "" }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, mergeByLabelId: "" }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator(directNodesCache)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesnt merge nodes that have different `mergeByLabelId`", async () => {
    const nodes = [
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] }, mergeByLabelId: "a" }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, mergeByLabelId: "b" }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator(directNodesCache)));
    expect(result).to.deep.eq(nodes);
  });

  it("merges nodes that have same `mergeByLabelId`", async () => {
    const nodes = [
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] }, mergeByLabelId: "x" }),
      createTestNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, mergeByLabelId: "x" }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator(directNodesCache)));
    expect(result).to.deep.eq([
      createTestNode({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        },
        mergeByLabelId: "x",
      }),
    ]);
  });
});

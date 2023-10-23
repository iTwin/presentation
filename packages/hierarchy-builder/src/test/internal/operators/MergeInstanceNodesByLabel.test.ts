/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { LogLevel } from "@itwin/core-bentley";
import { createMergeInstanceNodesByLabelOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/MergeInstanceNodesByLabel";
import { createTestInstanceKey, createTestProcessedNode, getObservableResult, setupLogging } from "../../Utils";

describe("MergeInstanceNodesByLabel", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("doesn't merge nodes that have `mergeByLabelId = undefined`", async () => {
    const nodes = [
      createTestProcessedNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] } }),
      createTestProcessedNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator()));
    expect(result).to.deep.eq(nodes);
  });

  it("doesn't merge nodes that have empty `mergeByLabelId`", async () => {
    const nodes = [
      createTestProcessedNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] }, processingParams: { mergeByLabelId: "" } }),
      createTestProcessedNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, processingParams: { mergeByLabelId: "" } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator()));
    expect(result).to.deep.eq(nodes);
  });

  it("doesn't merge nodes that have different `mergeByLabelId`", async () => {
    const nodes = [
      createTestProcessedNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] }, processingParams: { mergeByLabelId: "a" } }),
      createTestProcessedNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, processingParams: { mergeByLabelId: "b" } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator()));
    expect(result).to.deep.eq(nodes);
  });

  it("doesn't merge nodes that have different labels", async () => {
    const nodes = [
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
        label: "a",
        processingParams: { mergeByLabelId: "x" },
      }),
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
        label: "b",
        processingParams: { mergeByLabelId: "x" },
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator()));
    expect(result).to.deep.eq(nodes);
  });

  it("doesn't merge nodes of different types", async () => {
    const nodes = [
      createTestProcessedNode({ key: "custom", processingParams: { mergeByLabelId: "x" } }),
      createTestProcessedNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] }, processingParams: { mergeByLabelId: "x" } }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator()));
    expect(result).to.deep.eq(nodes);
  });

  it("merges nodes that have same `mergeByLabelId` and label", async () => {
    const nodes = [
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
        label: "a",
        processingParams: { mergeByLabelId: "x" },
      }),
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
        label: "b",
        processingParams: { mergeByLabelId: "y" },
      }),
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x3" })] },
        label: "a",
        processingParams: { mergeByLabelId: "x" },
      }),
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x4" })] },
        label: "b",
        processingParams: { mergeByLabelId: "y" },
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createMergeInstanceNodesByLabelOperator()));
    expect(result).to.deep.eq([
      createTestProcessedNode({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x3" })],
        },
        label: "a",
        processingParams: {
          mergeByLabelId: "x",
        },
      }),
      createTestProcessedNode({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x2" }), createTestInstanceKey({ id: "0x4" })],
        },
        label: "b",
        processingParams: {
          mergeByLabelId: "y",
        },
      }),
    ]);
  });
});

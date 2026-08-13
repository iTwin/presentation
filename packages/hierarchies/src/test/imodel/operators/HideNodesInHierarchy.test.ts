/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, waitFor } from "presentation-test-utilities";
import { from, Observable } from "rxjs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LogLevel } from "@itwin/core-bentley";
import { ProcessedHierarchyNode } from "../../../hierarchies/imodel/IModelHierarchyNode.js";
import {
  createHideNodesInHierarchyOperator,
  LOGGING_NAMESPACE,
} from "../../../hierarchies/imodel/operators/HideNodesInHierarchy.js";
import {
  createTestGenericNodeKey,
  createTestInstanceKey,
  createTestProcessedGenericNode,
  createTestProcessedInstanceNode,
  setupLogging,
} from "../../Utils.js";

describe("HideNodesInHierarchyOperator", () => {
  beforeAll(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("returns nodes that don't need hiding", async () => {
    const nodes = [createTestProcessedGenericNode()];
    const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(vi.fn(), false)));
    expect(result).toEqual(nodes);
  });

  it("returns the first hidden node if it has children and operator is created with `stopOnFirstChild = true`", async () => {
    const nodes: ProcessedHierarchyNode[] = [
      createTestProcessedGenericNode({
        key: createTestGenericNodeKey({ id: "custom1" }),
        label: "custom1",
        children: true,
        processingParams: { hideInHierarchy: true },
      }),
      createTestProcessedGenericNode({
        key: createTestGenericNodeKey({ id: "custom2" }),
        label: "custom2",
        children: true,
        processingParams: { hideInHierarchy: true },
      }),
    ];
    const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(vi.fn(), true)));
    expect(result).toEqual([nodes[0]]);
  });

  it("returns the first hidden node if it undetermined children evaluating to `true` and operator is created with `stopOnFirstChild = true`", async () => {
    const nodes: ProcessedHierarchyNode[] = [
      createTestProcessedGenericNode({
        key: createTestGenericNodeKey({ id: "custom1" }),
        label: "custom1",
        children: undefined,
        processingParams: { hideInHierarchy: true },
      }),
      createTestProcessedGenericNode({
        key: createTestGenericNodeKey({ id: "custom2" }),
        label: "custom2",
        children: undefined,
        processingParams: { hideInHierarchy: true },
      }),
    ];
    const childNode = createTestProcessedGenericNode();
    const getNodes = vi.fn().mockImplementation(() => from([childNode]));
    const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, true)));
    expect(result).toEqual([childNode]);
  });

  describe("instance nodes", () => {
    it("hides nodes without children", async () => {
      const nodes = [createTestProcessedGenericNode({ children: false, processingParams: { hideInHierarchy: true } })];
      const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(vi.fn(), false)));
      expect(result).toEqual([]);
    });

    it("hides nodes with undetermined children evaluating to empty array", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [createTestInstanceKey()] },
          label: "test",
          children: undefined,
          processingParams: { hideInHierarchy: true },
        }),
      ];
      const getNodes = vi.fn().mockImplementation(() => from([]));
      const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).toEqual([]);
    });

    it("hides nodes with undetermined children evaluating to children array", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
          label: "hidden",
          children: undefined,
          processingParams: { hideInHierarchy: true },
        }),
      ];
      const childNodes: ProcessedHierarchyNode[] = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
          label: "visible",
          children: false,
        }),
      ];
      const getNodes = vi.fn().mockImplementation(() => from(childNodes));
      const result = await collect(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).toEqual(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
          label: "a",
          processingParams: { hideInHierarchy: true },
        }),
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
          label: "b",
          processingParams: { hideInHierarchy: true },
        }),
      ];
      const getNodes = vi.fn().mockImplementation(() => from([]));
      const result = await collect(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(getNodes).toHaveBeenCalledExactlyOnceWith({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        },
        parentKeys: [],
        label: "a",
        processingParams: { hideInHierarchy: true },
      });
      expect(result).toEqual([]);
    });
  });

  describe("generic nodes", () => {
    it("hides nodes", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom" }),
          label: "hidden",
          processingParams: { hideInHierarchy: true },
        }),
      ];
      const childNodes: ProcessedHierarchyNode[] = [
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom" }),
          label: "visible",
          children: false,
        }),
      ];
      const getNodes = vi.fn().mockImplementation(() => from(childNodes));
      const result = await collect(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).toEqual(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom" }),
          label: "a",
          processingParams: { hideInHierarchy: true },
        }),
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom" }),
          label: "b",
          processingParams: { hideInHierarchy: true },
        }),
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom", source: "s" }),
          label: "c",
          processingParams: { hideInHierarchy: true },
        }),
      ];
      const getNodes = vi.fn().mockImplementation(() => from([]));
      const result = await collect(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(getNodes).toHaveBeenCalledTimes(2);
      expect(getNodes).toHaveBeenNthCalledWith(1, {
        key: createTestGenericNodeKey({ id: "custom" }),
        parentKeys: [],
        label: "a",
        processingParams: { hideInHierarchy: true },
      });
      expect(getNodes).toHaveBeenNthCalledWith(2, {
        key: createTestGenericNodeKey({ id: "custom", source: "s" }),
        parentKeys: [],
        label: "c",
        processingParams: { hideInHierarchy: true },
      });
      expect(result).toEqual([]);
    });

    it("subscribes to input observable once", async () => {
      const processedHierarchyNodesObservable = new Observable<any>();
      const subscriptionSpy = vi.spyOn(processedHierarchyNodesObservable, "subscribe");
      const promise = processedHierarchyNodesObservable.pipe(createHideNodesInHierarchyOperator(() => from([]), false));
      promise.subscribe();
      await waitFor(() => expect(subscriptionSpy).toHaveBeenCalledOnce());
    });
  });
});

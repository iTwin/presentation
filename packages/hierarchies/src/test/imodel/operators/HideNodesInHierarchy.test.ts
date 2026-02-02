/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, waitFor } from "presentation-test-utilities";
import { from, Observable } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import type { ProcessedHierarchyNode } from "../../../hierarchies/imodel/IModelHierarchyNode.js";
import { createHideNodesInHierarchyOperator, LOGGING_NAMESPACE } from "../../../hierarchies/imodel/operators/HideNodesInHierarchy.js";
import { createTestGenericNodeKey, createTestInstanceKey, createTestProcessedGenericNode, createTestProcessedInstanceNode, setupLogging } from "../../Utils.js";

describe("HideNodesInHierarchyOperator", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("returns nodes that don't need hiding", async () => {
    const nodes = [createTestProcessedGenericNode()];
    const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), false)));
    expect(result).to.deep.eq(nodes);
  });

  it("returns the first hidden node if it has children and operator is created with `stopOnFirstChild = true`", async () => {
    const nodes: ProcessedHierarchyNode[] = [
      createTestProcessedGenericNode({
        key: createTestGenericNodeKey({ id: "custom1" }),
        label: "custom1",
        children: true,
        processingParams: {
          hideInHierarchy: true,
        },
      }),
      createTestProcessedGenericNode({
        key: createTestGenericNodeKey({ id: "custom2" }),
        label: "custom2",
        children: true,
        processingParams: {
          hideInHierarchy: true,
        },
      }),
    ];
    const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), true)));
    expect(result).to.deep.eq([nodes[0]]);
  });

  it("returns the first hidden node if it undetermined children evaluating to `true` and operator is created with `stopOnFirstChild = true`", async () => {
    const nodes: ProcessedHierarchyNode[] = [
      createTestProcessedGenericNode({
        key: createTestGenericNodeKey({ id: "custom1" }),
        label: "custom1",
        children: undefined,
        processingParams: {
          hideInHierarchy: true,
        },
      }),
      createTestProcessedGenericNode({
        key: createTestGenericNodeKey({ id: "custom2" }),
        label: "custom2",
        children: undefined,
        processingParams: {
          hideInHierarchy: true,
        },
      }),
    ];
    const childNode = createTestProcessedGenericNode();
    const getNodes = sinon.fake(() => from([childNode]));
    const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, true)));
    expect(result).to.deep.eq([childNode]);
  });

  describe("instance nodes", () => {
    it("hides nodes without children", async () => {
      const nodes = [
        createTestProcessedGenericNode({
          children: false,
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), false)));
      expect(result).to.deep.eq([]);
    });

    it("hides nodes with undetermined children evaluating to empty array", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedInstanceNode({
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey()],
          },
          label: "test",
          children: undefined,
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const getNodes = sinon.fake(() => from([]));
      const result = await collect(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).to.deep.eq([]);
    });

    it("hides nodes with undetermined children evaluating to children array", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedInstanceNode({
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x1" })],
          },
          label: "hidden",
          children: undefined,
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const childNodes: ProcessedHierarchyNode[] = [
        createTestProcessedInstanceNode({
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x2" })],
          },
          label: "visible",
          children: false,
        }),
      ];
      const getNodes = sinon.fake(() => from(childNodes));
      const result = await collect(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).to.deep.eq(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedInstanceNode({
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x1" })],
          },
          label: "a",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        createTestProcessedInstanceNode({
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x2" })],
          },
          label: "b",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const getNodes = sinon.fake(() => from([]));
      const result = await collect(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(getNodes).to.be.calledOnceWithExactly({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        },
        parentKeys: [],
        label: "a",
        processingParams: {
          hideInHierarchy: true,
        },
      });
      expect(result).to.deep.eq([]);
    });
  });

  describe("generic nodes", () => {
    it("hides nodes", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom" }),
          label: "hidden",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const childNodes: ProcessedHierarchyNode[] = [
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom" }),
          label: "visible",
          children: false,
        }),
      ];
      const getNodes = sinon.fake(() => from(childNodes));
      const result = await collect(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).to.deep.eq(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom" }),
          label: "a",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom" }),
          label: "b",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        createTestProcessedGenericNode({
          key: createTestGenericNodeKey({ id: "custom", source: "s" }),
          label: "c",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const getNodes = sinon.fake(() => from([]));
      const result = await collect(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(getNodes).to.be.calledTwice;
      expect(getNodes.firstCall).to.be.calledWithExactly({
        key: createTestGenericNodeKey({ id: "custom" }),
        parentKeys: [],
        label: "a",
        processingParams: {
          hideInHierarchy: true,
        },
      });
      expect(getNodes.secondCall).to.be.calledWithExactly({
        key: createTestGenericNodeKey({ id: "custom", source: "s" }),
        parentKeys: [],
        label: "c",
        processingParams: {
          hideInHierarchy: true,
        },
      });
      expect(result).to.deep.eq([]);
    });

    it("subscribes to input observable once", async () => {
      const processedHierarchyNodesObservable = new Observable<any>();
      const subscriptionSpy = sinon.spy(processedHierarchyNodesObservable, "subscribe");
      const promise = processedHierarchyNodesObservable.pipe(createHideNodesInHierarchyOperator(() => from([]), false));
      promise.subscribe();
      await waitFor(() => expect(subscriptionSpy).to.have.been.calledOnce);
    });
  });
});

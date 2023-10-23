/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import { HierarchyNode, ProcessedHierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createHideNodesInHierarchyOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/HideNodesInHierarchy";
import { createTestInstanceKey, createTestProcessedNode, getObservableResult, setupLogging } from "../../Utils";

describe("HideNodesInHierarchyOperator", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("returns nodes that don't need hiding", async () => {
    const nodes = [createTestProcessedNode()];
    const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), false)));
    expect(result).to.deep.eq(nodes);
  });

  it("returns the first hidden node if it has children and operator is created with `stopOnFirstChild = true`", async () => {
    const nodes: ProcessedHierarchyNode[] = [
      createTestProcessedNode({
        key: "custom1",
        label: "custom1",
        children: true,
        processingParams: {
          hideInHierarchy: true,
        },
      }),
      createTestProcessedNode({
        key: "custom2",
        label: "custom2",
        children: true,
        processingParams: {
          hideInHierarchy: true,
        },
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), true)));
    expect(result).to.deep.eq([nodes[0]]);
  });

  it("returns the first hidden node if it undetermined children evaluating to `true` and operator is created with `stopOnFirstChild = true`", async () => {
    const nodes: ProcessedHierarchyNode[] = [
      createTestProcessedNode({
        key: "custom1",
        label: "custom1",
        children: undefined,
        processingParams: {
          hideInHierarchy: true,
        },
      }),
      createTestProcessedNode({
        key: "custom2",
        label: "custom2",
        children: undefined,
        processingParams: {
          hideInHierarchy: true,
        },
      }),
    ];
    const childNode: HierarchyNode = {
      key: "custom child",
      label: "custom child",
      children: false,
      parentKeys: [],
    };
    const getNodes = sinon.fake(() => from([childNode]));
    const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, true)));
    expect(result).to.deep.eq([childNode]);
  });

  describe("instance nodes", () => {
    it("hides nodes without children", async () => {
      const nodes = [
        createTestProcessedNode({
          children: [],
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), false)));
      expect(result).to.deep.eq([]);
    });

    it("hides nodes with undetermined children evaluating to empty array", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
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
      const getNodes = sinon.fake(() => from(new Array<HierarchyNode>()));
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).to.deep.eq([]);
    });

    it("hides nodes with undetermined children evaluating to children array", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
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
        createTestProcessedNode({
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x2" })],
          },
          label: "visible",
          children: false,
        }),
      ];
      const getNodes = sinon.fake(() => from(childNodes));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).to.deep.eq(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x1" })],
          },
          label: "a",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        createTestProcessedNode({
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
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
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

  describe("class grouping nodes", () => {
    it("hides nodes with determined children", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: {
            type: "class-grouping",
            class: { name: "TestClass", label: "Test class" },
          },
          label: "Test class",
          processingParams: {
            hideInHierarchy: true,
          },
          children: [
            createTestProcessedNode({
              label: "a",
              key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
            }),
            createTestProcessedNode({
              label: "b",
              key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
            }),
          ],
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), false)));
      expect(result).to.deep.eq(nodes[0].children);
    });

    it("hides nodes with undetermined children", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: {
            type: "class-grouping",
            class: { name: "TestClass", label: "Test class" },
          },
          label: "Test class",
          processingParams: {
            hideInHierarchy: true,
          },
          children: undefined,
        }),
      ];
      const childNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          label: "a",
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
        }),
        createTestProcessedNode({
          label: "b",
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
        }),
      ];
      const getNodes = sinon.fake(() => from(childNodes));
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).to.deep.eq(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: {
            type: "class-grouping",
            class: { name: "TestSchema.X", label: "X" },
          },
          label: "a",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        createTestProcessedNode({
          key: {
            type: "class-grouping",
            class: { name: "TestSchema.X", label: "X" },
          },
          label: "b",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const getNodes = sinon.fake(() => from([]));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(getNodes).to.be.calledOnceWithExactly({
        key: {
          type: "class-grouping",
          class: { name: "TestSchema.X", label: "X" },
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

  describe("label grouping nodes", () => {
    it("hides nodes with determined children", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: {
            type: "label-grouping",
            label: "Test class",
          },
          label: "Test class",
          processingParams: {
            hideInHierarchy: true,
          },
          children: [
            createTestProcessedNode({
              label: "a",
              key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
            }),
            createTestProcessedNode({
              label: "a",
              key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
            }),
          ],
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), false)));
      expect(result).to.deep.eq(nodes[0].children);
    });

    it("hides nodes with undetermined children", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: {
            type: "label-grouping",
            label: "Test class",
          },
          label: "Test class",
          processingParams: {
            hideInHierarchy: true,
          },
          children: undefined,
        }),
      ];
      const childNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          label: "a",
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
        }),
        createTestProcessedNode({
          label: "b",
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
        }),
      ];
      const getNodes = sinon.fake(() => from(childNodes));
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).to.deep.eq(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: {
            type: "label-grouping",
            label: "1",
          },
          label: "1",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        createTestProcessedNode({
          key: {
            type: "label-grouping",
            label: "1",
          },
          label: "2",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const getNodes = sinon.fake(() => from([]));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(getNodes).to.be.calledOnceWithExactly({
        key: {
          type: "label-grouping",
          label: "1",
        },
        parentKeys: [],
        label: "1",
        processingParams: {
          hideInHierarchy: true,
        },
      });
      expect(result).to.deep.eq([]);
    });
  });

  describe("custom nodes", () => {
    it("hides nodes", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: "custom",
          label: "hidden",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const childNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: "custom",
          label: "visible",
          children: false,
        }),
      ];
      const getNodes = sinon.fake(() => from(childNodes));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(result).to.deep.eq(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: "custom",
          label: "a",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        createTestProcessedNode({
          key: "custom",
          label: "b",
          processingParams: {
            hideInHierarchy: true,
          },
        }),
      ];
      const getNodes = sinon.fake(() => from([]));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, false)));
      expect(getNodes).to.be.calledOnceWithExactly({
        key: "custom",
        parentKeys: [],
        label: "a",
        processingParams: {
          hideInHierarchy: true,
        },
      });
      expect(result).to.deep.eq([]);
    });
  });
});

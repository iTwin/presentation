/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from, Observable } from "rxjs";
import sinon from "sinon";
import { Id64, Logger, LogLevel } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createHideNodesInHierarchyOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/HideNodesInHierarchy";
import { createTestInstanceKey, createTestNode, getObservableResult } from "../../Utils";

describe("HideNodesInHierarchyOperator", () => {
  before(() => {
    Logger.initializeToConsole();
    Logger.turnOffCategories();
    Logger.setLevel(LOGGING_NAMESPACE, LogLevel.Trace);
  });

  const directNodesCache = new Map<string, Observable<HierarchyNode>>();
  beforeEach(() => {
    directNodesCache.clear();
  });

  it("returns nodes that don't need hiding", async () => {
    const nodes = [createTestNode()];
    const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), directNodesCache, false)));
    expect(result).to.deep.eq(nodes);
  });

  it("returns the first hidden node if it has children and operator is created with `stopOnFirstChild = true`", async () => {
    const nodes: HierarchyNode[] = [
      {
        key: "custom1",
        label: "custom1",
        children: true,
        params: {
          hideInHierarchy: true,
        },
      },
      {
        key: "custom2",
        label: "custom2",
        children: true,
        params: {
          hideInHierarchy: true,
        },
      },
    ];
    const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), directNodesCache, true)));
    expect(result).to.deep.eq([nodes[0]]);
  });

  it("returns the first hidden node if it undetermined children evaluating to `true` and operator is created with `stopOnFirstChild = true`", async () => {
    const nodes: HierarchyNode[] = [
      {
        key: "custom1",
        label: "custom1",
        children: undefined,
        params: {
          hideInHierarchy: true,
        },
      },
      {
        key: "custom2",
        label: "custom2",
        children: undefined,
        params: {
          hideInHierarchy: true,
        },
      },
    ];
    const childNode: HierarchyNode = {
      key: "custom child",
      label: "custom child",
      children: false,
    };
    const getNodes = sinon.fake(() => from([childNode]));
    const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, directNodesCache, true)));
    expect(result).to.deep.eq([childNode]);
  });

  describe("instance nodes", () => {
    it("hides nodes without children", async () => {
      const nodes = [
        {
          ...createTestNode(),
          children: [],
          params: {
            hideInHierarchy: true,
          },
        },
      ];
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), directNodesCache, false)));
      expect(result).to.deep.eq([]);
    });

    it("hides nodes with undetermined children evaluating to empty array", async () => {
      const nodes: HierarchyNode[] = [
        {
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey()],
          },
          label: "test",
          children: undefined,
          params: {
            hideInHierarchy: true,
          },
        },
      ];
      const getNodes = sinon.fake(() => from(new Array<HierarchyNode>()));
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, directNodesCache, false)));
      expect(result).to.deep.eq([]);
    });

    it("hides nodes with undetermined children evaluating to children array", async () => {
      const hiddenNodes: HierarchyNode[] = [
        {
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x1" })],
          },
          label: "hidden",
          children: undefined,
          params: {
            hideInHierarchy: true,
          },
        },
      ];
      const childNodes: HierarchyNode[] = [
        {
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x2" })],
          },
          label: "visible",
          children: false,
        },
      ];
      const getNodes = sinon.fake(() => from(childNodes));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, directNodesCache, false)));
      expect(result).to.deep.eq(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: HierarchyNode[] = [
        {
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x1" })],
          },
          label: "a",
          children: undefined,
          params: {
            hideInHierarchy: true,
          },
        },
        {
          key: {
            type: "instances",
            instanceKeys: [createTestInstanceKey({ id: "0x2" })],
          },
          label: "b",
          children: undefined,
          params: {
            hideInHierarchy: true,
          },
        },
      ];
      const getNodes = sinon.fake(() => from([]));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, directNodesCache, false)));
      expect(getNodes).to.be.calledOnceWithExactly({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        },
        label: "a",
        children: undefined,
        params: {
          hideInHierarchy: true,
        },
      });
      expect(result).to.deep.eq([]);
    });
  });

  describe("class grouping nodes", () => {
    it("hides nodes with determined children", async () => {
      const nodes: HierarchyNode[] = [
        {
          key: {
            type: "class-grouping",
            class: { id: Id64.invalid, name: "TestClass", label: "Test class" },
          },
          label: "Test class",
          params: {
            hideInHierarchy: true,
          },
          children: [
            createTestNode({
              label: "a",
              key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
            }),
            createTestNode({
              label: "b",
              key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
            }),
          ],
        },
      ];
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(sinon.spy(), directNodesCache, false)));
      expect(result).to.deep.eq(nodes[0].children);
    });

    it("hides nodes with undetermined children", async () => {
      const nodes: HierarchyNode[] = [
        {
          key: {
            type: "class-grouping",
            class: { id: Id64.invalid, name: "TestClass", label: "Test class" },
          },
          label: "Test class",
          params: {
            hideInHierarchy: true,
          },
          children: undefined,
        },
      ];
      const childNodes: HierarchyNode[] = [
        createTestNode({
          label: "a",
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
        }),
        createTestNode({
          label: "b",
          key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
        }),
      ];
      const getNodes = sinon.fake(() => from(childNodes));
      const result = await getObservableResult(from(nodes).pipe(createHideNodesInHierarchyOperator(getNodes, directNodesCache, false)));
      expect(result).to.deep.eq(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: HierarchyNode[] = [
        {
          key: {
            type: "class-grouping",
            class: { id: Id64.invalid, name: "TestSchema:X", label: "X" },
          },
          label: "a",
          children: undefined,
          params: {
            hideInHierarchy: true,
          },
        },
        {
          key: {
            type: "class-grouping",
            class: { id: Id64.invalid, name: "TestSchema:X", label: "X" },
          },
          label: "b",
          children: undefined,
          params: {
            hideInHierarchy: true,
          },
        },
      ];
      const getNodes = sinon.fake(() => from([]));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, directNodesCache, false)));
      expect(getNodes).to.be.calledOnceWithExactly({
        key: {
          type: "class-grouping",
          class: { id: Id64.invalid, name: "TestSchema:X", label: "X" },
        },
        label: "a",
        children: undefined,
        params: {
          hideInHierarchy: true,
        },
      });
      expect(result).to.deep.eq([]);
    });
  });

  describe("custom nodes", () => {
    it("hides nodes", async () => {
      const hiddenNodes: HierarchyNode[] = [
        {
          key: "custom",
          label: "hidden",
          children: undefined,
          params: {
            hideInHierarchy: true,
          },
        },
      ];
      const childNodes: HierarchyNode[] = [
        {
          key: "custom",
          label: "visible",
          children: false,
        },
      ];
      const getNodes = sinon.fake(() => from(childNodes));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, directNodesCache, false)));
      expect(result).to.deep.eq(childNodes);
    });

    it("merges similar hidden nodes when requesting children", async () => {
      const hiddenNodes: HierarchyNode[] = [
        {
          key: "custom",
          label: "a",
          children: undefined,
          params: {
            hideInHierarchy: true,
          },
        },
        {
          key: "custom",
          label: "b",
          children: undefined,
          params: {
            hideInHierarchy: true,
          },
        },
      ];
      const getNodes = sinon.fake(() => from([]));
      const result = await getObservableResult(from(hiddenNodes).pipe(createHideNodesInHierarchyOperator(getNodes, directNodesCache, false)));
      expect(getNodes).to.be.calledOnceWithExactly({
        key: "custom",
        label: "a",
        children: undefined,
        params: {
          hideInHierarchy: true,
        },
      });
      expect(result).to.deep.eq([]);
    });
  });
});

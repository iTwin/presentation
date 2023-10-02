/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { from } from "rxjs";
import { Id64, LogLevel } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createLabelGroupingOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/LabelGrouping";
import { createTestNode, getObservableResult, setupLogging } from "../../Utils";

describe("LabelGrouping", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  describe("groupByLabel is false", () => {
    it("doesn't group non-instance nodes", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "custom",
          key: "test",
          children: false,
        },
        {
          label: "custom",
          key: "test2",
          children: false,
        },
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });

    it("doesn't group instance nodes", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:TestClass", id: "0x1" }] },
        }),
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:TestClass", id: "0x2" }] },
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });
  });

  describe("groupByLabel is true", () => {
    it("doesn't group one non-instance node", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "custom",
          key: "test",
          children: false,
          params: { groupByLabel: true },
        },
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });

    it("doesn't group one instance node", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:TestClass", id: "0x1" }] },
          params: { groupByLabel: true },
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });

    it("doesn't group if all nodes have the same label", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "testLabel",
          key: "test1",
          children: false,
          params: { groupByLabel: true },
        },
        {
          label: "testLabel",
          key: "test2",
          children: false,
          params: { groupByLabel: true },
        },
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:TestClass", id: "0x1" }] },
          params: { groupByLabel: true },
          label: "testLabel",
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });

    it("groups if at least two nodes have the same label", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
          label: "1",
          params: { groupByLabel: true },
        }),
        {
          label: "1",
          key: "custom1",
          children: false,
          params: { groupByLabel: true },
        },
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:B", id: "0x2" }] },
          label: "2",
          params: { groupByLabel: true },
        }),
        {
          label: "2",
          key: "custom2",
          children: false,
        },
        {
          label: "3",
          key: "custom3",
          children: false,
          params: { groupByLabel: true },
        },
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq([
        {
          label: "1",
          key: {
            type: "label-grouping",
            labelInfo: { id: Id64.invalid, label: "1" },
          },
          children: [nodes[0], nodes[1]],
        },
        nodes[2],
        nodes[3],
        nodes[4],
      ] as HierarchyNode[]);
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { from } from "rxjs";
import { LogLevel } from "@itwin/core-bentley";
import { GroupingNodeKey, GroupingProcessedHierarchyNode, HierarchyNode, ProcessedHierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createLabelGroupingOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/LabelGrouping";
import { createTestProcessedNode, getObservableResult, setupLogging } from "../../Utils";

describe("LabelGrouping", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  describe("groupByLabel is false", () => {
    it("doesn't group non-instance nodes", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          label: "custom",
          key: "test",
          children: false,
        }),
        createTestProcessedNode({
          label: "custom",
          key: "test2",
          children: false,
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });

    it("doesn't group instance nodes", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:TestClass", id: "0x1" }] },
        }),
        createTestProcessedNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:TestClass", id: "0x2" }] },
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });
  });

  describe("groupByLabel is true", () => {
    it("doesn't group one non-instance node", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          label: "custom",
          key: "test",
          children: false,
          processingParams: { groupByLabel: true },
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });

    it("doesn't group one instance node", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:TestClass", id: "0x1" }] },
          processingParams: { groupByLabel: true },
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });

    it("doesn't group if all nodes have the same label", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          label: "testLabel",
          key: "test1",
          children: false,
          processingParams: { groupByLabel: true },
        }),
        createTestProcessedNode({
          label: "testLabel",
          key: "test2",
          children: false,
          processingParams: { groupByLabel: true },
        }),
        createTestProcessedNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:TestClass", id: "0x1" }] },
          processingParams: { groupByLabel: true },
          label: "testLabel",
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      expect(result).to.deep.eq(nodes);
    });

    it("groups if at least two nodes have the same label and both have groupByLabel set to true", async () => {
      const nodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
          label: "1",
          processingParams: { groupByLabel: true },
        }),
        createTestProcessedNode({
          label: "1",
          key: "custom1",
          children: false,
          processingParams: { groupByLabel: true },
        }),
        createTestProcessedNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:B", id: "0x2" }] },
          label: "2",
          processingParams: { groupByLabel: true },
        }),
        createTestProcessedNode({
          label: "2",
          key: "custom2",
          children: false,
        }),
        createTestProcessedNode({
          label: "3",
          key: "custom3",
          children: false,
          processingParams: { groupByLabel: true },
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createLabelGroupingOperator()));
      const expectedGroupingNodeKey = {
        type: "label-grouping",
        label: "1",
      };
      expect(result).to.deep.eq([
        {
          label: "1",
          key: expectedGroupingNodeKey,
          parentKeys: [],
          children: [
            {
              ...nodes[0],
              parentKeys: [expectedGroupingNodeKey],
            },
            {
              ...nodes[1],
              parentKeys: [expectedGroupingNodeKey],
            },
          ],
        },
        nodes[3],
        nodes[2],
        nodes[4],
      ] as HierarchyNode[]);
    });

    it("groups children of class-grouping nodes", async () => {
      const groupedNodes: ProcessedHierarchyNode[] = [
        createTestProcessedNode({
          key: { type: "instances", instanceKeys: [{ className: "Schema:B", id: "0x2" }] },
          label: "1",
          processingParams: { groupByLabel: true },
        }),
        createTestProcessedNode({
          key: { type: "instances", instanceKeys: [{ className: "Schema:B", id: "0x3" }] },
          label: "1",
          processingParams: { groupByLabel: true },
        }),
        createTestProcessedNode({
          key: { type: "instances", instanceKeys: [{ className: "Schema:B", id: "0x4" }] },
          label: "2",
          processingParams: { groupByLabel: true },
        }),
      ];

      const classGroupingNodeKey: GroupingNodeKey = {
        type: "class-grouping",
        class: { name: "Schema.B", label: "SomeName" },
      };
      const classGroupingNodes = [
        createTestProcessedNode({
          label: "someLabel",
          key: classGroupingNodeKey,
          children: groupedNodes.map((gn) => ({ ...gn, parentKeys: [classGroupingNodeKey] })),
        }) as GroupingProcessedHierarchyNode,
      ];

      const result = await getObservableResult(from(classGroupingNodes).pipe(createLabelGroupingOperator()));
      const expectedLabelGroupingNodeKey = {
        type: "label-grouping",
        label: "1",
      };
      expect(result).to.deep.eq([
        {
          label: "someLabel",
          key: classGroupingNodeKey,
          parentKeys: [],
          children: [
            {
              label: "1",
              key: expectedLabelGroupingNodeKey,
              children: [
                { ...groupedNodes[0], parentKeys: [classGroupingNodeKey, expectedLabelGroupingNodeKey] },
                { ...groupedNodes[1], parentKeys: [classGroupingNodeKey, expectedLabelGroupingNodeKey] },
              ],
              parentKeys: [classGroupingNodeKey],
            },
            { ...groupedNodes[2], parentKeys: [classGroupingNodeKey] },
          ],
        },
      ] as GroupingProcessedHierarchyNode[]);
    });
  });
});

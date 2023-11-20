/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { AutoExpand, GroupingNodeKey, HierarchyNode, InstanceHierarchyNodeProcessingParams } from "../../../../hierarchy-builder/HierarchyNode";
import { GroupingType, ProcessedInstancesGroupingHierarchyNode } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { assignAutoExpand } from "../../../../hierarchy-builder/internal/operators/grouping/AutoExpand";
import { createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../../../Utils";

describe("AutoExpand", () => {
  [
    {
      testName: "Base class grouping",
      testParams: {
        groupingNodeKey: {
          type: "class-grouping",
          class: {
            name: "TestSchema:BaseClass",
            label: "Base Class",
          },
        },
        groupingType: "base-class",
        createGroupedNodeProcessingParams: (autoExpand: AutoExpand | undefined): InstanceHierarchyNodeProcessingParams => {
          return { grouping: { byBaseClasses: { fullClassNames: ["TestSchema:BaseClass"], autoExpand } } };
        },
      },
    },
    {
      testName: "Class grouping",
      testParams: {
        groupingNodeKey: {
          type: "class-grouping",
          class: {
            name: "TestSchema:A",
            label: "A",
          },
        },
        groupingType: "class",
        createGroupedNodeProcessingParams: (autoExpand: AutoExpand | undefined): InstanceHierarchyNodeProcessingParams => {
          return { grouping: { byClass: autoExpand ? { autoExpand } : true } };
        },
      },
    },
    {
      testName: "Properties grouping",
      testParams: {
        groupingNodeKey: {
          type: "property-grouping:other",
          label: "1",
          property: {
            propertyName: "length",
            fullClassName: "TestSchema:BaseClass",
          },
        },
        groupingType: "property",
        createGroupedNodeProcessingParams: (autoExpand: AutoExpand | undefined): InstanceHierarchyNodeProcessingParams => {
          return {
            grouping: { byProperties: { fullClassName: "TestSchema:BaseClass", autoExpand, propertyGroups: [{ propertyName: "length", propertyValue: 1 }] } },
          };
        },
      },
    },
    {
      testName: "Label grouping",
      testParams: {
        groupingNodeKey: {
          type: "label-grouping",
          label: "1",
        },
        groupingType: "label",
        createGroupedNodeProcessingParams: (autoExpand: AutoExpand | undefined): InstanceHierarchyNodeProcessingParams => {
          return { grouping: { byLabel: autoExpand ? { autoExpand } : true } };
        },
      },
    },
  ].forEach(({ testName, testParams }) => {
    describe(testName, () => {
      it("sets autoExpand to true when grouping node has one node child and it has autoExpand set to 'single-child'", async () => {
        const nodes: ProcessedInstancesGroupingHierarchyNode[] = [
          createTestProcessedGroupingNode({
            label: "Test label",
            key: testParams.groupingNodeKey as GroupingNodeKey,
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: testParams.createGroupedNodeProcessingParams("single-child"),
              }),
            ],
          }),
        ];
        const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: testParams.groupingType as GroupingType });
        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].autoExpand).to.eq(true);
      });

      it("sets autoExpand to true when some child nodes have autoExpand set to 'always'", async () => {
        const nodes: ProcessedInstancesGroupingHierarchyNode[] = [
          createTestProcessedGroupingNode({
            label: "Test label",
            key: testParams.groupingNodeKey as GroupingNodeKey,
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: testParams.createGroupedNodeProcessingParams("single-child"),
              }),
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
                label: "1",
                processingParams: testParams.createGroupedNodeProcessingParams("always"),
              }),
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x3" }] },
                label: "1",
                processingParams: testParams.createGroupedNodeProcessingParams("single-child"),
              }),
            ],
          }),
        ];
        const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: testParams.groupingType as GroupingType });
        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].autoExpand).to.eq(true);
      });

      it("doesn't set autoExpand when grouping node has more than one child node and none of them have autoExpand set to 'always'", async () => {
        const nodes: ProcessedInstancesGroupingHierarchyNode[] = [
          createTestProcessedGroupingNode({
            label: "Test label",
            key: testParams.groupingNodeKey as GroupingNodeKey,
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
              }),
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
                label: "1",
                processingParams: testParams.createGroupedNodeProcessingParams("single-child"),
              }),
            ],
          }),
        ];
        const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: testParams.groupingType as GroupingType });
        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].autoExpand).to.eq(undefined);
      });

      it("doesn't set autoExpand when child nodes don't have autoExpand option set", async () => {
        const nodes: ProcessedInstancesGroupingHierarchyNode[] = [
          createTestProcessedGroupingNode({
            label: "Test label",
            key: testParams.groupingNodeKey as GroupingNodeKey,
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: testParams.createGroupedNodeProcessingParams(undefined),
              }),
            ],
          }),
        ];
        const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: testParams.groupingType as GroupingType });
        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].autoExpand).to.eq(undefined);
      });
    });
  });
});

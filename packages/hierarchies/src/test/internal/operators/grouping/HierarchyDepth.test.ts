/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNode, HierarchyNodeAutoExpandProp, InstanceHierarchyNodeProcessingParams, ParentHierarchyNode } from "../../../../hierarchies/HierarchyNode";
import { GroupingNodeKey } from "../../../../hierarchies/HierarchyNodeKey";
import { GroupingType, ProcessedInstancesGroupingHierarchyNode } from "../../../../hierarchies/internal/operators/Grouping";
import { createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../../../Utils";
import { assignHierarchyDepth } from "../../../../hierarchies/internal/operators/grouping/HierarchyDepth";

describe("HierarchyDepth", () => {
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
        createGroupedNodeProcessingParams: (autoExpand: HierarchyNodeAutoExpandProp | undefined): InstanceHierarchyNodeProcessingParams => {
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
        createGroupedNodeProcessingParams: (autoExpand: HierarchyNodeAutoExpandProp | undefined): InstanceHierarchyNodeProcessingParams => {
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
            propertiesClassName: "TestSchema:BaseClass",
          },
        },
        groupingType: "property",
        createGroupedNodeProcessingParams: (autoExpand: HierarchyNodeAutoExpandProp | undefined): InstanceHierarchyNodeProcessingParams => {
          return {
            grouping: {
              byProperties: { propertiesClassName: "TestSchema:BaseClass", autoExpand, propertyGroups: [{ propertyName: "length", propertyValue: 1 }] },
            },
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
        createGroupedNodeProcessingParams: (autoExpand: HierarchyNodeAutoExpandProp | undefined): InstanceHierarchyNodeProcessingParams => {
          return { grouping: { byLabel: autoExpand ? { autoExpand } : true } };
        },
      },
    },
  ].forEach(({ testName, testParams }) => {
    describe(testName, () => {
      it("sets `hierarchyDepth` to 1 when grouping node parent is a non-grouping node", async () => {
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
        const parent = { key: { type: "instances" } } as ParentHierarchyNode;
        const result = assignHierarchyDepth({ grouped: nodes, ungrouped: [], groupingType: testParams.groupingType as GroupingType }, parent);

        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].hierarchyDepth).to.eq(1);
      });

      it("increases `hierarchyDepth` when grouping node parent is a grouping node", async () => {
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
        const groupingNodeParent = { key: { type: "class-grouping" }, hierarchyDepth: 1 } as ParentHierarchyNode;
        const result = assignHierarchyDepth({ grouped: nodes, ungrouped: [], groupingType: testParams.groupingType as GroupingType }, groupingNodeParent);

        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].hierarchyDepth).to.eq(2);
      });
    });
  });
});

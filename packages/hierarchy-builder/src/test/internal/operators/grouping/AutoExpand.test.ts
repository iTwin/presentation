/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNode, HierarchyNodeHandlingParams, HierarchyNodeKey } from "../../../../hierarchy-builder/HierarchyNode";
import { GroupingType } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { assignAutoExpand } from "../../../../hierarchy-builder/internal/operators/grouping/AutoExpand";
import { createTestNode } from "../../../Utils";

describe("AutoExpand", () => {
  [
    {
      testName: "Base class grouping",
      label: "Base Class",
      key: {
        type: "class-grouping",
        class: {
          name: "TestSchema:BaseClass",
          label: "Base Class",
        },
      },
      params: { grouping: { byBaseClasses: { fullClassNames: ["TestSchema:BaseClass"], autoExpand: "single-child" } } },
      groupingType: "base-class",
    },
    {
      testName: "Class grouping",
      label: "A",
      key: {
        type: "class-grouping",
        class: {
          name: "TestSchema:A",
          label: "A",
        },
      },
      params: { grouping: { byClass: { autoExpand: "single-child" } } },
      groupingType: "class",
    },
    {
      testName: "Label grouping",
      label: "1",
      key: {
        type: "label-grouping",
        label: "1",
      },
      params: { grouping: { byLabel: { autoExpand: "single-child" } } },
      groupingType: "label",
    },
  ].forEach(({ testName, label, key, params, groupingType }) => {
    describe("sets autoExpand to true when grouping node has one node child and it has autoExpand set to 'single-child'", () => {
      it(testName, async () => {
        const nodes: HierarchyNode[] = [
          {
            label,
            key: key as HierarchyNodeKey,
            children: [
              createTestNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                params: params as HierarchyNodeHandlingParams,
              }),
            ],
          },
        ];
        const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: groupingType as GroupingType });
        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].autoExpand).to.eq(true);
      });
    });
  });

  [
    {
      testName: "Base class grouping",
      label: "Base Class",
      key: {
        type: "class-grouping",
        class: {
          name: "TestSchema:BaseClass",
          label: "Base Class",
        },
      },
      params: { grouping: { byBaseClasses: { fullClassNames: ["TestSchema:BaseClass"], autoExpand: "always" } } },
      groupingType: "base-class",
    },
    {
      testName: "Class grouping",
      label: "A",
      key: {
        type: "class-grouping",
        class: {
          name: "TestSchema:A",
          label: "A",
        },
      },
      params: { grouping: { byClass: { autoExpand: "always" } } },
      groupingType: "class",
    },
    {
      testName: "Label grouping",
      label: "1",
      key: {
        type: "label-grouping",
        label: "1",
      },
      params: { grouping: { byLabel: { autoExpand: "always" } } },
      groupingType: "label",
    },
  ].forEach(({ testName, label, key, params, groupingType }) => {
    describe("sets autoExpand to true when some child nodes have autoExpand set to 'always'", () => {
      it(testName, async () => {
        const nodes: HierarchyNode[] = [
          {
            label,
            key: key as HierarchyNodeKey,
            children: [
              createTestNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                params: params as HierarchyNodeHandlingParams,
              }),
              createTestNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
                label: "1",
              }),
            ],
          },
        ];
        const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: groupingType as GroupingType });
        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].autoExpand).to.eq(true);
      });
    });
  });

  [
    {
      testName: "Base class grouping",
      label: "Base Class",
      key: {
        type: "class-grouping",
        class: {
          name: "TestSchema:BaseClass",
          label: "Base Class",
        },
      },
      params: { grouping: { byBaseClasses: { fullClassNames: ["TestSchema:BaseClass"], autoExpand: "single-child" } } },
      groupingType: "base-class",
    },
    {
      testName: "Class grouping",
      label: "A",
      key: {
        type: "class-grouping",
        class: {
          name: "TestSchema:A",
          label: "A",
        },
      },
      params: { grouping: { byClass: { autoExpand: "single-child" } } },
      groupingType: "class",
    },
    {
      testName: "Label grouping",
      label: "1",
      key: {
        type: "label-grouping",
        label: "1",
      },
      params: { grouping: { byLabel: { autoExpand: "single-child" } } },
      groupingType: "label",
    },
  ].forEach(({ testName, label, key, params, groupingType }) => {
    describe("doesn't set autoExpand when grouping node has more than one child node and none of them have autoExpand set to 'always'", () => {
      it(testName, async () => {
        const nodes: HierarchyNode[] = [
          {
            label,
            key: key as HierarchyNodeKey,
            children: [
              createTestNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                params: params as HierarchyNodeHandlingParams,
              }),
              createTestNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
                label: "1",
              }),
            ],
          },
        ];
        const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: groupingType as GroupingType });
        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].autoExpand).to.eq(undefined);
      });
    });
  });

  [
    {
      testName: "Base class grouping",
      label: "Base Class",
      key: {
        type: "class-grouping",
        class: {
          name: "TestSchema:BaseClass",
          label: "Base Class",
        },
      },
      groupingType: "base-class",
    },
    {
      testName: "Class grouping",
      label: "A",
      key: {
        type: "class-grouping",
        class: {
          name: "TestSchema:A",
          label: "A",
        },
      },
      groupingType: "class",
    },
    {
      testName: "Label grouping",
      label: "1",
      key: {
        type: "label-grouping",
        label: "1",
      },
      groupingType: "label",
    },
  ].forEach(({ testName, label, key, groupingType }) => {
    describe("doesn't set autoExpand when child nodes don't have autoExpand option set", () => {
      it(testName, async () => {
        const nodes: HierarchyNode[] = [
          {
            label,
            key: key as HierarchyNodeKey,
            children: [
              createTestNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
              }),
            ],
          },
        ];
        const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: groupingType as GroupingType });
        expect(result.ungrouped).to.deep.eq([]);
        expect(HierarchyNode.isGroupingNode(result.grouped[0])).to.eq(true);
        expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
        expect(result.grouped[0].autoExpand).to.eq(undefined);
      });
    });
  });
});

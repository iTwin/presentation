/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNode } from "../../../../hierarchy-builder/HierarchyNode";
import { assignAutoExpand } from "../../../../hierarchy-builder/internal/operators/grouping/AutoExpand";
import { createTestNode } from "../../../Utils";

describe("AutoExpand", () => {
  describe("Base class grouping", () => {
    it("sets autoExpand to true when grouping node has one node child and it has autoExpand set to 'single-child'", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "Base Class",
          key: {
            type: "class-grouping",
            class: {
              name: "TestSchema:BaseClass",
              label: "Base Class",
            },
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
              params: { grouping: { byBaseClasses: { fullClassNames: ["TestSchema:BaseClass"], autoExpand: "single-child" } } },
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "base-class" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isClassGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(true);
    });

    it("sets autoExpand to true when some child nodes have autoExpand set to 'always'", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "Base Class",
          key: {
            type: "class-grouping",
            class: {
              name: "TestSchema:BaseClass",
              label: "Base Class",
            },
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
              params: { grouping: { byBaseClasses: { fullClassNames: ["TestSchema:BaseClass"], autoExpand: "always" } } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "base-class" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isClassGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(true);
    });

    it("doesn't set autoExpand when grouping node has more than one child node and none of them have autoExpand set to 'always'", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "Base Class",
          key: {
            type: "class-grouping",
            class: {
              name: "TestSchema:BaseClass",
              label: "Base Class",
            },
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
              params: { grouping: { byBaseClasses: { fullClassNames: ["TestSchema:BaseClass"], autoExpand: "single-child" } } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "base-class" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isClassGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(undefined);
    });

    it("doesn't set autoExpand when child nodes don't have autoExpand option set", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "Base Class",
          key: {
            type: "class-grouping",
            class: {
              name: "TestSchema:BaseClass",
              label: "Base Class",
            },
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "base-class" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isClassGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(undefined);
    });
  });

  describe("Class grouping", () => {
    it("sets autoExpand to true when grouping node has one node child and it has autoExpand set to 'single-child'", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "A",
          key: {
            type: "class-grouping",
            class: {
              name: "TestSchema:A",
              label: "A",
            },
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
              params: { grouping: { byClass: { autoExpand: "single-child" } } },
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "class" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isClassGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(true);
    });

    it("sets autoExpand to true when some child nodes have autoExpand set to 'always'", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "A",
          key: {
            type: "class-grouping",
            class: {
              name: "TestSchema:A",
              label: "A",
            },
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
              params: { grouping: { byClass: { autoExpand: "always" } } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "class" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isClassGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(true);
    });

    it("doesn't set autoExpand when grouping node has more than one child node and none of them have autoExpand set to 'always'", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "A",
          key: {
            type: "class-grouping",
            class: {
              name: "TestSchema:A",
              label: "A",
            },
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
              params: { grouping: { byClass: { autoExpand: "single-child" } } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
              params: { grouping: { byClass: true } },
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "class" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isClassGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(undefined);
    });

    it("doesn't set autoExpand when child nodes don't have autoExpand option set", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "A",
          key: {
            type: "class-grouping",
            class: {
              name: "TestSchema:A",
              label: "A",
            },
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "class" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isClassGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(undefined);
    });
  });

  describe("Label grouping", () => {
    it("sets autoExpand to true when grouping node has one node child and it has autoExpand set to 'single-child'", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
              params: { grouping: { byLabel: { autoExpand: "single-child" } } },
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isLabelGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(true);
    });

    it("sets autoExpand to true when some child nodes have autoExpand set to 'always'", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
              params: { grouping: { byLabel: { autoExpand: "always" } } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isLabelGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(true);
    });

    it("doesn't set autoExpand when grouping node has more than one child node and none of them have autoExpand set to 'always'", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
              params: { grouping: { byLabel: { autoExpand: "single-child" } } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
              params: { grouping: { byLabel: true } },
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isLabelGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(undefined);
    });

    it("doesn't set autoExpand when child nodes don't have autoExpand option set", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
              label: "1",
            }),
          ],
        },
      ];
      const result = assignAutoExpand({ grouped: nodes, ungrouped: [], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(HierarchyNode.isLabelGroupingNode(result.grouped[0])).to.eq(true);
      expect(result.grouped[0].children).to.deep.eq(nodes[0].children);
      expect(result.grouped[0].autoExpand).to.eq(undefined);
    });
  });
});

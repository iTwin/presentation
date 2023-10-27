/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNode } from "../../../../hierarchy-builder/HierarchyNode";
import { applyGroupHidingParams } from "../../../../hierarchy-builder/internal/operators/grouping/GroupHiding";
import { createTestNode } from "../../../Utils";

describe("GroupHiding", () => {
  describe("hideIfNoSiblings", () => {
    it("hides if no siblings are in the hierarchy", async () => {
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
              params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
            }),
          ],
        },
      ];
      const result = applyGroupHidingParams({ grouped: nodes, ungrouped: [], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq(nodes[0].children);
      expect(result.grouped).to.deep.eq([]);
    });

    it("hides if no siblings are in the tree and some of grouped nodes have hideIfNoSiblings set to true", async () => {
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
              params: { grouping: { byLabel: true } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
              params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
            }),
          ],
        },
      ];
      const result = applyGroupHidingParams({ grouped: nodes, ungrouped: [], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq(nodes[0].children);
      expect(result.grouped).to.deep.eq([]);
    });

    it("doesn't hide if grouping node has grouping siblings", async () => {
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
              params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
            }),
          ],
        },
        {
          label: "2",
          key: {
            type: "label-grouping",
            label: "2",
          },
          children: [
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "2",
              params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
            }),
          ],
        },
      ];
      const result = applyGroupHidingParams({ grouped: nodes, ungrouped: [], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(result.grouped).to.deep.eq(nodes);
    });

    it("doesn't hide if grouping node has ungrouped siblings", async () => {
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
              params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
            }),
          ],
        },
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
          label: "2",
        }),
      ];
      const result = applyGroupHidingParams({ grouped: [nodes[0]], ungrouped: [nodes[1]], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq([nodes[1]]);
      expect(result.grouped).to.deep.eq([nodes[0]]);
    });
  });

  describe("hideIfOneGroupedNode", () => {
    it("hides if group has one child node", async () => {
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
              params: { grouping: { byClass: { hideIfOneGroupedNode: true } } },
            }),
          ],
        },
      ];
      const result = applyGroupHidingParams({ grouped: nodes, ungrouped: [], groupingType: "class" });
      expect(result.ungrouped).to.deep.eq(nodes[0].children);
      expect(result.grouped).to.deep.eq([]);
    });

    it("doesn't hide if group has multiple children", async () => {
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
              params: { grouping: { byLabel: { hideIfOneGroupedNode: true } } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
              params: { grouping: { byLabel: { hideIfOneGroupedNode: true } } },
            }),
          ],
        },
      ];
      const result = applyGroupHidingParams({ grouped: nodes, ungrouped: [], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(result.grouped).to.deep.eq(nodes);
    });
  });

  describe("hideIfOneGroupedNode and hideIfNoSiblings", () => {
    it("doesn't hide if there are no grouped nodes", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
          label: "1",
          params: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
        }),
      ];
      const result = applyGroupHidingParams({ grouped: [], ungrouped: nodes, groupingType: "label" });
      expect(result.ungrouped).to.deep.eq(nodes);
      expect(result.grouped).to.deep.eq([]);
    });

    it("doesn't hide if groupingType does not match grouped node", async () => {
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
              params: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
            }),
          ],
        },
      ];
      const result = applyGroupHidingParams({ grouped: nodes, ungrouped: [], groupingType: "base-class" });
      expect(result.ungrouped).to.deep.eq([]);
      expect(result.grouped).to.deep.eq(nodes);

      const result2 = applyGroupHidingParams({ grouped: nodes, ungrouped: [], groupingType: "class" });
      expect(result2.ungrouped).to.deep.eq([]);
      expect(result2.grouped).to.deep.eq(nodes);
    });

    it("doesn't hide if group has siblings and group has more than one node", async () => {
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
              params: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
              params: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
            }),
          ],
        },
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x3" }] },
          label: "2",
        }),
      ];
      const result = applyGroupHidingParams({ grouped: [nodes[0]], ungrouped: [nodes[1]], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq([nodes[1]]);
      expect(result.grouped).to.deep.eq([nodes[0]]);
    });

    it("hides if no siblings are in the hierarchy", async () => {
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
              params: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
            }),
            createTestNode({
              key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
              label: "1",
              params: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
            }),
          ],
        },
      ];
      const result = applyGroupHidingParams({ grouped: nodes, ungrouped: [], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq(nodes[0].children);
      expect(result.grouped).to.deep.eq([]);
    });

    it("hides if group has one child node", async () => {
      const childNode = createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
        params: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
      });
      const nodes: HierarchyNode[] = [
        {
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          children: [childNode],
        },
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
          label: "1",
          params: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
        }),
      ];
      const result = applyGroupHidingParams({ grouped: [nodes[0]], ungrouped: [nodes[1]], groupingType: "label" });
      expect(result.ungrouped).to.deep.eq([nodes[1], childNode]);
      expect(result.grouped).to.deep.eq([]);
    });
  });
});

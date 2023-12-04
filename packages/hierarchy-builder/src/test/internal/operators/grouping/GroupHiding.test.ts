/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GroupingHandlerResult } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { applyGroupHidingParams } from "../../../../hierarchy-builder/internal/operators/grouping/GroupHiding";
import { createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../../../Utils";

describe("GroupHiding", () => {
  describe("hideIfNoSiblings", () => {
    it("hides if no siblings are in the hierarchy", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [],
        groupingType: "label",
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq({
        groupingType: "label",
        grouped: [],
        ungrouped: nodes.grouped[0].children,
      });
    });

    it("hides if no siblings are in the tree and some of grouped nodes have hideIfNoSiblings set to true", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byLabel: true } },
              }),
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [],
        groupingType: "label",
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq({
        groupingType: "label",
        grouped: [],
        ungrouped: nodes.grouped[0].children,
      });
    });

    it("doesn't hide if grouping node has grouping siblings", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true } } },
              }),
            ],
          }),
          createTestProcessedGroupingNode({
            label: "2",
            key: {
              type: "label-grouping",
              label: "2",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
                label: "2",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [],
        groupingType: "label",
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq(nodes);
    });

    it("doesn't hide if grouping node has ungrouped siblings", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
            label: "2",
          }),
        ],
        groupingType: "label",
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq(nodes);
    });

    it("doesn't hide if grouping node has extra siblings", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [],
        groupingType: "label",
      };
      expect(applyGroupHidingParams(nodes, 1)).to.deep.eq(nodes);
    });
  });

  describe("hideIfOneGroupedNode", () => {
    it("hides if group has one child node", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "A",
            key: {
              type: "class-grouping",
              class: {
                name: "TestSchema:A",
                label: "A",
              },
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byClass: { hideIfOneGroupedNode: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [],
        groupingType: "class",
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq({
        groupingType: "class",
        grouped: [],
        ungrouped: nodes.grouped[0].children,
      });
    });

    it("doesn't hide if group has multiple children", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfOneGroupedNode: true } } },
              }),
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfOneGroupedNode: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [],
        groupingType: "label",
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq(nodes);
    });
  });

  describe("hideIfOneGroupedNode and hideIfNoSiblings", () => {
    it("doesn't hide if grouped nodes don't have processing params", async () => {
      const nodes: GroupingHandlerResult = {
        groupingType: "label",
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
              }),
            ],
          }),
        ],
        ungrouped: [],
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq(nodes);
    });

    it("doesn't hide if there are no grouped nodes", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [],
        ungrouped: [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
            label: "1",
            processingParams: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
          }),
        ],
        groupingType: "label",
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq(nodes);
    });

    it("doesn't hide if groupingType does not match grouped node", async () => {
      const nodes = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [],
      };

      const baseClassParams: GroupingHandlerResult = { ...nodes, groupingType: "base-class" };
      expect(applyGroupHidingParams(baseClassParams, 0)).to.deep.eq(baseClassParams);

      const propertyParams: GroupingHandlerResult = { ...nodes, groupingType: "property" };
      expect(applyGroupHidingParams(propertyParams, 0)).to.deep.eq(propertyParams);

      const classParams: GroupingHandlerResult = { ...nodes, groupingType: "class" };
      expect(applyGroupHidingParams(classParams, 0)).to.deep.eq(classParams);
    });

    it("doesn't hide if group has siblings and group has more than one node", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
              }),
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x3" }] },
            label: "2",
          }),
        ],
        groupingType: "label",
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq(nodes);
    });

    it("hides if no siblings are in the hierarchy", async () => {
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
              }),
              createTestProcessedInstanceNode({
                key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
                label: "1",
                processingParams: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
              }),
            ],
          }),
        ],
        ungrouped: [],
        groupingType: "label",
      };
      expect(applyGroupHidingParams(nodes, 0)).to.deep.eq({
        groupingType: "label",
        grouped: [],
        ungrouped: nodes.grouped[0].children,
      });
    });

    it("hides if group has one child node", async () => {
      const childNode = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
        processingParams: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
      });
      const nodes: GroupingHandlerResult = {
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [childNode],
          }),
        ],
        ungrouped: [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
            label: "1",
            processingParams: { grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } } },
          }),
        ],
        groupingType: "label",
      };
      const res = applyGroupHidingParams(nodes, 0);
      expect(res).to.deep.eq({
        groupingType: "label",
        grouped: [],
        ungrouped: [...nodes.ungrouped, childNode],
      });
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GroupingNodeKey } from "../../../../hierarchy-builder/HierarchyNode";
import { GroupingHandlerResult } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { createLabelGroups } from "../../../../hierarchy-builder/internal/operators/grouping/LabelGrouping";
import { createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../../../Utils";

describe("LabelGrouping", () => {
  it("groups one node", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: ["x"],
        label: "1",
        processingParams: { grouping: { byLabel: true } },
      }),
    ];
    const expectedGroupingNodeKey: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey,
          parentKeys: ["x"],
          children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
        }),
      ],
      ungrouped: [],
    } as GroupingHandlerResult);
  });

  it("groups multiple nodes", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: ["x"],
        label: "1",
        processingParams: { grouping: { byLabel: true } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
        parentKeys: ["x"],
        label: "1",
        processingParams: { grouping: { byLabel: true } },
      }),
    ];
    const expectedGroupingNodeKey: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey,
          parentKeys: ["x"],
          children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
        }),
      ],
      ungrouped: [],
    });
  });

  it("creates different groups for differently labeled nodes", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: ["x"],
        label: "1",
        processingParams: { grouping: { byLabel: true } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
        parentKeys: ["x"],
        label: "2",
        processingParams: { grouping: { byLabel: true } },
      }),
    ];
    const expectedGroupingNodeKey1: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
    };
    const expectedGroupingNodeKey2: GroupingNodeKey = {
      type: "label-grouping",
      label: "2",
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey1,
          parentKeys: ["x"],
          children: [nodes[0]].map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey1] })),
        }),
        createTestProcessedGroupingNode({
          label: "2",
          key: expectedGroupingNodeKey2,
          parentKeys: ["x"],
          children: [nodes[1]].map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey2] })),
        }),
      ],
      ungrouped: [],
    } as GroupingHandlerResult);
  });

  it("doesn't group nodes with byLabel set to false", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
      }),
    ];
    const result = await createLabelGroups(nodes);
    expect(result.ungrouped).to.deep.eq(nodes);
    expect(result.grouped).to.deep.eq([]);
  });
});

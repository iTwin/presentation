/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GroupingNodeKey } from "../../../../hierarchies/HierarchyNodeKey";
import { GroupingHandlerResult } from "../../../../hierarchies/imodel/operators/Grouping";
import { createLabelGroups } from "../../../../hierarchies/imodel/operators/grouping/LabelGrouping";
import { createTestGenericNodeKey, createTestInstanceKey, createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../../../Utils";

describe("LabelGrouping", () => {
  it("groups one node", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: true } },
      }),
    ];
    const expectedGroupingNodeKey: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
      groupId: undefined,
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
          children: nodes.map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey] })),
        }),
      ],
      ungrouped: [],
    } as GroupingHandlerResult);
  });

  it("groups one node when 'action' is set to 'group'", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: { action: "group" } } },
      }),
    ];
    const expectedGroupingNodeKey: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
      groupId: undefined,
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
          children: nodes.map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey] })),
        }),
      ],
      ungrouped: [],
    } as GroupingHandlerResult);
  });

  it("groups one node when 'byLabel' is set to empty object", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: {} } },
      }),
    ];
    const expectedGroupingNodeKey: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
      groupId: undefined,
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
          children: nodes.map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey] })),
        }),
      ],
      ungrouped: [],
    } as GroupingHandlerResult);
  });

  it("creates separate groups for nodes with same labels and different groupIds", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: { groupId: "groupId1" } } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: { groupId: "groupId2" } } },
      }),
    ];
    const expectedGroupingNodeKey1: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
      groupId: "groupId1",
    };
    const expectedGroupingNodeKey2: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
      groupId: "groupId2",
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey1,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes[0].key.instanceKeys,
          children: [{ ...nodes[0], parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey1] }],
        }),
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey2,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes[1].key.instanceKeys,
          children: [{ ...nodes[1], parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey2] }],
        }),
      ],
      ungrouped: [],
    });
  });

  it("groups multiple nodes with same groupIds and labels", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: { groupId: "groupId1" } } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: { groupId: "groupId1" } } },
      }),
    ];
    const expectedGroupingNodeKey: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
      groupId: "groupId1",
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
          children: nodes.map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey] })),
        }),
      ],
      ungrouped: [],
    });
  });

  it("groups multiple nodes", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: true } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: true } },
      }),
    ];
    const expectedGroupingNodeKey: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
      groupId: undefined,
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
          children: nodes.map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey] })),
        }),
      ],
      ungrouped: [],
    });
  });

  it("creates different groups for differently labeled nodes", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byLabel: true } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "2",
        processingParams: { grouping: { byLabel: true } },
      }),
    ];
    const expectedGroupingNodeKey1: GroupingNodeKey = {
      type: "label-grouping",
      label: "1",
      groupId: undefined,
    };
    const expectedGroupingNodeKey2: GroupingNodeKey = {
      type: "label-grouping",
      label: "2",
      groupId: undefined,
    };
    expect(await createLabelGroups(nodes)).to.deep.eq({
      groupingType: "label",
      grouped: [
        createTestProcessedGroupingNode({
          label: "1",
          key: expectedGroupingNodeKey1,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes[0].key.instanceKeys,
          children: [nodes[0]].map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey1] })),
        }),
        createTestProcessedGroupingNode({
          label: "2",
          key: expectedGroupingNodeKey2,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes[1].key.instanceKeys,
          children: [nodes[1]].map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey2] })),
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

  it("doesn't merge nodes that don't have `mergeId` set", async () => {
    const nodes = [
      createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] } }),
      createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] } }),
    ];
    const result = await createLabelGroups(nodes);
    expect(result.ungrouped).to.deep.eq(nodes);
    expect(result.grouped).to.deep.eq([]);
  });

  it("doesn't merge nodes that have different `groupId`", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
        processingParams: { grouping: { byLabel: { action: "merge", groupId: "a" } } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
        processingParams: { grouping: { byLabel: { action: "merge", groupId: "b" } } },
      }),
    ];
    const result = await createLabelGroups(nodes);
    expect(result.ungrouped).to.deep.eq([
      { ...nodes[0], processingParams: { grouping: { byLabel: { action: "merge", groupId: "a" } } } },
      { ...nodes[1], processingParams: { grouping: { byLabel: { action: "merge", groupId: "b" } } } },
    ]);
    expect(result.grouped).to.deep.eq([]);
  });

  it("doesn't merge nodes that have different labels", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
        label: "a",
        processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
        label: "b",
        processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } },
      }),
    ];
    const result = await createLabelGroups(nodes);
    expect(result.ungrouped).to.deep.eq([
      { ...nodes[0], processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } } },
      { ...nodes[1], processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } } },
    ]);
    expect(result.grouped).to.deep.eq([]);
  });

  it("merges nodes that have `grouping.byLabel.action` set to `merge` and that have the same `groupId` and label", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x1" })] },
        label: "a",
        processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x2" })] },
        label: "b",
        processingParams: { grouping: { byLabel: { action: "merge", groupId: "y" } } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x3" })] },
        label: "a",
        processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [createTestInstanceKey({ id: "0x4" })] },
        label: "b",
        processingParams: { grouping: { byLabel: { action: "merge", groupId: "y" } } },
      }),
    ];
    const result = await createLabelGroups(nodes);
    expect(result.ungrouped).to.deep.eq([
      createTestProcessedInstanceNode({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x3" })],
        },
        label: "a",
        processingParams: {
          grouping: { byLabel: { action: "merge", groupId: "x" } },
        },
      }),
      createTestProcessedInstanceNode({
        key: {
          type: "instances",
          instanceKeys: [createTestInstanceKey({ id: "0x2" }), createTestInstanceKey({ id: "0x4" })],
        },
        label: "b",
        processingParams: {
          grouping: { byLabel: { action: "merge", groupId: "y" } },
        },
      }),
    ]);
    expect(result.grouped).to.deep.eq([]);
  });
});

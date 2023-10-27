/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNode } from "../../../../hierarchy-builder/HierarchyNode";
import { createLabelGroups } from "../../../../hierarchy-builder/internal/operators/grouping/LabelGrouping";
import { createTestNode } from "../../../Utils";

describe("LabelGrouping", () => {
  it("groups one node", async () => {
    const nodes: HierarchyNode[] = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
        params: { grouping: { byLabel: true } },
      }),
    ];
    const result = await createLabelGroups(nodes);
    expect(result.ungrouped).to.deep.equal([]);
    expect(result.grouped).to.deep.eq([
      {
        label: "1",
        key: {
          type: "label-grouping",
          label: "1",
        },
        children: nodes,
      },
    ] as HierarchyNode[]);
  });

  it("groups multiple nodes", async () => {
    const nodes: HierarchyNode[] = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
        params: { grouping: { byLabel: true } },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
        label: "1",
        params: { grouping: { byLabel: true } },
      }),
    ];
    const result = await createLabelGroups(nodes);
    expect(result.ungrouped).to.deep.eq([]);
    expect(result.grouped).to.deep.eq([
      {
        label: "1",
        key: {
          type: "label-grouping",
          label: "1",
        },
        children: nodes,
      },
    ] as HierarchyNode[]);
  });

  it("creates different groups for differently labeled nodes", async () => {
    const nodes: HierarchyNode[] = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
        params: { grouping: { byLabel: true } },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
        label: "2",
        params: { grouping: { byLabel: true } },
      }),
    ];
    const result = await createLabelGroups(nodes);
    expect(result.ungrouped).to.deep.eq([]);
    expect(result.grouped).to.deep.eq([
      {
        label: "1",
        key: {
          type: "label-grouping",
          label: "1",
        },
        children: [nodes[0]],
      },
      {
        label: "2",
        key: {
          type: "label-grouping",
          label: "2",
        },
        children: [nodes[1]],
      },
    ] as HierarchyNode[]);
  });

  it("doesn't group nodes with byLabel set to false", async () => {
    const nodes: HierarchyNode[] = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
      }),
    ];
    const result = await createLabelGroups(nodes);
    expect(result.ungrouped).to.deep.eq([nodes[0]]);
    expect(result.grouped).to.deep.eq([]);
  });
});

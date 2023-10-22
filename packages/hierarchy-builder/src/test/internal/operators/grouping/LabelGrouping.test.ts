/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { HierarchyNode } from "../../../../hierarchy-builder/HierarchyNode";
import { createGroupingOperator } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { IMetadataProvider } from "../../../../hierarchy-builder/Metadata";
import { createTestNode, getObservableResult } from "../../../Utils";

describe("LabelGrouping", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;

  it("does not group if no nodes are present", async () => {
    const nodes: HierarchyNode[] = [];
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq([] as HierarchyNode[]);
  });

  it("groups nodes which have byLabel set to true", async () => {
    const nodes: HierarchyNode[] = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
        params: { grouping: { byLabel: true } },
      }),
      {
        label: "1",
        key: "custom1",
        children: false,
        params: { grouping: { byLabel: true } },
      },
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:B", id: "0x2" }] },
        label: "2",
        params: { grouping: { byLabel: true } },
      }),
      {
        label: "2",
        key: "custom2",
        children: false,
      },
      {
        label: "3",
        key: "custom3",
        children: false,
        params: { grouping: { byLabel: true } },
      },
    ];
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq([
      {
        label: "1",
        key: {
          type: "label-grouping",
          label: "1",
        },
        children: [nodes[0], nodes[1]],
      },
      nodes[3],
      {
        label: "2",
        key: {
          type: "label-grouping",
          label: "2",
        },
        children: [nodes[2]],
      },
      {
        label: "3",
        key: {
          type: "label-grouping",
          label: "3",
        },
        children: [nodes[4]],
      },
    ] as HierarchyNode[]);
  });
});

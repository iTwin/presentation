/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { HierarchyNode } from "../../../../hierarchy-builder/HierarchyNode";
import { createGroupingOperator } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { IMetadataProvider } from "../../../../hierarchy-builder/Metadata";
import { createGroupingHandlers, createTestNode, getObservableResult } from "../../../Utils";

describe("GroupHiding", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  describe("hideIfNoSiblings", () => {
    it("hides if no siblings are in the tree", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
          label: "1",
          params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
        }),
        {
          label: "1",
          key: "custom1",
          children: false,
          params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
        },
      ];
      const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider, createGroupingHandlers)));
      expect(result).to.deep.eq(nodes);
    });

    it("hides if no siblings are in the tree and at least one grouping node children has hideIfNoSiblings set to true", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
          label: "1",
          params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
        }),
        {
          label: "1",
          key: "custom1",
          children: false,
          params: { grouping: { byLabel: true } },
        },
        {
          label: "1",
          key: "custom2",
          children: false,
          params: { grouping: { byLabel: true } },
        },
      ];
      const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider, createGroupingHandlers)));
      expect(result).to.deep.eq(nodes);
    });

    it("does not hide if node has siblings", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
          label: "1",
          params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
        }),
        {
          label: "1",
          key: "custom1",
          children: false,
          params: { grouping: { byLabel: { hideIfNoSiblings: true } } },
        },
        {
          label: "2",
          key: "custom2",
          children: false,
          params: { grouping: { byLabel: true } },
        },
      ];
      const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider, createGroupingHandlers)));
      expect(result).to.deep.eq([
        {
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          children: [nodes[0], nodes[1]],
        },
        {
          label: "2",
          key: {
            type: "label-grouping",
            label: "2",
          },
          children: [nodes[2]],
        },
      ] as HierarchyNode[]);
    });
  });
  describe("hideIfOneGroupedNode", () => {
    it("hides if group has one child node", async () => {
      const nodes: HierarchyNode[] = [
        {
          label: "1",
          key: "custom1",
          children: false,
        },
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
          label: "1",
          params: { grouping: { byLabel: { hideIfOneGroupedNode: true } } },
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider, createGroupingHandlers)));
      expect(result).to.deep.eq(nodes);
    });

    it("does not hide if group has multiple children", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
          label: "1",
          params: { grouping: { byLabel: { hideIfOneGroupedNode: true } } },
        }),
        {
          label: "1",
          key: "custom1",
          children: false,
          params: { grouping: { byLabel: true } },
        },
        {
          label: "2",
          key: "custom2",
          children: false,
          params: { grouping: { byLabel: true } },
        },
      ];
      const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider, createGroupingHandlers)));
      expect(result).to.deep.eq([
        {
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          children: [nodes[0], nodes[1]],
        },
        {
          label: "2",
          key: {
            type: "label-grouping",
            label: "2",
          },
          children: [nodes[2]],
        },
      ] as HierarchyNode[]);
    });
  });
});

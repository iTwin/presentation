/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { HierarchyNode } from "../../../../hierarchy-builder/HierarchyNode";
import { createGroupingOperator } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { IMetadataProvider } from "../../../../hierarchy-builder/Metadata";
import { createGetClassStub, createGroupingHandlers, createTestNode, getObservableResult, isMock, TStubClassFunc } from "../../../Utils";

describe("GroupHiding", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  describe("hideIfNoSiblings", () => {
    it("hides if no siblings are in the hierarchy", async () => {
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

  describe("hideIfOneGroupedNode and hideIfNoSiblings", () => {
    let stubClass: TStubClassFunc;
    beforeEach(() => {
      stubClass = createGetClassStub(metadataProvider).stubClass;
    });

    it("hides if no siblings are in the hierarchy", async () => {
      const nodes: HierarchyNode[] = [
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
      ];
      const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider, createGroupingHandlers)));
      expect(result).to.deep.eq(nodes);
    });

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
          params: { grouping: { byLabel: { hideIfOneGroupedNode: true, hideIfNoSiblings: true } } },
        }),
      ];
      const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider, createGroupingHandlers)));
      expect(result).to.deep.eq(nodes);
    });

    it("hides only some groups", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
          label: "1",
          params: {
            grouping: {
              byClass: { hideIfOneGroupedNode: true, hideIfNoSiblings: true },
              byLabel: { hideIfOneGroupedNode: true, hideIfNoSiblings: true },
              byBaseClasses: {
                hideIfNoSiblings: true,
                hideIfOneGroupedNode: true,
                baseClassInfo: [
                  {
                    schemaName: "TestSchema",
                    className: "TestParentClassA",
                  },
                  {
                    schemaName: "TestSchema",
                    className: "TestParentClassAA",
                  },
                ],
              },
            },
          },
        }),
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
          label: "1",
          params: {
            grouping: {
              byClass: { hideIfOneGroupedNode: true, hideIfNoSiblings: true },
              byLabel: { hideIfOneGroupedNode: true, hideIfNoSiblings: true },
              byBaseClasses: {
                hideIfNoSiblings: true,
                hideIfOneGroupedNode: true,
                baseClassInfo: [
                  {
                    schemaName: "TestSchema",
                    className: "TestParentClassA",
                  },
                  {
                    schemaName: "TestSchema",
                    className: "TestParentClassAA",
                  },
                ],
              },
            },
          },
        }),
        {
          label: "1",
          key: "custom1",
          children: false,
          params: { grouping: { byLabel: { hideIfOneGroupedNode: true, hideIfNoSiblings: true } } },
        },
        {
          label: "2",
          key: "custom2",
          children: false,
          params: { grouping: { byLabel: { hideIfOneGroupedNode: true, hideIfNoSiblings: true } } },
        },
      ];
      stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", is: isMock });
      const parentClassA = stubClass({
        schemaName: "TestSchema",
        className: "TestParentClassA",
        classLabel: "TestSchema.TestParentClassA",
        isEntityClass: () => true,
        isRelationshipClass: () => true,
      });
      stubClass({
        schemaName: "TestSchema",
        className: "TestParentClassAA",
        classLabel: "TestSchema.TestParentClassAA",
        isEntityClass: () => true,
        isRelationshipClass: () => true,
        is: isMock,
      });

      const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider, createGroupingHandlers)));
      expect(result).to.deep.eq([
        nodes[2],
        nodes[3],
        {
          label: "TestSchema.TestParentClassA",
          key: {
            type: "class-grouping",
            class: parentClassA,
          },
          children: [nodes[0], nodes[1]],
        },
      ] as HierarchyNode[]);
    });
  });
});

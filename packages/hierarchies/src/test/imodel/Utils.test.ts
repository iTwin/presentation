/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import type { InstanceHierarchyNodeProcessingParams } from "../../hierarchies/imodel/IModelHierarchyNode.js";
import { mergeInstanceNodes } from "../../hierarchies/imodel/Utils.js";
import { createTestGenericNodeKey, createTestProcessedInstanceNode } from "../Utils.js";

describe("mergeInstanceNodes", () => {
  it("takes lhs label", () => {
    const lhs = createTestProcessedInstanceNode({
      label: "custom1",
    });
    const rhs = createTestProcessedInstanceNode({
      label: "custom2",
    });
    expect(mergeInstanceNodes(lhs, rhs).label).to.eq("custom1");
  });

  it("merges auto-expand flag", () => {
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ autoExpand: undefined }), createTestProcessedInstanceNode({ autoExpand: undefined })).autoExpand,
    ).to.be.undefined;
    expect(mergeInstanceNodes(createTestProcessedInstanceNode({ autoExpand: false }), createTestProcessedInstanceNode({ autoExpand: false })).autoExpand).to.be
      .undefined;
    expect(mergeInstanceNodes(createTestProcessedInstanceNode({ autoExpand: false }), createTestProcessedInstanceNode({ autoExpand: true })).autoExpand).to.be
      .true;
    expect(mergeInstanceNodes(createTestProcessedInstanceNode({ autoExpand: true }), createTestProcessedInstanceNode({ autoExpand: true })).autoExpand).to.be
      .true;
    expect(mergeInstanceNodes(createTestProcessedInstanceNode({ autoExpand: true }), createTestProcessedInstanceNode({ autoExpand: false })).autoExpand).to.be
      .true;
    expect(mergeInstanceNodes(createTestProcessedInstanceNode({ autoExpand: true }), createTestProcessedInstanceNode({ autoExpand: undefined })).autoExpand).to
      .be.true;
  });

  it("merges supports-filtering flag", () => {
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ supportsFiltering: undefined }), createTestProcessedInstanceNode({ supportsFiltering: undefined }))
        .supportsFiltering,
    ).to.be.undefined;
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ supportsFiltering: false }), createTestProcessedInstanceNode({ supportsFiltering: false }))
        .supportsFiltering,
    ).to.be.undefined;
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ supportsFiltering: false }), createTestProcessedInstanceNode({ supportsFiltering: true }))
        .supportsFiltering,
    ).to.be.undefined;
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ supportsFiltering: true }), createTestProcessedInstanceNode({ supportsFiltering: true }))
        .supportsFiltering,
    ).to.be.true;
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ supportsFiltering: true }), createTestProcessedInstanceNode({ supportsFiltering: false }))
        .supportsFiltering,
    ).to.be.undefined;
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ supportsFiltering: true }), createTestProcessedInstanceNode({ supportsFiltering: undefined }))
        .supportsFiltering,
    ).to.be.undefined;
  });

  it("merges extended data", () => {
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ extendedData: undefined }), createTestProcessedInstanceNode({ extendedData: undefined }))
        .extendedData,
    ).to.be.undefined;
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ extendedData: undefined }), createTestProcessedInstanceNode({ extendedData: { x: 123 } }))
        .extendedData,
    ).to.deep.eq({ x: 123 });
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ extendedData: { x: 123 } }), createTestProcessedInstanceNode({ extendedData: { y: 456 } }))
        .extendedData,
    ).to.deep.eq({ x: 123, y: 456 });
    expect(
      mergeInstanceNodes(createTestProcessedInstanceNode({ extendedData: { x: 123 } }), createTestProcessedInstanceNode({ extendedData: { x: 456 } }))
        .extendedData,
    ).to.deep.eq({ x: 456 });
  });

  it("merges instance node keys", () => {
    const lhs = createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x1" }] } });
    const rhs = createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ className: "c.d", id: "0x2" }] } });
    expect(mergeInstanceNodes(lhs, rhs).key).to.deep.eq({
      type: "instances",
      instanceKeys: [
        { className: "a.b", id: "0x1" },
        { className: "c.d", id: "0x2" },
      ],
    });
  });

  describe("merging parent node keys", () => {
    it("takes from lhs when rhs starts with lhs", () => {
      const lhsParentKeys = [createTestGenericNodeKey({ id: "1" })];
      const rhsParentKeys = [createTestGenericNodeKey({ id: "1" }), createTestGenericNodeKey({ id: "2" })];
      expect(
        mergeInstanceNodes(createTestProcessedInstanceNode({ parentKeys: lhsParentKeys }), createTestProcessedInstanceNode({ parentKeys: rhsParentKeys }))
          .parentKeys,
      ).to.deep.eq([createTestGenericNodeKey({ id: "1" })]);
    });

    it("takes from rhs when lhs starts with rhs", () => {
      const lhsParentKeys = [createTestGenericNodeKey({ id: "1" }), createTestGenericNodeKey({ id: "2" })];
      const rhsParentKeys = [createTestGenericNodeKey({ id: "1" })];
      expect(
        mergeInstanceNodes(createTestProcessedInstanceNode({ parentKeys: lhsParentKeys }), createTestProcessedInstanceNode({ parentKeys: rhsParentKeys }))
          .parentKeys,
      ).to.deep.eq([createTestGenericNodeKey({ id: "1" })]);
    });

    it("takes common part from the two lists", () => {
      const lhsParentKeys = [createTestGenericNodeKey({ id: "1" }), createTestGenericNodeKey({ id: "2" })];
      const rhsParentKeys = [createTestGenericNodeKey({ id: "1" }), createTestGenericNodeKey({ id: "3" })];
      expect(
        mergeInstanceNodes(createTestProcessedInstanceNode({ parentKeys: lhsParentKeys }), createTestProcessedInstanceNode({ parentKeys: rhsParentKeys }))
          .parentKeys,
      ).to.deep.eq([createTestGenericNodeKey({ id: "1" })]);
    });
  });

  describe("merging processing params", () => {
    it("returns `undefined` if neither node has processing params", () => {
      expect(
        mergeInstanceNodes(createTestProcessedInstanceNode({ processingParams: undefined }), createTestProcessedInstanceNode({ processingParams: undefined }))
          .processingParams,
      ).to.be.undefined;
    });

    it("merges hide if no children flag", () => testProcessingParamsFlagMerging("hideIfNoChildren"));

    it("merges hide in hierarchy flag", () => testProcessingParamsFlagMerging("hideInHierarchy"));

    function traverseOptionalBooleanMergeExpectations(cb: (lhsValue: boolean | undefined, rhsValue: boolean | undefined, expect: boolean | undefined) => void) {
      cb(undefined, undefined, undefined);
      cb(undefined, false, undefined);
      cb(undefined, true, true);
      cb(false, undefined, undefined);
      cb(false, false, undefined);
      cb(false, true, true);
      cb(true, undefined, true);
      cb(true, false, true);
      cb(true, true, true);
    }

    function testProcessingParamsFlagMerging(flag: keyof InstanceHierarchyNodeProcessingParams) {
      traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
        const mergedParams = mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { [flag]: lhs } }),
          createTestProcessedInstanceNode({ processingParams: { [flag]: rhs } }),
        ).processingParams;
        const actualValue = mergedParams ? mergedParams[flag] : undefined;
        expect(actualValue).to.eq(expectedMergedValue);
      });
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { [flag]: undefined } }),
          createTestProcessedInstanceNode({ processingParams: undefined }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { [flag]: false } }),
          createTestProcessedInstanceNode({ processingParams: undefined }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { [flag]: true } }),
          createTestProcessedInstanceNode({ processingParams: undefined }),
        ).processingParams![flag],
      ).to.be.true;
    }

    it("merges 'byLabel' params only when they match", () => {
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { action: "merge", groupId: "y" } } } }),
          createTestProcessedInstanceNode({ processingParams: undefined }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { action: "merge", groupId: "y" } } } }),
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } } }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } } }),
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { action: "group", groupId: "x" } } } }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { groupId: "x" } } } }),
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { groupId: "x" } } } }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: {} } } }),
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: {} } } }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: undefined }),
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } } }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeInstanceNodes(
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } } }),
          createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { action: "merge", groupId: "x" } } } }),
        ).processingParams,
      ).to.deep.eq({ grouping: { byLabel: { action: "merge", groupId: "x" } } });
    });

    describe("merging grouping params", () => {
      it("returns `undefined` if neither processing params have grouping params", () => {
        expect(
          mergeInstanceNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: undefined } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: undefined } }),
          ).processingParams?.grouping,
        ).to.be.undefined;
      });
    });
  });

  describe("merging children", () => {
    it("returns `true` if at least one node has `true`", () => {
      expect(mergeInstanceNodes(createTestProcessedInstanceNode({ children: true }), createTestProcessedInstanceNode({ children: true })).children).to.be.true;
      expect(mergeInstanceNodes(createTestProcessedInstanceNode({ children: true }), createTestProcessedInstanceNode({ children: false })).children).to.be.true;
      expect(mergeInstanceNodes(createTestProcessedInstanceNode({ children: false }), createTestProcessedInstanceNode({ children: true })).children).to.be.true;
      expect(mergeInstanceNodes(createTestProcessedInstanceNode({ children: true }), createTestProcessedInstanceNode({ children: undefined })).children).to.be
        .true;
      expect(mergeInstanceNodes(createTestProcessedInstanceNode({ children: undefined }), createTestProcessedInstanceNode({ children: true })).children).to.be
        .true;
    });

    it("returns `false` if both nodes have `false`", () => {
      expect(mergeInstanceNodes(createTestProcessedInstanceNode({ children: false }), createTestProcessedInstanceNode({ children: false })).children).to.be
        .false;
    });

    it("returns `undefined` if neither node has truthy value", () => {
      expect(mergeInstanceNodes(createTestProcessedInstanceNode({ children: undefined }), createTestProcessedInstanceNode({ children: undefined })).children).to
        .be.undefined;
      expect(mergeInstanceNodes(createTestProcessedInstanceNode({ children: false }), createTestProcessedInstanceNode({ children: undefined })).children).to.be
        .undefined;
      expect(mergeInstanceNodes(createTestProcessedInstanceNode({ children: undefined }), createTestProcessedInstanceNode({ children: false })).children).to.be
        .undefined;
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { HierarchyNodeAutoExpandProp, HierarchyNodeGroupingParamsBase, InstanceHierarchyNodeProcessingParams } from "../../hierarchy-builder/HierarchyNode";
import { getClass, hasChildren, mergeNodes } from "../../hierarchy-builder/internal/Common";
import { createTestProcessedCustomNode, createTestProcessedInstanceNode } from "../Utils";

describe("getClass", () => {
  const metadata = {
    getSchema: sinon.stub(),
  };

  beforeEach(() => {
    metadata.getSchema.reset();
  });

  it("throws when schema does not exist", async () => {
    metadata.getSchema.resolves(undefined);
    await expect(getClass(metadata, "x.y")).to.eventually.be.rejected;
  });

  it("throws when `getSchema` call throws", async () => {
    metadata.getSchema.rejects(new Error("some error"));
    await expect(getClass(metadata, "x.y")).to.eventually.be.rejected;
  });

  it("throws when class does not exist", async () => {
    metadata.getSchema.resolves({
      getClass: async () => undefined,
    });
    await expect(getClass(metadata, "x.y")).to.eventually.be.rejected;
  });

  it("throws when `getClass` call throws", async () => {
    metadata.getSchema.resolves({
      getClass: async () => {
        throw new Error("some error");
      },
    });
    await expect(getClass(metadata, "x.y")).to.eventually.be.rejected;
  });

  it("returns class", async () => {
    const getClassStub = sinon.stub().resolves({ fullName: "result class" });
    metadata.getSchema.resolves({
      getClass: getClassStub,
    });
    const result = await getClass(metadata, "x.y");
    expect(metadata.getSchema).to.be.calledOnceWithExactly("x");
    expect(getClassStub).to.be.calledOnceWithExactly("y");
    expect(result).to.deep.eq({ fullName: "result class" });
  });
});

describe("mergeNodes", () => {
  it("takes lhs label", () => {
    const lhs = createTestProcessedCustomNode({
      key: "custom",
      label: "custom1",
    });
    const rhs = createTestProcessedCustomNode({
      key: "custom",
      label: "custom2",
    });
    expect(mergeNodes(lhs, rhs).label).to.eq("custom1");
  });

  it("merges auto-expand flag", () => {
    expect(mergeNodes(createTestProcessedCustomNode({ autoExpand: undefined }), createTestProcessedCustomNode({ autoExpand: undefined })).autoExpand).to.be
      .undefined;
    expect(mergeNodes(createTestProcessedCustomNode({ autoExpand: false }), createTestProcessedCustomNode({ autoExpand: false })).autoExpand).to.be.undefined;
    expect(mergeNodes(createTestProcessedCustomNode({ autoExpand: false }), createTestProcessedCustomNode({ autoExpand: true })).autoExpand).to.be.true;
    expect(mergeNodes(createTestProcessedCustomNode({ autoExpand: true }), createTestProcessedCustomNode({ autoExpand: true })).autoExpand).to.be.true;
    expect(mergeNodes(createTestProcessedCustomNode({ autoExpand: true }), createTestProcessedCustomNode({ autoExpand: false })).autoExpand).to.be.true;
    expect(mergeNodes(createTestProcessedCustomNode({ autoExpand: true }), createTestProcessedCustomNode({ autoExpand: undefined })).autoExpand).to.be.true;
  });

  it("merges supports-filtering flag", () => {
    expect(
      mergeNodes(createTestProcessedCustomNode({ supportsFiltering: undefined }), createTestProcessedCustomNode({ supportsFiltering: undefined }))
        .supportsFiltering,
    ).to.be.undefined;
    expect(
      mergeNodes(createTestProcessedCustomNode({ supportsFiltering: false }), createTestProcessedCustomNode({ supportsFiltering: false })).supportsFiltering,
    ).to.be.undefined;
    expect(
      mergeNodes(createTestProcessedCustomNode({ supportsFiltering: false }), createTestProcessedCustomNode({ supportsFiltering: true })).supportsFiltering,
    ).to.be.undefined;
    expect(mergeNodes(createTestProcessedCustomNode({ supportsFiltering: true }), createTestProcessedCustomNode({ supportsFiltering: true })).supportsFiltering)
      .to.be.true;
    expect(
      mergeNodes(createTestProcessedCustomNode({ supportsFiltering: true }), createTestProcessedCustomNode({ supportsFiltering: false })).supportsFiltering,
    ).to.be.undefined;
    expect(
      mergeNodes(createTestProcessedCustomNode({ supportsFiltering: true }), createTestProcessedCustomNode({ supportsFiltering: undefined })).supportsFiltering,
    ).to.be.undefined;
  });

  it("merges extended data", () => {
    expect(mergeNodes(createTestProcessedCustomNode({ extendedData: undefined }), createTestProcessedCustomNode({ extendedData: undefined })).extendedData).to
      .be.undefined;
    expect(
      mergeNodes(createTestProcessedCustomNode({ extendedData: undefined }), createTestProcessedCustomNode({ extendedData: { x: 123 } })).extendedData,
    ).to.deep.eq({ x: 123 });
    expect(
      mergeNodes(createTestProcessedCustomNode({ extendedData: { x: 123 } }), createTestProcessedCustomNode({ extendedData: { y: 456 } })).extendedData,
    ).to.deep.eq({ x: 123, y: 456 });
    expect(
      mergeNodes(createTestProcessedCustomNode({ extendedData: { x: 123 } }), createTestProcessedCustomNode({ extendedData: { x: 456 } })).extendedData,
    ).to.deep.eq({ x: 456 });
  });

  describe("merging keys", () => {
    it("merges custom node keys", () => {
      expect(mergeNodes(createTestProcessedCustomNode({ key: "x" }), createTestProcessedCustomNode({ key: "x" })).key).to.eq("x");
      expect(mergeNodes(createTestProcessedCustomNode({ key: "x" }), createTestProcessedCustomNode({ key: "y" })).key).to.eq("x+y");
    });

    it("merges instance node keys", () => {
      const lhs = createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x1" }] } });
      const rhs = createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ className: "c.d", id: "0x2" }] } });
      expect(mergeNodes(lhs, rhs).key).to.deep.eq({
        type: "instances",
        instanceKeys: [
          { className: "a.b", id: "0x1" },
          { className: "c.d", id: "0x2" },
        ],
      });
    });
  });

  describe("merging parent node keys", () => {
    it("takes from lhs when rhs starts with lhs", () => {
      const lhsParentKeys = ["1"];
      const rhsParentKeys = ["1", "2"];
      expect(
        mergeNodes(createTestProcessedCustomNode({ parentKeys: lhsParentKeys }), createTestProcessedCustomNode({ parentKeys: rhsParentKeys })).parentKeys,
      ).to.deep.eq(["1"]);
    });

    it("takes from rhs when lhs starts with rhs", () => {
      const lhsParentKeys = ["1", "2"];
      const rhsParentKeys = ["1"];
      expect(
        mergeNodes(createTestProcessedCustomNode({ parentKeys: lhsParentKeys }), createTestProcessedCustomNode({ parentKeys: rhsParentKeys })).parentKeys,
      ).to.deep.eq(["1"]);
    });

    it("takes common part from the two lists", () => {
      const lhsParentKeys = ["1", "2"];
      const rhsParentKeys = ["1", "3"];
      expect(
        mergeNodes(createTestProcessedCustomNode({ parentKeys: lhsParentKeys }), createTestProcessedCustomNode({ parentKeys: rhsParentKeys })).parentKeys,
      ).to.deep.eq(["1"]);
    });
  });

  describe("merging processing params", () => {
    it("returns `undefined` if neither node has processing params", () => {
      expect(
        mergeNodes(createTestProcessedCustomNode({ processingParams: undefined }), createTestProcessedCustomNode({ processingParams: undefined }))
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

    function traverseOptionalAutoExpandMergeExpectations(
      cb: (
        lhsValue: HierarchyNodeAutoExpandProp | undefined,
        rhsValue: HierarchyNodeAutoExpandProp | undefined,
        expect: HierarchyNodeAutoExpandProp | undefined,
      ) => void,
    ) {
      cb(undefined, undefined, undefined);
      cb(undefined, "single-child", "single-child");
      cb(undefined, "always", "always");
      cb("single-child", undefined, "single-child");
      cb("single-child", "single-child", "single-child");
      cb("single-child", "always", "always");
      cb("single-child", undefined, "single-child");
      cb("always", undefined, "always");
      cb("always", "single-child", "always");
      cb("always", "always", "always");
    }

    function testProcessingParamsFlagMerging(flag: keyof InstanceHierarchyNodeProcessingParams) {
      traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
        const mergedParams = mergeNodes(
          createTestProcessedInstanceNode({ processingParams: { [flag]: lhs } }),
          createTestProcessedInstanceNode({ processingParams: { [flag]: rhs } }),
        ).processingParams;
        const actualValue = mergedParams ? mergedParams[flag] : undefined;
        expect(actualValue).to.eq(expectedMergedValue);
      });
      expect(
        mergeNodes(
          createTestProcessedInstanceNode({ processingParams: { [flag]: undefined } }),
          createTestProcessedInstanceNode({ processingParams: undefined }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeNodes(createTestProcessedInstanceNode({ processingParams: { [flag]: false } }), createTestProcessedInstanceNode({ processingParams: undefined }))
          .processingParams,
      ).to.be.undefined;
      expect(
        mergeNodes(createTestProcessedInstanceNode({ processingParams: { [flag]: true } }), createTestProcessedInstanceNode({ processingParams: undefined }))
          .processingParams![flag],
      ).to.be.true;
    }

    it("merges merge by label id", () => {
      expect(
        mergeNodes(
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: undefined } }),
          createTestProcessedInstanceNode({ processingParams: undefined }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeNodes(
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: undefined } }),
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: undefined } }),
        ).processingParams,
      ).to.be.undefined;
      expect(
        mergeNodes(
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: "x" } }),
          createTestProcessedInstanceNode({ processingParams: undefined }),
        ).processingParams?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes(
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: "x" } }),
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: undefined } }),
        ).processingParams?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes(
          createTestProcessedInstanceNode({ processingParams: undefined }),
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: "x" } }),
        ).processingParams?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes(
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: undefined } }),
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: "x" } }),
        ).processingParams?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes(
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: "x" } }),
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: "x" } }),
        ).processingParams?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes(
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: "x" } }),
          createTestProcessedInstanceNode({ processingParams: { mergeByLabelId: "y" } }),
        ).processingParams!.mergeByLabelId,
      ).to.eq("x");
    });

    describe("merging grouping params", () => {
      it("returns `undefined` if neither processing params have grouping params", () => {
        expect(
          mergeNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: undefined } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: undefined } }),
          ).processingParams?.grouping,
        ).to.be.undefined;
      });

      it("merges class grouping params", () => {
        traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            mergeNodes(
              createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: lhs } } }),
              createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: rhs } } }),
            ).processingParams?.grouping?.byClass,
          ).to.eq(expectedMergedValue);
        });
        expect(
          mergeNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: {} } } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: false } } }),
          ).processingParams?.grouping?.byClass,
        ).to.eq(true);
        expect(
          mergeNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: {} } } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: {} } } }),
          ).processingParams?.grouping?.byClass,
        ).to.deep.eq({});
        traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            (
              mergeNodes(
                createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: { hideIfNoSiblings: lhs } } } }),
                createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: { hideIfNoSiblings: rhs } } } }),
              ).processingParams?.grouping?.byClass as HierarchyNodeGroupingParamsBase
            ).hideIfNoSiblings,
          ).to.eq(expectedMergedValue);
        });
        traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            (
              mergeNodes(
                createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: { hideIfOneGroupedNode: lhs } } } }),
                createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: { hideIfOneGroupedNode: rhs } } } }),
              ).processingParams?.grouping?.byClass as HierarchyNodeGroupingParamsBase
            ).hideIfOneGroupedNode,
          ).to.eq(expectedMergedValue);
        });
        traverseOptionalAutoExpandMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            (
              mergeNodes(
                createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: { autoExpand: lhs } } } }),
                createTestProcessedInstanceNode({ processingParams: { grouping: { byClass: { autoExpand: rhs } } } }),
              ).processingParams?.grouping?.byClass as HierarchyNodeGroupingParamsBase
            ).autoExpand,
          ).to.eq(expectedMergedValue);
        });
      });

      it("merges label grouping params", () => {
        traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            mergeNodes(
              createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: lhs } } }),
              createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: rhs } } }),
            ).processingParams?.grouping?.byLabel,
          ).to.eq(expectedMergedValue);
        });
        expect(
          mergeNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: {} } } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: false } } }),
          ).processingParams?.grouping?.byLabel,
        ).to.eq(true);
        expect(
          mergeNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: {} } } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: {} } } }),
          ).processingParams?.grouping?.byLabel,
        ).to.deep.eq({});
        traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            (
              mergeNodes(
                createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { hideIfNoSiblings: lhs } } } }),
                createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { hideIfNoSiblings: rhs } } } }),
              ).processingParams?.grouping?.byLabel as HierarchyNodeGroupingParamsBase
            ).hideIfNoSiblings,
          ).to.eq(expectedMergedValue);
        });
        traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            (
              mergeNodes(
                createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { hideIfOneGroupedNode: lhs } } } }),
                createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { hideIfOneGroupedNode: rhs } } } }),
              ).processingParams?.grouping?.byLabel as HierarchyNodeGroupingParamsBase
            ).hideIfOneGroupedNode,
          ).to.eq(expectedMergedValue);
        });
        traverseOptionalAutoExpandMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            (
              mergeNodes(
                createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { autoExpand: lhs } } } }),
                createTestProcessedInstanceNode({ processingParams: { grouping: { byLabel: { autoExpand: rhs } } } }),
              ).processingParams?.grouping?.byLabel as HierarchyNodeGroupingParamsBase
            ).autoExpand,
          ).to.eq(expectedMergedValue);
        });
      });

      it("merges base class grouping params", () => {
        expect(
          mergeNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: [] } } } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: [] } } } }),
          ).processingParams!.grouping!.byBaseClasses,
        ).to.deep.eq({ fullClassNames: [] });
        expect(
          mergeNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: ["a"] } } } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: undefined } } }),
          ).processingParams!.grouping!.byBaseClasses,
        ).to.deep.eq({ fullClassNames: ["a"] });
        expect(
          mergeNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: undefined } } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: ["a"] } } } }),
          ).processingParams!.grouping!.byBaseClasses,
        ).to.deep.eq({ fullClassNames: ["a"] });
        expect(
          mergeNodes(
            createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: ["a", "b"] } } } }),
            createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: ["b", "c"] } } } }),
          ).processingParams!.grouping!.byBaseClasses,
        ).to.deep.eq({ fullClassNames: ["a", "b", "c"] });
        traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            mergeNodes(
              createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: [], hideIfNoSiblings: lhs } } } }),
              createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: [], hideIfNoSiblings: rhs } } } }),
            ).processingParams!.grouping!.byBaseClasses!.hideIfNoSiblings,
          ).to.eq(expectedMergedValue);
        });
        traverseOptionalBooleanMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            mergeNodes(
              createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: [], hideIfOneGroupedNode: lhs } } } }),
              createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: [], hideIfOneGroupedNode: rhs } } } }),
            ).processingParams!.grouping!.byBaseClasses!.hideIfOneGroupedNode,
          ).to.eq(expectedMergedValue);
        });
        traverseOptionalAutoExpandMergeExpectations((lhs, rhs, expectedMergedValue) => {
          expect(
            mergeNodes(
              createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: [], autoExpand: lhs } } } }),
              createTestProcessedInstanceNode({ processingParams: { grouping: { byBaseClasses: { fullClassNames: [], autoExpand: rhs } } } }),
            ).processingParams!.grouping!.byBaseClasses!.autoExpand,
          ).to.eq(expectedMergedValue);
        });
      });
    });
  });

  describe("merging children", () => {
    it("returns `true` if at least one node has `true`", () => {
      expect(mergeNodes(createTestProcessedCustomNode({ children: true }), createTestProcessedCustomNode({ children: true })).children).to.be.true;
      expect(mergeNodes(createTestProcessedCustomNode({ children: true }), createTestProcessedCustomNode({ children: false })).children).to.be.true;
      expect(mergeNodes(createTestProcessedCustomNode({ children: false }), createTestProcessedCustomNode({ children: true })).children).to.be.true;
      expect(mergeNodes(createTestProcessedCustomNode({ children: true }), createTestProcessedCustomNode({ children: undefined })).children).to.be.true;
      expect(mergeNodes(createTestProcessedCustomNode({ children: undefined }), createTestProcessedCustomNode({ children: true })).children).to.be.true;
    });

    it("returns `false` if both nodes have `false`", () => {
      expect(mergeNodes(createTestProcessedCustomNode({ children: false }), createTestProcessedCustomNode({ children: false })).children).to.be.false;
    });

    it("returns `undefined` if neither node has truthy value", () => {
      expect(mergeNodes(createTestProcessedCustomNode({ children: undefined }), createTestProcessedCustomNode({ children: undefined })).children).to.be
        .undefined;
      expect(mergeNodes(createTestProcessedCustomNode({ children: false }), createTestProcessedCustomNode({ children: undefined })).children).to.be.undefined;
      expect(mergeNodes(createTestProcessedCustomNode({ children: undefined }), createTestProcessedCustomNode({ children: false })).children).to.be.undefined;
    });
  });
});

describe("hasChildren", () => {
  it("returns correct value", () => {
    expect(hasChildren({ children: undefined })).to.be.false;
    expect(hasChildren({ children: false })).to.be.false;
    expect(hasChildren({ children: [] })).to.be.false;
    expect(hasChildren({ children: true })).to.be.true;
    expect(hasChildren({ children: [1] })).to.be.true;
  });
});

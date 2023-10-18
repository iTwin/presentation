/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { of } from "rxjs";
import sinon from "sinon";
import { HierarchyNode, HierarchyNodeProcessingParams, ProcessedHierarchyNode } from "../../hierarchy-builder/HierarchyNode";
import { ChildNodesCache, getClass, hasChildren, mergeNodes, mergeNodesObs } from "../../hierarchy-builder/internal/Common";
import { getObservableResult } from "../Utils";

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
  const base: HierarchyNode = { key: "x", label: "x" };

  it("takes lhs label", () => {
    const lhs: ProcessedHierarchyNode = {
      key: "custom",
      label: "custom1",
    };
    const rhs: ProcessedHierarchyNode = {
      key: "custom",
      label: "custom2",
    };
    expect(mergeNodes(lhs, rhs)).to.deep.eq({
      key: "custom",
      label: "custom1",
    });
  });

  it("merges auto-expand flag", () => {
    expect(mergeNodes({ ...base, autoExpand: undefined }, { ...base, autoExpand: undefined }).autoExpand).to.be.undefined;
    expect(mergeNodes({ ...base, autoExpand: false }, { ...base, autoExpand: false }).autoExpand).to.be.undefined;
    expect(mergeNodes({ ...base, autoExpand: false }, { ...base, autoExpand: true }).autoExpand).to.be.true;
    expect(mergeNodes({ ...base, autoExpand: true }, { ...base, autoExpand: true }).autoExpand).to.be.true;
    expect(mergeNodes({ ...base, autoExpand: true }, { ...base, autoExpand: false }).autoExpand).to.be.true;
    expect(mergeNodes({ ...base, autoExpand: true }, { ...base, autoExpand: undefined }).autoExpand).to.be.true;
  });

  it("merges extended data", () => {
    expect(mergeNodes({ ...base, extendedData: undefined }, { ...base, extendedData: undefined }).extendedData).to.be.undefined;
    expect(mergeNodes({ ...base, extendedData: undefined }, { ...base, extendedData: { x: 123 } }).extendedData).to.deep.eq({ x: 123 });
    expect(mergeNodes({ ...base, extendedData: { x: 123 } }, { ...base, extendedData: { y: 456 } }).extendedData).to.deep.eq({ x: 123, y: 456 });
    expect(mergeNodes({ ...base, extendedData: { x: 123 } }, { ...base, extendedData: { x: 456 } }).extendedData).to.deep.eq({ x: 456 });
  });

  describe("merging keys", () => {
    it("merges custom node keys", () => {
      expect(mergeNodes({ ...base, key: "x" }, { ...base, key: "x" }).key).to.eq("x");
      expect(mergeNodes({ ...base, key: "x" }, { ...base, key: "y" }).key).to.eq("x+y");
    });

    it("merges instance node keys", () => {
      const lhs: ProcessedHierarchyNode = { ...base, key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x1" }] } };
      const rhs: ProcessedHierarchyNode = { ...base, key: { type: "instances", instanceKeys: [{ className: "c.d", id: "0x2" }] } };
      expect(mergeNodes(lhs, rhs).key).to.deep.eq({
        type: "instances",
        instanceKeys: [
          { className: "a.b", id: "0x1" },
          { className: "c.d", id: "0x2" },
        ],
      });
    });

    it("merges class grouping node keys", () => {
      const lhs: ProcessedHierarchyNode = { ...base, key: { type: "class-grouping", class: { name: "a.b" } } };
      const rhs: ProcessedHierarchyNode = { ...base, key: { type: "class-grouping", class: { name: "a.b" } } };
      expect(mergeNodes(lhs, rhs).key).to.deep.eq({ type: "class-grouping", class: { name: "a.b" } });
    });

    it("throws when merging class grouping node keys of different classes", () => {
      const lhs: ProcessedHierarchyNode = { ...base, key: { type: "class-grouping", class: { name: "a.b" } } };
      const rhs: ProcessedHierarchyNode = { ...base, key: { type: "class-grouping", class: { name: "c.d" } } };
      expect(() => mergeNodes(lhs, rhs)).to.throw;
    });

    it("merges label grouping node keys", () => {
      const lhs: ProcessedHierarchyNode = { ...base, key: { type: "label-grouping", label: "a" } };
      const rhs: ProcessedHierarchyNode = { ...base, key: { type: "label-grouping", label: "a" } };
      expect(mergeNodes(lhs, rhs).key).to.deep.eq({ type: "label-grouping", label: "a" });
    });

    it("throws when merging label grouping node keys of different labels", () => {
      const lhs: ProcessedHierarchyNode = { ...base, key: { type: "label-grouping", label: "a" } };
      const rhs: ProcessedHierarchyNode = { ...base, key: { type: "label-grouping", label: "b" } };
      expect(() => mergeNodes(lhs, rhs)).to.throw;
    });

    it("throws when merging keys of different types", () => {
      const lhs: ProcessedHierarchyNode = { ...base, key: { type: "class-grouping", class: { name: "a.b" } } };
      const rhs: ProcessedHierarchyNode = { ...base, key: { type: "label-grouping", label: "a.b" } };
      expect(() => mergeNodes(lhs, rhs)).to.throw;
    });
  });

  describe("merging processing params", () => {
    it("returns `undefined` if neither node has processing params", () => {
      expect(mergeNodes({ ...base, processingParams: undefined }, { ...base, processingParams: undefined }).processingParams).to.be.undefined;
    });

    it("merges hide if no children flag", () => testFlagMerging("hideIfNoChildren"));

    it("merges hide in hierarchy flag", () => testFlagMerging("hideInHierarchy"));

    it("merges group by class flag", () => testFlagMerging("groupByClass"));

    it("merges group by label flag", () => testFlagMerging("groupByLabel"));

    function testFlagMerging(flag: keyof HierarchyNodeProcessingParams) {
      expect(mergeNodes({ ...base, processingParams: { [flag]: undefined } }, { ...base, processingParams: undefined }).processingParams).to.be.undefined;
      expect(mergeNodes({ ...base, processingParams: { [flag]: undefined } }, { ...base, processingParams: { [flag]: undefined } }).processingParams).to.be
        .undefined;
      expect(mergeNodes({ ...base, processingParams: { [flag]: false } }, { ...base, processingParams: { [flag]: false } }).processingParams).to.be.undefined;
      expect(mergeNodes({ ...base, processingParams: { [flag]: false } }, { ...base, processingParams: { [flag]: true } }).processingParams![flag]).to.be.true;
      expect(mergeNodes({ ...base, processingParams: { [flag]: true } }, { ...base, processingParams: { [flag]: true } }).processingParams![flag]).to.be.true;
      expect(mergeNodes({ ...base, processingParams: { [flag]: true } }, { ...base, processingParams: { [flag]: false } }).processingParams![flag]).to.be.true;
      expect(mergeNodes({ ...base, processingParams: { [flag]: true } }, { ...base, processingParams: { [flag]: undefined } }).processingParams![flag]).to.be
        .true;
      expect(mergeNodes({ ...base, processingParams: { [flag]: true } }, { ...base, processingParams: undefined }).processingParams![flag]).to.be.true;
    }

    it("merges merge by label id", () => {
      expect(mergeNodes({ ...base, processingParams: { mergeByLabelId: undefined } }, { ...base, processingParams: undefined }).processingParams).to.be
        .undefined;
      expect(
        mergeNodes({ ...base, processingParams: { mergeByLabelId: undefined } }, { ...base, processingParams: { mergeByLabelId: undefined } }).processingParams,
      ).to.be.undefined;
      expect(
        mergeNodes({ ...base, processingParams: { mergeByLabelId: "x" } }, { ...base, processingParams: undefined }).processingParams?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes({ ...base, processingParams: { mergeByLabelId: "x" } }, { ...base, processingParams: { mergeByLabelId: undefined } }).processingParams
          ?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes({ ...base, processingParams: undefined }, { ...base, processingParams: { mergeByLabelId: "x" } }).processingParams?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes({ ...base, processingParams: { mergeByLabelId: undefined } }, { ...base, processingParams: { mergeByLabelId: "x" } }).processingParams
          ?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes({ ...base, processingParams: { mergeByLabelId: "x" } }, { ...base, processingParams: { mergeByLabelId: "x" } }).processingParams
          ?.mergeByLabelId,
      ).to.eq("x");
      expect(
        mergeNodes({ ...base, processingParams: { mergeByLabelId: "x" } }, { ...base, processingParams: { mergeByLabelId: "y" } }).processingParams!
          .mergeByLabelId,
      ).to.eq("x");
    });
  });

  describe("merging children", () => {
    it("returns merged arrays if both nodes have arrays", () => {
      expect(mergeNodes({ ...base, children: [{ key: "1", label: "1" }] }, { ...base, children: [{ key: "2", label: "2" }] }).children).to.deep.eq([
        { key: "1", label: "1" },
        { key: "2", label: "2" },
      ]);
      expect(mergeNodes({ ...base, children: [] }, { ...base, children: [] }).children).to.deep.eq([]);
    });

    it("returns `true` if at least one node has `true`", () => {
      expect(mergeNodes({ ...base, children: true }, { ...base, children: true }).children).to.be.true;
      expect(mergeNodes({ ...base, children: true }, { ...base, children: false }).children).to.be.true;
      expect(mergeNodes({ ...base, children: false }, { ...base, children: true }).children).to.be.true;
      expect(mergeNodes({ ...base, children: true }, { ...base, children: undefined }).children).to.be.true;
      expect(mergeNodes({ ...base, children: undefined }, { ...base, children: true }).children).to.be.true;
    });

    it("returns `false` if both nodes have `false`", () => {
      expect(mergeNodes({ ...base, children: false }, { ...base, children: false }).children).to.be.false;
    });

    it("returns `undefined` if neither node has truthy value", () => {
      expect(mergeNodes({ ...base, children: undefined }, { ...base, children: undefined }).children).to.be.undefined;
      expect(mergeNodes({ ...base, children: false }, { ...base, children: undefined }).children).to.be.undefined;
      expect(mergeNodes({ ...base, children: undefined }, { ...base, children: false }).children).to.be.undefined;
      expect(mergeNodes({ ...base, children: [] }, { ...base, children: undefined }).children).to.be.undefined;
      expect(mergeNodes({ ...base, children: undefined }, { ...base, children: [] }).children).to.be.undefined;
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

describe("mergeNodesObs", () => {
  it("merges nodes and caches merged node children observable", async () => {
    const lhs: ProcessedHierarchyNode = { key: "x", label: "1" };
    const rhs: ProcessedHierarchyNode = { key: "y", label: "2" };
    const cache = new ChildNodesCache();
    cache.set(lhs, of({ key: "3", label: "3" }));
    cache.set(rhs, of({ key: "4", label: "4" }));

    const result = mergeNodesObs(lhs, rhs, cache);
    expect(result).to.deep.eq(mergeNodes(lhs, rhs));
    expect(await getObservableResult(cache.get(result)!)).to.deep.eq([
      { key: "3", label: "3" },
      { key: "4", label: "4" },
    ]);
  });

  it("doesn't cache children observable if lhs doesn't have its own children observable cached", () => {
    const lhs: ProcessedHierarchyNode = { key: "x", label: "1" };
    const rhs: ProcessedHierarchyNode = { key: "y", label: "2" };
    const cache = new ChildNodesCache();
    cache.set(lhs, of({ key: "3", label: "3" }));

    const result = mergeNodesObs(lhs, rhs, cache);
    expect(cache.has(result)).to.be.false;
  });

  it("doesn't cache children observable if rhs doesn't have its own children observable cached", () => {
    const lhs: ProcessedHierarchyNode = { key: "x", label: "1" };
    const rhs: ProcessedHierarchyNode = { key: "y", label: "2" };
    const cache = new ChildNodesCache();
    cache.set(rhs, of({ key: "3", label: "3" }));

    const result = mergeNodesObs(lhs, rhs, cache);
    expect(cache.has(result)).to.be.false;
  });
});

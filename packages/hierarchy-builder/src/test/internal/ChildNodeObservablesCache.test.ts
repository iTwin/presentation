/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GetHierarchyNodesProps } from "../../hierarchy-builder/HierarchyProvider";
import { ChildNodeObservablesCache, ParsedQueryNodesObservable, ProcessedNodesObservable } from "../../hierarchy-builder/internal/ChildNodeObservablesCache";
import { createTestProcessedCustomNode, createTestProcessedGroupingNode } from "../Utils";

describe("ChildNodeObservablesCache", () => {
  it("returns `undefined` for non-existing entry", () => {
    const cache = new ChildNodeObservablesCache({ size: 1 });
    const result = cache.get({ parentNode: undefined });
    expect(result).to.be.undefined;
  });

  it("returns value for existing entry", () => {
    const cache = new ChildNodeObservablesCache({ size: 1 });
    const value = {} as ParsedQueryNodesObservable;
    const props = { parentNode: undefined };
    cache.addParseResult(props, value);
    const result = cache.get(props);
    expect(result?.observable).to.eq(value);
  });

  it("returns `undefined` after clearing", () => {
    const cache = new ChildNodeObservablesCache({ size: 1 });
    const value = {} as ParsedQueryNodesObservable;
    const props = { parentNode: undefined };
    cache.addParseResult(props, value);
    cache.clear();
    expect(cache.get(props)).to.be.undefined;
  });

  it("clears recently used entries", () => {
    const cache = new ChildNodeObservablesCache({ size: 1 });
    const props1 = { parentNode: createTestProcessedCustomNode({ key: "1" }) };
    const value1 = {} as ParsedQueryNodesObservable;
    const props2 = { parentNode: createTestProcessedCustomNode({ key: "2" }) };
    const value2 = {} as ParsedQueryNodesObservable;

    cache.addParseResult(props1, value1);
    expect(cache.get(props1)?.observable).to.eq(value1);
    expect(cache.get(props2)).to.be.undefined;

    cache.addParseResult(props2, value2);
    expect(cache.get(props1)).to.be.undefined;
    expect(cache.get(props2)?.observable).to.eq(value2);
  });

  describe("grouped node observables' handling", () => {
    it("returns `undefined` for non-existing entry", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });

      const parentNode = createTestProcessedGroupingNode({ parentKeys: [] });

      expect(cache.get({ parentNode })).to.be.undefined;

      cache.addParseResult({ parentNode: undefined }, {} as ParsedQueryNodesObservable);
      expect(cache.get({ parentNode })).to.be.undefined;
    });

    it("returns grouped nodes observables at root level", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });
      const branch = cacheGroupedNodesBranch(cache, undefined);
      expect(cache.get(branch.rootProps)?.observable).to.eq(branch.rootValue);
      expect(cache.get(branch.rootProps)?.needsProcessing).to.be.true;
      expect(cache.get(branch.immediateGroupingNodeProps)?.observable).to.eq(branch.immediateGroupingNodeValue);
      expect(cache.get(branch.immediateGroupingNodeProps)?.needsProcessing).to.be.false;
      expect(cache.get(branch.deeplyNestedGroupingNodeProps)?.observable).to.eq(branch.deeplyNestedGroupingNodeValue);
      expect(cache.get(branch.deeplyNestedGroupingNodeProps)?.needsProcessing).to.be.false;
    });

    it("returns grouped nodes observables at child level", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });
      const branch = cacheGroupedNodesBranch(cache, "x");
      expect(cache.get(branch.rootProps)?.observable).to.eq(branch.rootValue);
      expect(cache.get(branch.rootProps)?.needsProcessing).to.be.true;
      expect(cache.get(branch.immediateGroupingNodeProps)?.observable).to.eq(branch.immediateGroupingNodeValue);
      expect(cache.get(branch.immediateGroupingNodeProps)?.needsProcessing).to.be.false;
      expect(cache.get(branch.deeplyNestedGroupingNodeProps)?.observable).to.eq(branch.deeplyNestedGroupingNodeValue);
      expect(cache.get(branch.deeplyNestedGroupingNodeProps)?.needsProcessing).to.be.false;
    });

    it("clears associated grouping node entries when parent node entry is pushed-out", () => {
      const cache = new ChildNodeObservablesCache({ size: 2 });

      const branch1 = cacheGroupedNodesBranch(cache, "1");
      const branch2 = cacheGroupedNodesBranch(cache, "2");

      expect(cache.get(branch1.rootProps)?.observable).to.eq(branch1.rootValue);
      expect(cache.get(branch1.immediateGroupingNodeProps)?.observable).to.eq(branch1.immediateGroupingNodeValue);
      expect(cache.get(branch1.deeplyNestedGroupingNodeProps)?.observable).to.eq(branch1.deeplyNestedGroupingNodeValue);

      expect(cache.get(branch2.rootProps)?.observable).to.eq(branch2.rootValue);
      expect(cache.get(branch2.immediateGroupingNodeProps)?.observable).to.eq(branch2.immediateGroupingNodeValue);
      expect(cache.get(branch2.deeplyNestedGroupingNodeProps)?.observable).to.eq(branch2.deeplyNestedGroupingNodeValue);

      // caching a new only should push the whole branch1 from the cache
      cache.addParseResult({ parentNode: createTestProcessedCustomNode({ key: "new" }) }, {} as ParsedQueryNodesObservable);

      expect(cache.get(branch1.rootProps)).to.be.undefined;
      expect(cache.get(branch1.immediateGroupingNodeProps)).to.be.undefined;
      expect(cache.get(branch1.deeplyNestedGroupingNodeProps)).to.be.undefined;

      // all branch2 content should stay intact
      expect(cache.get(branch2.rootProps)?.observable).to.eq(branch2.rootValue);
      expect(cache.get(branch2.immediateGroupingNodeProps)?.observable).to.eq(branch2.immediateGroupingNodeValue);
      expect(cache.get(branch2.deeplyNestedGroupingNodeProps)?.observable).to.eq(branch2.deeplyNestedGroupingNodeValue);
    });

    it("returns false when attempting to cache grouped node observable without an existing query observable", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });
      const parentNode = createTestProcessedGroupingNode({ parentKeys: ["x"] });
      const result = cache.addGrouped({ parentNode }, {} as ProcessedNodesObservable);
      expect(result).to.be.false;
    });
  });

  describe("variations' handling", () => {
    it("returns `undefined` for non-existing variation based on instance filter", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedCustomNode() };
      cache.addParseResult(primaryProps, {} as ParsedQueryNodesObservable);

      const variationProps: GetHierarchyNodesProps = {
        ...primaryProps,
        instanceFilter: { propertyClassNames: ["x"], relatedInstances: [], rules: { operator: "and", rules: [] } },
      };
      const result = cache.get(variationProps);
      expect(result).to.be.undefined;
    });

    it("returns existing variation based on instance filter", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedCustomNode() };
      cache.addParseResult(primaryProps, {} as ParsedQueryNodesObservable);

      const variationProps = {
        ...primaryProps,
        instanceFilter: { propertyClassNames: ["x"], relatedInstances: [], rules: { operator: "and" as const, rules: [] } },
      };
      const value = {} as ParsedQueryNodesObservable;
      cache.addParseResult(variationProps, value);

      const result = cache.get(variationProps);
      expect(result?.observable).to.eq(value);
    });

    it("returns `undefined` for non-existing variation based on hierarchy level size limit", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedCustomNode() };
      cache.addParseResult(primaryProps, {} as ParsedQueryNodesObservable);

      const variationProps: GetHierarchyNodesProps = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 999,
      };
      const result = cache.get(variationProps);
      expect(result).to.be.undefined;
    });

    it("returns existing variation based on hierarchy level size limit", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedCustomNode() };
      cache.addParseResult(primaryProps, {} as ParsedQueryNodesObservable);

      const variationProps = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 999,
      };
      const value = {} as ParsedQueryNodesObservable;
      cache.addParseResult(variationProps, value);

      const result = cache.get(variationProps);
      expect(result?.observable).to.eq(value);
    });

    it("keeps primary observable when adding variations", () => {
      const cache = new ChildNodeObservablesCache({ size: 1, variationsCount: 1 });

      const primaryProps = { parentNode: undefined };
      const primaryValue = {} as ParsedQueryNodesObservable;
      cache.addParseResult(primaryProps, primaryValue);

      const variationProps = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 111,
      };
      const value = {} as ParsedQueryNodesObservable;
      cache.addParseResult(variationProps, value);

      expect(cache.get(variationProps)?.observable).to.eq(value);
      expect(cache.get(primaryProps)?.observable).to.eq(primaryValue);
    });

    it("keeps limited number of least recently used variations", () => {
      const cache = new ChildNodeObservablesCache({ size: 1, variationsCount: 1 });

      const primaryProps = { parentNode: undefined };
      cache.addParseResult(primaryProps, {} as ParsedQueryNodesObservable);

      const variationProps1 = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 111,
      };
      const value1 = {} as ParsedQueryNodesObservable;
      cache.addParseResult(variationProps1, value1);

      expect(cache.get(variationProps1)?.observable).to.eq(value1);

      const variationProps2 = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 222,
      };
      const value2 = {} as ParsedQueryNodesObservable;
      cache.addParseResult(variationProps2, value2);

      expect(cache.get(variationProps1)).to.be.undefined;
      expect(cache.get(variationProps2)?.observable).to.eq(value2);
    });
  });
});

function cacheGroupedNodesBranch(cache: ChildNodeObservablesCache, id: string | undefined) {
  const rootProps = { parentNode: id ? createTestProcessedCustomNode({ key: id }) : undefined };
  const rootValue = {} as ParsedQueryNodesObservable;
  cache.addParseResult(rootProps, rootValue);

  const immediateGroupingNodeProps = { parentNode: createTestProcessedGroupingNode({ parentKeys: id ? [id] : [] }) };
  const immediateGroupingNodeValue = {} as ProcessedNodesObservable;
  cache.addGrouped(immediateGroupingNodeProps, immediateGroupingNodeValue);

  const deeplyNestedGroupingNodeProps = {
    parentNode: createTestProcessedGroupingNode({ parentKeys: [...(id ? [id] : []), immediateGroupingNodeProps.parentNode.key] }),
  };
  const deeplyNestedGroupingNodeValue = {} as ProcessedNodesObservable;
  cache.addGrouped(deeplyNestedGroupingNodeProps, deeplyNestedGroupingNodeValue);

  return {
    rootProps,
    rootValue,
    immediateGroupingNodeProps,
    immediateGroupingNodeValue,
    deeplyNestedGroupingNodeProps,
    deeplyNestedGroupingNodeValue,
  };
}

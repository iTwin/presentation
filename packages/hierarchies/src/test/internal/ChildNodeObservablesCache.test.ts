/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GetHierarchyNodesProps } from "../../hierarchies/HierarchyProvider";
import { CachedNodesObservableEntry, ChildNodeObservablesCache } from "../../hierarchies/internal/ChildNodeObservablesCache";
import { createTestProcessedCustomNode } from "../Utils";

describe("ChildNodeObservablesCache", () => {
  it("returns `undefined` when cache is empty", () => {
    const cache = new ChildNodeObservablesCache({ size: 1 });
    const result = cache.get({ parentNode: undefined });
    expect(result).to.be.undefined;
  });

  it("returns `undefined` for non-existing entry", () => {
    const cache = new ChildNodeObservablesCache({ size: 1 });
    cache.set({ parentNode: createTestProcessedCustomNode() }, {} as CachedNodesObservableEntry);
    const result = cache.get({ parentNode: undefined });
    expect(result).to.be.undefined;
  });

  it("returns value for existing entry", () => {
    const cache = new ChildNodeObservablesCache({ size: 1 });
    const value = {} as CachedNodesObservableEntry;
    const props = { parentNode: undefined };
    cache.set(props, value);
    const result = cache.get(props);
    expect(result).to.eq(value);
  });

  it("returns `undefined` after clearing", () => {
    const cache = new ChildNodeObservablesCache({ size: 1 });
    const value = {} as CachedNodesObservableEntry;
    const props = { parentNode: undefined };
    cache.set(props, value);
    cache.clear();
    expect(cache.get(props)).to.be.undefined;
  });

  it("clears recently used entries", () => {
    const cache = new ChildNodeObservablesCache({ size: 1 });
    const props1 = { parentNode: createTestProcessedCustomNode({ key: "1" }) };
    const value1 = {} as CachedNodesObservableEntry;
    const props2 = { parentNode: createTestProcessedCustomNode({ key: "2" }) };
    const value2 = {} as CachedNodesObservableEntry;

    cache.set(props1, value1);
    expect(cache.get(props1)).to.eq(value1);
    expect(cache.get(props2)).to.be.undefined;

    cache.set(props2, value2);
    expect(cache.get(props1)).to.be.undefined;
    expect(cache.get(props2)).to.eq(value2);
  });

  describe("variations' handling", () => {
    it("returns `undefined` for non-existing variation based on instance filter", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedCustomNode() };
      cache.set(primaryProps, {} as CachedNodesObservableEntry);

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
      cache.set(primaryProps, {} as CachedNodesObservableEntry);

      const variationProps = {
        ...primaryProps,
        instanceFilter: { propertyClassNames: ["x"], relatedInstances: [], rules: { operator: "and" as const, rules: [] } },
      };
      const value = {} as CachedNodesObservableEntry;
      cache.set(variationProps, value);

      const result = cache.get(variationProps);
      expect(result).to.eq(value);
    });

    it("returns `undefined` for non-existing variation based on hierarchy level size limit", () => {
      const cache = new ChildNodeObservablesCache({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedCustomNode() };
      cache.set(primaryProps, {} as CachedNodesObservableEntry);

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
      cache.set(primaryProps, {} as CachedNodesObservableEntry);

      const variationProps = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 999,
      };
      const value = {} as CachedNodesObservableEntry;
      cache.set(variationProps, value);

      const result = cache.get(variationProps);
      expect(result).to.eq(value);
    });

    it("keeps primary observable when adding variations", () => {
      const cache = new ChildNodeObservablesCache({ size: 1, variationsCount: 1 });

      const primaryProps = { parentNode: undefined };
      const primaryValue = {} as CachedNodesObservableEntry;
      cache.set(primaryProps, primaryValue);

      const variationProps = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 111,
      };
      const value = {} as CachedNodesObservableEntry;
      cache.set(variationProps, value);

      expect(cache.get(variationProps)).to.eq(value);
      expect(cache.get(primaryProps)).to.eq(primaryValue);
    });

    it("keeps limited number of least recently used variations", () => {
      const cache = new ChildNodeObservablesCache({ size: 1, variationsCount: 1 });

      const primaryProps = { parentNode: undefined };
      cache.set(primaryProps, {} as CachedNodesObservableEntry);

      const variationProps1 = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 111,
      };
      const value1 = {} as CachedNodesObservableEntry;
      cache.set(variationProps1, value1);

      expect(cache.get(variationProps1)).to.eq(value1);

      const variationProps2 = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 222,
      };
      const value2 = {} as CachedNodesObservableEntry;
      cache.set(variationProps2, value2);

      expect(cache.get(variationProps1)).to.be.undefined;
      expect(cache.get(variationProps2)).to.eq(value2);
    });
  });
});

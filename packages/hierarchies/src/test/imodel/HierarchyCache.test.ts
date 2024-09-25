/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GetHierarchyNodesProps } from "../../hierarchies/HierarchyProvider";
import { HierarchyCache } from "../../hierarchies/imodel/HierarchyCache";
import { createTestGenericNodeKey, createTestProcessedGenericNode } from "../Utils";

describe("HierarchyCache", () => {
  it("returns `undefined` when cache is empty", () => {
    const cache = new HierarchyCache<string>({ size: 1 });
    const result = cache.get({ parentNode: undefined });
    expect(result).to.be.undefined;
  });

  it("returns `undefined` for non-existing entry", () => {
    const cache = new HierarchyCache<string>({ size: 1 });
    cache.set({ parentNode: createTestProcessedGenericNode() }, "test");
    const result = cache.get({ parentNode: undefined });
    expect(result).to.be.undefined;
  });

  it("returns value for existing entry", () => {
    const cache = new HierarchyCache<string>({ size: 1 });
    const value = "test";
    const props = { parentNode: undefined };
    cache.set(props, value);
    const result = cache.get(props);
    expect(result).to.eq(value);
  });

  it("returns `undefined` after clearing", () => {
    const cache = new HierarchyCache<string>({ size: 1 });
    const value = "test";
    const props = { parentNode: undefined };
    cache.set(props, value);
    cache.clear();
    expect(cache.get(props)).to.be.undefined;
  });

  it("clears recently used entries", () => {
    const cache = new HierarchyCache<string>({ size: 1 });
    const props1 = { parentNode: createTestProcessedGenericNode({ key: createTestGenericNodeKey({ id: "1" }) }) };
    const value1 = "value 1";
    const props2 = { parentNode: createTestProcessedGenericNode({ key: createTestGenericNodeKey({ id: "2" }) }) };
    const value2 = "value 2";

    cache.set(props1, value1);
    expect(cache.get(props1)).to.eq(value1);
    expect(cache.get(props2)).to.be.undefined;

    cache.set(props2, value2);
    expect(cache.get(props1)).to.be.undefined;
    expect(cache.get(props2)).to.eq(value2);
  });

  describe("variations' handling", () => {
    it("returns `undefined` for non-existing variation based on instance filter", () => {
      const cache = new HierarchyCache<string>({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedGenericNode() };
      cache.set(primaryProps, "primary");

      const variationProps: GetHierarchyNodesProps = {
        ...primaryProps,
        instanceFilter: { propertyClassNames: ["x"], relatedInstances: [], rules: { operator: "and", rules: [] } },
      };
      const result = cache.get(variationProps);
      expect(result).to.be.undefined;
    });

    it("returns existing variation based on instance filter", () => {
      const cache = new HierarchyCache<string>({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedGenericNode() };
      cache.set(primaryProps, "primary");

      const variationProps = {
        ...primaryProps,
        instanceFilter: { propertyClassNames: ["x"], relatedInstances: [], rules: { operator: "and" as const, rules: [] } },
      };
      const value = "variation";
      cache.set(variationProps, value);

      const result = cache.get(variationProps);
      expect(result).to.eq(value);
    });

    it("returns `undefined` for non-existing variation based on hierarchy level size limit", () => {
      const cache = new HierarchyCache<string>({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedGenericNode() };
      cache.set(primaryProps, "primary");

      const variationProps: GetHierarchyNodesProps = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 999,
      };
      const result = cache.get(variationProps);
      expect(result).to.be.undefined;
    });

    it("returns existing variation based on hierarchy level size limit", () => {
      const cache = new HierarchyCache<string>({ size: 1 });

      const primaryProps = { parentNode: createTestProcessedGenericNode() };
      cache.set(primaryProps, "primary");

      const variationProps = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 999,
      };
      const value = "variation";
      cache.set(variationProps, value);

      const result = cache.get(variationProps);
      expect(result).to.eq(value);
    });

    it("keeps primary observable when adding variations", () => {
      const cache = new HierarchyCache<string>({ size: 1, variationsCount: 1 });

      const primaryProps = { parentNode: undefined };
      const primaryValue = "primary";
      cache.set(primaryProps, primaryValue);

      const variationProps = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 111,
      };
      const value = "variation";
      cache.set(variationProps, value);

      expect(cache.get(variationProps)).to.eq(value);
      expect(cache.get(primaryProps)).to.eq(primaryValue);
    });

    it("keeps limited number of least recently used variations", () => {
      const cache = new HierarchyCache<string>({ size: 1, variationsCount: 1 });

      const primaryProps = { parentNode: undefined };
      cache.set(primaryProps, "primary");

      const variationProps1 = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 111,
      };
      const value1 = "variation 1";
      cache.set(variationProps1, value1);

      expect(cache.get(variationProps1)).to.eq(value1);

      const variationProps2 = {
        ...primaryProps,
        hierarchyLevelSizeLimit: 222,
      };
      const value2 = "variation 2";
      cache.set(variationProps2, value2);

      expect(cache.get(variationProps1)).to.be.undefined;
      expect(cache.get(variationProps2)).to.eq(value2);
    });
  });
});

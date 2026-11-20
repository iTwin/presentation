/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { createHierarchyDefinitionFromPathBased } from "../../hierarchies/imodel/PathBasedHierarchyDefinition.js";
import {
  createTestGenericNodeKey,
  createTestProcessedGenericNode,
  createTestProcessedGroupingNode,
  createTestProcessedInstanceNode,
} from "../Utils.js";

import type { ParentHierarchyNode } from "../../hierarchies/HierarchyNode.js";
import type { HierarchyNodeKey, IModelInstanceKey } from "../../hierarchies/HierarchyNodeKey.js";
import type { DefineHierarchyLevelProps } from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import type { PathBasedHierarchyDefinition } from "../../hierarchies/imodel/PathBasedHierarchyDefinition.js";

describe("createHierarchyDefinitionFromPathBased", () => {
  const instanceKey: IModelInstanceKey = { className: "s.A", id: "0x1", imodelKey: "test-imodel" };
  const genericKey = createTestGenericNodeKey({ id: "g", source: "test-source" });
  const groupingKey: HierarchyNodeKey = { type: "label-grouping", label: "x" };
  // grouping node keys are skipped in paths
  const parentNode: ParentHierarchyNode = {
    key: { type: "instances", instanceKeys: [{ className: "s.B", id: "0x2" }] },
    parentKeys: [genericKey, groupingKey, { type: "instances", instanceKeys: [instanceKey] }],
    label: "parent",
  };
  const expectedPath = [genericKey, instanceKey, { className: "s.B", id: "0x2" }];

  const clauseFactoryProps = {
    createSelectClause: async () => "select clause",
    createFilterClauses: async () => ({ from: "", joins: "", where: "" }),
  } satisfies Omit<DefineHierarchyLevelProps, "parentNode">;

  function createSource(props?: Partial<PathBasedHierarchyDefinition>) {
    return { defineHierarchyLevel: vi.fn(async () => []), ...props };
  }

  describe("defineHierarchyLevel", () => {
    it("passes path of the parent node instead of the parent node", async () => {
      const source = createSource();
      const definition = createHierarchyDefinitionFromPathBased(source);
      await definition.defineHierarchyLevel({ ...clauseFactoryProps, parentNode });
      expect(source.defineHierarchyLevel).toHaveBeenCalledExactlyOnceWith({
        ...clauseFactoryProps,
        path: expectedPath,
      });
    });

    it("passes empty path for root hierarchy level", async () => {
      const source = createSource();
      const definition = createHierarchyDefinitionFromPathBased(source);
      await definition.defineHierarchyLevel({ ...clauseFactoryProps, parentNode: undefined });
      expect(source.defineHierarchyLevel).toHaveBeenCalledExactlyOnceWith({ ...clauseFactoryProps, path: [] });
    });

    it("throws when parent node has multiple instance keys", async () => {
      const definition = createHierarchyDefinitionFromPathBased(createSource());
      await expect(
        definition.defineHierarchyLevel({
          ...clauseFactoryProps,
          parentNode: {
            key: { type: "instances", instanceKeys: [instanceKey, { ...instanceKey, id: "0x3" }] },
            parentKeys: [],
            label: "merged",
          },
        }),
      ).rejects.toThrow("don't support nodes with multiple instance keys");
    });
  });

  describe("parseNode", () => {
    it("is not defined when source doesn't define it", () => {
      expect(createHierarchyDefinitionFromPathBased(createSource()).parseNode).toBeUndefined();
    });

    it("passes path of the parent node instead of the parent node", async () => {
      const parsedNode = { key: { type: "instances" as const, instanceKeys: [instanceKey] }, label: "x" };
      const parseNode = vi.fn(async () => parsedNode);
      const definition = createHierarchyDefinitionFromPathBased(createSource({ parseNode }));
      const row = { x: 1 };
      expect(await definition.parseNode!({ row, parentNode, imodelKey: "test-imodel" })).toBe(parsedNode);
      expect(parseNode).toHaveBeenCalledExactlyOnceWith({ row, imodelKey: "test-imodel", path: expectedPath });
    });
  });

  describe("preProcessNode", () => {
    it("is not defined when source doesn't define it", () => {
      expect(createHierarchyDefinitionFromPathBased(createSource()).preProcessNode).toBeUndefined();
    });

    it("passes path of the parent node instead of the parent node", async () => {
      const node = createTestProcessedInstanceNode();
      const preProcessedNode = createTestProcessedInstanceNode({ label: "pre-processed" });
      const preProcessNode = vi.fn(async () => preProcessedNode);
      const definition = createHierarchyDefinitionFromPathBased(
        createSource({ preProcessNode: preProcessNode as PathBasedHierarchyDefinition["preProcessNode"] }),
      );
      expect(await definition.preProcessNode!({ node, parentNode })).toBe(preProcessedNode);
      expect(preProcessNode).toHaveBeenCalledExactlyOnceWith({ node, path: expectedPath });
    });

    it("returns `undefined` when source pre-processor omits the node", async () => {
      const preProcessNode = async () => undefined;
      const definition = createHierarchyDefinitionFromPathBased(createSource({ preProcessNode }));
      expect(await definition.preProcessNode!({ node: createTestProcessedInstanceNode() })).toBeUndefined();
    });
  });

  describe("postProcessNode", () => {
    it.each([
      { name: "instance", node: createTestProcessedInstanceNode() },
      { name: "generic", node: createTestProcessedGenericNode() },
    ])("returns the given $name node when source doesn't define a post-processor", async ({ node }) => {
      expect(await createHierarchyDefinitionFromPathBased(createSource()).postProcessNode!({ node })).toBe(node);
    });

    it("throws when node has multiple instance keys", async () => {
      const postProcessNode = vi.fn();
      const node = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [instanceKey, { ...instanceKey, id: "0x3" }] },
      });
      await expect(
        createHierarchyDefinitionFromPathBased(createSource({ postProcessNode })).postProcessNode!({ node }),
      ).rejects.toThrow("don't support nodes with multiple instance keys");
      expect(postProcessNode).not.toHaveBeenCalled();
    });

    it("passes path of the non-grouping ancestors instead of the parent node", async () => {
      const node = createTestProcessedInstanceNode();
      const postProcessedNode = createTestProcessedInstanceNode({ label: "post-processed" });
      const postProcessNode = vi.fn(async () => postProcessedNode);
      const definition = createHierarchyDefinitionFromPathBased(createSource({ postProcessNode }));
      const groupingParentNode = createTestProcessedGroupingNode({
        key: groupingKey,
        parentKeys: [...parentNode.parentKeys, parentNode.key],
      });
      expect(await definition.postProcessNode!({ node, parentNode: groupingParentNode })).toBe(postProcessedNode);
      expect(postProcessNode).toHaveBeenCalledExactlyOnceWith({ node, path: expectedPath });
    });
  });
});

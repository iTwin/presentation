/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  GenericHierarchyNodeDefinition,
  HierarchyNodesDefinition,
  InstanceNodesQueryDefinition,
} from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import { createTestSourceGenericNode } from "../Utils.js";

describe("HierarchyNodesDefinition", () => {
  const genericNodeDefinition = createGenericNodeDefinition();
  const instanceNodesQueryDefinition = createInstanceNodesQueryDefinition();

  describe("isGenericNode", () => {
    it("returns correct result for different types of definitions", () => {
      expect(HierarchyNodesDefinition.isGenericNode(genericNodeDefinition)).toBe(true);
      expect(HierarchyNodesDefinition.isGenericNode(instanceNodesQueryDefinition)).toBe(false);
    });
  });

  describe("isInstanceNodesQuery", () => {
    it("returns correct result for different types of definitions", () => {
      expect(HierarchyNodesDefinition.isInstanceNodesQuery(genericNodeDefinition)).toBe(false);
      expect(HierarchyNodesDefinition.isInstanceNodesQuery(instanceNodesQueryDefinition)).toBe(true);
    });
  });
});

function createGenericNodeDefinition(props?: Partial<GenericHierarchyNodeDefinition>): GenericHierarchyNodeDefinition {
  return { node: createTestSourceGenericNode(), ...props };
}

function createInstanceNodesQueryDefinition(
  props?: Partial<InstanceNodesQueryDefinition>,
): InstanceNodesQueryDefinition {
  return { fullClassName: "full.class_name", query: { ecsql: "test ecsql" }, ...props };
}

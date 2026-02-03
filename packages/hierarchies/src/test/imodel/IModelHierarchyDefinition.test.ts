/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNodesDefinition } from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import { createTestSourceGenericNode } from "../Utils.js";

import type { GenericHierarchyNodeDefinition, InstanceNodesQueryDefinition } from "../../hierarchies/imodel/IModelHierarchyDefinition.js";

describe("HierarchyNodesDefinition", () => {
  const genericNodeDefinition = createGenericNodeDefinition();
  const instanceNodesQueryDefinition = createInstanceNodesQueryDefinition();

  describe("isGenericNode", () => {
    it("returns correct result for different types of definitions", () => {
      expect(HierarchyNodesDefinition.isGenericNode(genericNodeDefinition)).to.be.true;
      expect(HierarchyNodesDefinition.isGenericNode(instanceNodesQueryDefinition)).to.be.false;
    });
  });

  describe("isInstanceNodesQuery", () => {
    it("returns correct result for different types of definitions", () => {
      expect(HierarchyNodesDefinition.isInstanceNodesQuery(genericNodeDefinition)).to.be.false;
      expect(HierarchyNodesDefinition.isInstanceNodesQuery(instanceNodesQueryDefinition)).to.be.true;
    });
  });
});

function createGenericNodeDefinition(props?: Partial<GenericHierarchyNodeDefinition>): GenericHierarchyNodeDefinition {
  return {
    node: createTestSourceGenericNode(),
    ...props,
  };
}

function createInstanceNodesQueryDefinition(props?: Partial<InstanceNodesQueryDefinition>): InstanceNodesQueryDefinition {
  return {
    fullClassName: "full.class_name",
    query: {
      ecsql: "test ecsql",
    },
    ...props,
  };
}

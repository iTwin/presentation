/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import {
  ClassBasedHierarchyLevelDefinitionsFactory,
  CustomHierarchyNodeDefinition,
  HierarchyDefinitionParentNode,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  InstanceNodesQueryDefinition,
} from "../hierarchy-builder/HierarchyDefinition";
import { IMetadataProvider } from "../hierarchy-builder/Metadata";
import { createGetClassStub, createTestParsedCustomNode, TStubClassFunc } from "./Utils";

describe("HierarchyNodesDefinition", () => {
  const customNodeDefinition = createCustomNodeDefinition();
  const instanceNodesQueryDefinition = createInstanceNodesQueryDefinition();

  describe("isCustomNode", () => {
    it("returns correct result for different types of definitions", () => {
      expect(HierarchyNodesDefinition.isCustomNode(customNodeDefinition)).to.be.true;
      expect(HierarchyNodesDefinition.isCustomNode(instanceNodesQueryDefinition)).to.be.false;
    });
  });

  describe("isInstanceNodesQuery", () => {
    it("returns correct result for different types of definitions", () => {
      expect(HierarchyNodesDefinition.isInstanceNodesQuery(customNodeDefinition)).to.be.false;
      expect(HierarchyNodesDefinition.isInstanceNodesQuery(instanceNodesQueryDefinition)).to.be.true;
    });
  });
});

describe("ClassBasedHierarchyLevelDefinitionsFactory", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  let stubClass: TStubClassFunc;
  beforeEach(() => {
    stubClass = createGetClassStub(metadataProvider).stubClass;
  });

  it("returns root hierarchy level definition", async () => {
    const rootHierarchyLevel: HierarchyLevelDefinition = [createCustomNodeDefinition(), createInstanceNodesQueryDefinition()];
    const factory = new ClassBasedHierarchyLevelDefinitionsFactory({
      metadataProvider,
      hierarchy: {
        rootNodes: async () => rootHierarchyLevel,
        childNodes: [],
      },
    });
    const result = await factory.defineHierarchyLevel(undefined);
    expect(result).to.deep.eq(rootHierarchyLevel);
  });

  it("returns custom node children definition", async () => {
    const rootNode = createParentNode({ key: "test-custom-node" });

    const def1: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "1" }) })];
    const def2: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "2" }) })];
    const def3: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "3" }) })];
    const def4: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "4" }) })];

    const factory = new ClassBasedHierarchyLevelDefinitionsFactory({
      metadataProvider,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          // doesn't match parent node - should not be included
          {
            customParentNodeKey: "some-other-node",
            definitions: async () => def1,
          },
          // matches parent node - should be included
          {
            customParentNodeKey: "test-custom-node",
            definitions: async () => def2,
          },
          // not event a custom node def - should not be included
          {
            parentNodeClassName: "some.class",
            definitions: async () => def3,
          },
          // matches parent node - should be included
          {
            customParentNodeKey: "test-custom-node",
            definitions: async () => def4,
          },
          // matches parent node - should be included, but returns an empty list
          {
            customParentNodeKey: "test-custom-node",
            definitions: async () => [],
          },
        ],
      },
    });

    const result = await factory.defineHierarchyLevel(rootNode);
    expect(result).to.deep.eq([...def2, ...def4]);
  });

  it("returns instance node children definition when parent node is of definition class", async () => {
    const rootNode = createParentNode({
      key: {
        type: "instances",
        instanceKeys: [{ className: "TestSchema.ClassX", id: "0x1" }],
      },
    });

    stubClass({ schemaName: "TestSchema", className: "BaseOfX", is: async () => false });
    stubClass({ schemaName: "TestSchema", className: "ClassX", is: async (other) => other === "TestSchema.BaseOfX" });
    stubClass({ schemaName: "TestSchema", className: "DerivedFromX", is: async (other) => other === "TestSchema.ClassX" });
    stubClass({ schemaName: "TestSchema", className: "UnrelatedClass", is: async () => false });

    const def1: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "1" }) })];
    const def2: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "2" }) })];
    const def3: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "3" }) })];
    const def4: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "4" }) })];

    const factory = new ClassBasedHierarchyLevelDefinitionsFactory({
      metadataProvider,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          // not an instance node def - skip
          {
            customParentNodeKey: "custom-node",
            definitions: async () => def1,
          },
          // def for base class - should be included
          {
            parentNodeClassName: "TestSchema.BaseOfX",
            definitions: async () => def2,
          },
          // def for derived class - should not be included
          {
            parentNodeClassName: "TestSchema.DerivedFromX",
            definitions: async () => def3,
          },
          // def for unrelated class - should not be included
          {
            parentNodeClassName: "TestSchema.UnrelatedClass",
            definitions: async () => def4,
          },
          // def for base class - should be included, but the list is empty
          {
            parentNodeClassName: "TestSchema.BaseOfX",
            definitions: async () => [],
          },
        ],
      },
    });

    const result = await factory.defineHierarchyLevel(rootNode);
    expect(result).to.deep.eq([...def2]);
  });

  it("uses all parent instance node's instance IDs when creating child hierarchy level", async () => {
    const rootNode = createParentNode({
      key: {
        type: "instances",
        instanceKeys: [
          { className: "TestSchema.ClassX", id: "0x1" },
          { className: "TestSchema.ClassX", id: "0x2" },
        ],
      },
    });

    stubClass({ schemaName: "TestSchema", className: "ClassX", is: async (other) => other === "TestSchema.ClassX" });

    const spy = sinon.stub().resolves([]);
    const factory = new ClassBasedHierarchyLevelDefinitionsFactory({
      metadataProvider,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          {
            parentNodeClassName: "TestSchema.ClassX",
            definitions: spy,
          },
        ],
      },
    });

    const result = await factory.defineHierarchyLevel(rootNode);
    expect(spy).to.be.calledOnceWithExactly(["0x1", "0x2"], rootNode);
    expect(result).to.deep.eq([]);
  });
});

function createParentNode(src: Partial<HierarchyDefinitionParentNode>): HierarchyDefinitionParentNode {
  return {
    label: "test",
    key: "test",
    parentKeys: [],
    ...src,
  };
}

function createCustomNodeDefinition(props?: Partial<CustomHierarchyNodeDefinition>): CustomHierarchyNodeDefinition {
  return {
    node: createTestParsedCustomNode(),
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

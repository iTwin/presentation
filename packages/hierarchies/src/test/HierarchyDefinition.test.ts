/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import {
  createClassBasedHierarchyDefinition,
  CustomHierarchyNodeDefinition,
  DefineHierarchyLevelProps,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  InstanceNodesQueryDefinition,
} from "../hierarchies/HierarchyDefinition";
import { createClassHierarchyInspectorStub, createTestParsedCustomNode } from "./Utils";

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

describe("createClassBasedHierarchyDefinition", () => {
  let classHierarchyInspector: ReturnType<typeof createClassHierarchyInspectorStub>;
  beforeEach(() => {
    classHierarchyInspector = createClassHierarchyInspectorStub();
  });
  afterEach(() => {
    sinon.restore();
  });

  it("returns root hierarchy level definition", async () => {
    const rootHierarchyLevel: HierarchyLevelDefinition = [createCustomNodeDefinition(), createInstanceNodesQueryDefinition()];
    const factory = createClassBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => rootHierarchyLevel,
        childNodes: [],
      },
    });
    const result = await factory.defineHierarchyLevel({ parentNode: undefined });
    expect(result).to.deep.eq(rootHierarchyLevel);
  });

  it("returns custom node children definition", async () => {
    const rootNode = createParentNode({ key: "test-custom-node" });

    const def1: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "1" }) })];
    const def2: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "2" }) })];
    const def3: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "3" }) })];
    const def4: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "4" }) })];

    const factory = createClassBasedHierarchyDefinition({
      classHierarchyInspector,
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

    const result = await factory.defineHierarchyLevel({ parentNode: rootNode });
    expect(result).to.deep.eq([...def2, ...def4]);
  });

  it("returns instance node children definition when parent node is of definition class", async () => {
    const rootNode = createParentNode({
      key: {
        type: "instances",
        instanceKeys: [{ className: "TestSchema.ClassX", id: "0x1" }],
      },
    });

    classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "BaseOfX", is: async () => false });
    classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "ClassX", is: async (other) => other === "TestSchema.BaseOfX" });
    classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "DerivedFromX", is: async (other) => other === "TestSchema.ClassX" });
    classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "UnrelatedClass", is: async () => false });

    const def1: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "1" }) })];
    const def2: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "2" }) })];
    const def3: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "3" }) })];
    const def4: HierarchyLevelDefinition = [createCustomNodeDefinition({ node: createTestParsedCustomNode({ label: "4" }) })];

    const factory = createClassBasedHierarchyDefinition({
      classHierarchyInspector,
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

    const result = await factory.defineHierarchyLevel({ parentNode: rootNode });
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

    classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "ClassX", is: async (other) => other === "TestSchema.ClassX" });

    const spy = sinon.stub().resolves([]);
    const factory = createClassBasedHierarchyDefinition({
      classHierarchyInspector,
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

    const result = await factory.defineHierarchyLevel({ parentNode: rootNode });
    expect(spy).to.be.calledOnceWithExactly({ parentNodeClassName: "TestSchema.ClassX", parentNodeInstanceIds: ["0x1", "0x2"], parentNode: rootNode });
    expect(result).to.deep.eq([]);
  });

  it("doesn't apply instance node level definitions marked with `onlyIfNotHandled` flag if any of the previous ones have been applied", async () => {
    const rootNode = createParentNode({
      key: {
        type: "instances",
        instanceKeys: [{ className: "TestSchema.ClassX", id: "0x1" }],
      },
    });

    const baseClassName = "TestSchema.BaseClass";
    const derivedClassName = "TestSchema.ChildClass";

    classHierarchyInspector.stubEntityClass({
      schemaName: "TestSchema",
      className: "ClassX",
      is: async (other) => [baseClassName, derivedClassName].includes(other),
    });

    const derivedClassDefs = sinon.stub().resolves([]);
    const baseClassDefs = sinon.stub().resolves([]);
    let factory = createClassBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          {
            parentNodeClassName: derivedClassName,
            definitions: derivedClassDefs,
          },
          {
            parentNodeClassName: baseClassName,
            definitions: baseClassDefs,
            onlyIfNotHandled: true,
          },
        ],
      },
    });

    await factory.defineHierarchyLevel({ parentNode: rootNode });
    expect(derivedClassDefs).to.be.calledOnceWithExactly({ parentNodeClassName: "TestSchema.ClassX", parentNodeInstanceIds: ["0x1"], parentNode: rootNode });
    expect(baseClassDefs).not.to.be.called;

    factory = createClassBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          {
            parentNodeClassName: "",
            definitions: async () => [],
          },
          {
            parentNodeClassName: baseClassName,
            definitions: baseClassDefs,
            onlyIfNotHandled: true,
          },
        ],
      },
    });

    await factory.defineHierarchyLevel({ parentNode: rootNode });
    expect(baseClassDefs).to.be.calledOnceWithExactly({ parentNodeClassName: "TestSchema.ClassX", parentNodeInstanceIds: ["0x1"], parentNode: rootNode });
  });
});

function createParentNode(src: Partial<NonNullable<DefineHierarchyLevelProps["parentNode"]>>) {
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

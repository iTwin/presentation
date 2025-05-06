/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyLevelDefinition,
  InstanceNodesQueryDefinition,
} from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import { createPredicateBasedHierarchyDefinition } from "../../hierarchies/imodel/PredicateBasedHierarchyDefinition.js";
import { createClassHierarchyInspectorStub, createTestGenericNodeKey, createTestSourceGenericNode } from "../Utils.js";

describe("createPredicateBasedHierarchyDefinition", () => {
  let classHierarchyInspector: ReturnType<typeof createClassHierarchyInspectorStub>;
  beforeEach(() => {
    classHierarchyInspector = createClassHierarchyInspectorStub();
  });
  afterEach(() => {
    sinon.restore();
  });

  it("returns root hierarchy level definition", async () => {
    const rootHierarchyLevel: HierarchyLevelDefinition = [createGenericNodeDefinition(), createInstanceNodesQueryDefinition()];
    const factory = createPredicateBasedHierarchyDefinition({
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
    const rootNode = createParentNode({ key: createTestGenericNodeKey({ id: "test-custom-node" }) });

    const def1: HierarchyLevelDefinition = [createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "1" }) })];
    const def2: HierarchyLevelDefinition = [createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "2" }) })];
    const def3: HierarchyLevelDefinition = [createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "3" }) })];
    const def4: HierarchyLevelDefinition = [createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "4" }) })];

    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          // doesn't match parent node - should not be included
          {
            parentGenericNodePredicate: async (key) => key.id === "some-other-node",
            definitions: async () => def1,
          },
          // matches parent node - should be included
          {
            parentGenericNodePredicate: async (key) => key.id === "test-custom-node",
            definitions: async () => def2,
          },
          // not event a custom node def - should not be included
          {
            parentInstancesNodePredicate: "some.class",
            definitions: async () => def3,
          },
          // matches parent node - should be included
          {
            parentGenericNodePredicate: async (key) => key.id === "test-custom-node",
            definitions: async () => def4,
          },
          // matches parent node - should be included, but returns an empty list
          {
            parentGenericNodePredicate: async (key) => key.id === "test-custom-node",
            definitions: async () => [],
          },
        ],
      },
    });

    const result = await factory.defineHierarchyLevel({ parentNode: rootNode });
    expect(result).to.deep.eq([...def2, ...def4]);
  });

  it("returns instance node children definition when parent node matches predicate", async () => {
    const rootNode = createParentNode({
      key: {
        type: "instances",
        instanceKeys: [{ className: "TestSchema.ClassX", id: "0x1" }],
      },
    });

    const baseClass = classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "BaseOfX" });
    const xClass = classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "ClassX", baseClass });
    classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "DerivedFromX", baseClass: xClass });
    classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "UnrelatedClass" });

    const def1: HierarchyLevelDefinition = [createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "1" }) })];
    const def2: HierarchyLevelDefinition = [createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "2" }) })];
    const def3: HierarchyLevelDefinition = [createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "3" }) })];
    const def4: HierarchyLevelDefinition = [createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "4" }) })];
    const def5: HierarchyLevelDefinition = [createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "5" }) })];

    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          // not an instance node def - skip
          {
            parentGenericNodePredicate: async (key) => key.id === "custom-node",
            definitions: async () => def1,
          },
          // def for base class - should be included
          {
            parentInstancesNodePredicate: "TestSchema.BaseOfX",
            definitions: async () => def2,
          },
          // def for derived class - should not be included
          {
            parentInstancesNodePredicate: "TestSchema.DerivedFromX",
            definitions: async () => def3,
          },
          // def for unrelated class - should not be included
          {
            parentInstancesNodePredicate: "TestSchema.UnrelatedClass",
            definitions: async () => def4,
          },
          // def for base class - should be included, but the list is empty
          {
            parentInstancesNodePredicate: "TestSchema.BaseOfX",
            definitions: async () => [],
          },
          // def for matching predicate - should be included
          {
            parentInstancesNodePredicate: async () => true,
            definitions: async () => def5,
          },
        ],
      },
    });

    const result = await factory.defineHierarchyLevel({ parentNode: rootNode });
    expect(result).to.deep.eq([...def2, ...def5]);
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

    classHierarchyInspector.stubEntityClass({ schemaName: "TestSchema", className: "ClassX" });

    const spy = sinon.stub().resolves([]);
    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          {
            parentInstancesNodePredicate: "TestSchema.ClassX",
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

    const baseClass = classHierarchyInspector.stubEntityClass({
      schemaName: "TestSchema",
      className: "BaseClass",
    });
    const childClass = classHierarchyInspector.stubEntityClass({
      schemaName: "TestSchema",
      className: "ChildClass",
      baseClass,
    });
    classHierarchyInspector.stubEntityClass({
      schemaName: "TestSchema",
      className: "ClassX",
      baseClass: childClass,
    });

    const derivedClassDefs = sinon.stub().resolves([]);
    const baseClassDefs = sinon.stub().resolves([]);
    let factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          {
            parentInstancesNodePredicate: childClass.fullName,
            definitions: derivedClassDefs,
          },
          {
            parentInstancesNodePredicate: baseClass.fullName,
            definitions: baseClassDefs,
            onlyIfNotHandled: true,
          },
        ],
      },
    });

    await factory.defineHierarchyLevel({ parentNode: rootNode });
    expect(derivedClassDefs).to.be.calledOnceWithExactly({
      parentNodeClassName: "TestSchema.ClassX",
      parentNodeInstanceIds: ["0x1"],
      parentNode: rootNode,
    });
    expect(baseClassDefs).not.to.be.called;

    factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          {
            parentInstancesNodePredicate: "",
            definitions: async () => [],
          },
          {
            parentInstancesNodePredicate: baseClass.fullName,
            definitions: baseClassDefs,
            onlyIfNotHandled: true,
          },
        ],
      },
    });

    await factory.defineHierarchyLevel({ parentNode: rootNode });
    expect(baseClassDefs).to.be.calledOnceWithExactly({
      parentNodeClassName: "TestSchema.ClassX",
      parentNodeInstanceIds: ["0x1"],
      parentNode: rootNode,
    });
  });

  it("uses provided node parser", () => {
    const parseNode = sinon.stub();
    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      parseNode,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [],
      },
    });
    expect(factory.parseNode).to.eq(parseNode);
  });

  it("uses provided node pre-processor", () => {
    const preprocessor = sinon.stub();
    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      preProcessNode: preprocessor,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [],
      },
    });
    expect(factory.preProcessNode).to.eq(preprocessor);
  });

  it("uses provided node post-processor", () => {
    const postprocessor = sinon.stub();
    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      postProcessNode: postprocessor,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [],
      },
    });
    expect(factory.postProcessNode).to.eq(postprocessor);
  });
});

function createParentNode(src: Partial<NonNullable<DefineHierarchyLevelProps["parentNode"]>>) {
  return {
    label: "test",
    key: createTestGenericNodeKey(),
    parentKeys: [],
    ...src,
  };
}

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

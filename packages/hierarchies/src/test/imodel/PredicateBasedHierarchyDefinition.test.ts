/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPredicateBasedHierarchyDefinition } from "../../hierarchies/imodel/PredicateBasedHierarchyDefinition.js";
import { createIModelAccessStub, createTestGenericNodeKey, createTestSourceGenericNode } from "../Utils.js";

import type {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyLevelDefinition,
  InstanceNodesQueryDefinition,
} from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import type { NodesQueryClauseFactory } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";

describe("createPredicateBasedHierarchyDefinition", () => {
  const imodelKey = "test-imodel-key";

  let imodelAccess: ReturnType<typeof createIModelAccessStub> & { imodelKey: string };
  const nodeSelectClauseFactory: NodesQueryClauseFactory = {
    createSelectClause: vi.fn(),
    createFilterClauses: vi.fn(),
  };

  beforeEach(() => {
    imodelAccess = { ...createIModelAccessStub(), imodelKey };
  });

  function constProps(): Pick<DefineHierarchyLevelProps, "imodelAccess" | "nodeSelectClauseFactory"> {
    return { imodelAccess, nodeSelectClauseFactory };
  }

  it("returns root hierarchy level definition", async () => {
    const rootHierarchyLevel: HierarchyLevelDefinition = [
      createGenericNodeDefinition(),
      createInstanceNodesQueryDefinition(),
    ];
    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      hierarchy: { rootNodes: async () => rootHierarchyLevel, childNodes: [] },
    });
    const result = await factory.defineHierarchyLevel({ ...constProps(), parentNode: undefined });
    expect(result).toEqual(rootHierarchyLevel);
  });

  it("returns custom node children definition", async () => {
    const rootNode = createParentNode({ key: createTestGenericNodeKey({ id: "test-custom-node" }) });

    const def1: HierarchyLevelDefinition = [
      createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "1" }) }),
    ];
    const def2: HierarchyLevelDefinition = [
      createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "2" }) }),
    ];
    const def3: HierarchyLevelDefinition = [
      createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "3" }) }),
    ];
    const def4: HierarchyLevelDefinition = [
      createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "4" }) }),
    ];

    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          // doesn't match parent node - should not be included
          { parentGenericNodePredicate: async (key) => key.id === "some-other-node", definitions: async () => def1 },
          // matches parent node - should be included
          { parentGenericNodePredicate: async (key) => key.id === "test-custom-node", definitions: async () => def2 },
          // not event a custom node def - should not be included
          { parentInstancesNodePredicate: "some.class", definitions: async () => def3 },
          // matches parent node - should be included
          { parentGenericNodePredicate: async (key) => key.id === "test-custom-node", definitions: async () => def4 },
          // matches parent node - should be included, but returns an empty list
          { parentGenericNodePredicate: async (key) => key.id === "test-custom-node", definitions: async () => [] },
        ],
      },
    });

    const result = await factory.defineHierarchyLevel({ ...constProps(), parentNode: rootNode });
    expect(result).toEqual([...def2, ...def4]);
  });

  it("returns instance node children definition when parent node matches predicate", async () => {
    const rootNode = createParentNode({
      key: { type: "instances", instanceKeys: [{ className: "TestSchema.ClassX", id: "0x1" }] },
    });

    const baseClass = imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "BaseOfX" });
    const xClass = imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "ClassX", baseClass });
    imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "DerivedFromX", baseClass: xClass });
    imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "UnrelatedClass" });

    const def1: HierarchyLevelDefinition = [
      createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "1" }) }),
    ];
    const def2: HierarchyLevelDefinition = [
      createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "2" }) }),
    ];
    const def3: HierarchyLevelDefinition = [
      createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "3" }) }),
    ];
    const def4: HierarchyLevelDefinition = [
      createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "4" }) }),
    ];
    const def5: HierarchyLevelDefinition = [
      createGenericNodeDefinition({ node: createTestSourceGenericNode({ label: "5" }) }),
    ];

    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          // not an instance node def - skip
          { parentGenericNodePredicate: async (key) => key.id === "custom-node", definitions: async () => def1 },
          // def for base class - should be included
          { parentInstancesNodePredicate: "TestSchema.BaseOfX", definitions: async () => def2 },
          // def for derived class - should not be included
          { parentInstancesNodePredicate: "TestSchema.DerivedFromX", definitions: async () => def3 },
          // def for unrelated class - should not be included
          { parentInstancesNodePredicate: "TestSchema.UnrelatedClass", definitions: async () => def4 },
          // def for base class - should be included, but the list is empty
          { parentInstancesNodePredicate: "TestSchema.BaseOfX", definitions: async () => [] },
          // def for matching predicate - should be included
          { parentInstancesNodePredicate: async () => true, definitions: async () => def5 },
        ],
      },
    });

    const result = await factory.defineHierarchyLevel({ ...constProps(), parentNode: rootNode });
    expect(result).toEqual([...def2, ...def5]);
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

    imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "ClassX" });

    const spy = vi.fn().mockResolvedValue([]);
    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [{ parentInstancesNodePredicate: "TestSchema.ClassX", definitions: spy }],
      },
    });

    const result = await factory.defineHierarchyLevel({ ...constProps(), parentNode: rootNode });
    expect(spy).toHaveBeenCalledExactlyOnceWith({
      ...constProps(),
      parentNodeClassName: "TestSchema.ClassX",
      parentNodeInstanceIds: ["0x1", "0x2"],
      parentNode: rootNode,
    });
    expect(result).toEqual([]);
  });

  it("doesn't apply instance node level definitions marked with `onlyIfNotHandled` flag if any of the previous ones have been applied", async () => {
    const unrelatedClass = imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "UnrelatedClass" });
    const baseClass = imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "BaseClass" });
    const childClass = imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "ChildClass", baseClass });
    const classX = imodelAccess.stubEntityClass({
      schemaName: "TestSchema",
      className: "ClassX",
      baseClass: childClass,
    });

    const rootNode = createParentNode({
      key: { type: "instances", instanceKeys: [{ className: classX.fullName, id: "0x1" }] },
    });

    const derivedClassDefs = vi.fn().mockResolvedValue([]);
    const baseClassDefs = vi.fn().mockResolvedValue([]);
    let factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          { parentInstancesNodePredicate: childClass.fullName, definitions: derivedClassDefs },
          { parentInstancesNodePredicate: baseClass.fullName, definitions: baseClassDefs, onlyIfNotHandled: true },
        ],
      },
    });

    await factory.defineHierarchyLevel({ ...constProps(), parentNode: rootNode });
    expect(derivedClassDefs).toHaveBeenCalledExactlyOnceWith({
      ...constProps(),
      parentNodeClassName: "TestSchema.ClassX",
      parentNodeInstanceIds: ["0x1"],
      parentNode: rootNode,
    });
    expect(baseClassDefs).not.toHaveBeenCalled();

    factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      hierarchy: {
        rootNodes: async () => [],
        childNodes: [
          { parentInstancesNodePredicate: unrelatedClass.fullName, definitions: async () => [] },
          { parentInstancesNodePredicate: baseClass.fullName, definitions: baseClassDefs, onlyIfNotHandled: true },
        ],
      },
    });

    await factory.defineHierarchyLevel({ ...constProps(), parentNode: rootNode });
    expect(baseClassDefs).toHaveBeenCalledExactlyOnceWith({
      ...constProps(),
      parentNodeClassName: "TestSchema.ClassX",
      parentNodeInstanceIds: ["0x1"],
      parentNode: rootNode,
    });
  });

  it("uses provided node parser", () => {
    const parseNode = vi.fn();
    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      parseNode,
      hierarchy: { rootNodes: async () => [], childNodes: [] },
    });
    expect(factory.parseNode).toBe(parseNode);
  });

  it("uses provided node pre-processor", () => {
    const preprocessor = vi.fn();
    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      preProcessNode: preprocessor,
      hierarchy: { rootNodes: async () => [], childNodes: [] },
    });
    expect(factory.preProcessNode).toBe(preprocessor);
  });

  it("uses provided node post-processor", () => {
    const postprocessor = vi.fn();
    const factory = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      postProcessNode: postprocessor,
      hierarchy: { rootNodes: async () => [], childNodes: [] },
    });
    expect(factory.postProcessNode).toBe(postprocessor);
  });
});

function createParentNode(src: Partial<NonNullable<DefineHierarchyLevelProps["parentNode"]>>) {
  return { label: "test", key: createTestGenericNodeKey(), parentKeys: [], ...src };
}

function createGenericNodeDefinition(props?: Partial<GenericHierarchyNodeDefinition>): GenericHierarchyNodeDefinition {
  return { node: createTestSourceGenericNode(), ...props };
}

function createInstanceNodesQueryDefinition(
  props?: Partial<InstanceNodesQueryDefinition>,
): InstanceNodesQueryDefinition {
  return { fullClassName: "full.class_name", query: { ecsql: "test ecsql" }, ...props };
}

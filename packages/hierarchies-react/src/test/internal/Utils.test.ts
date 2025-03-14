/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { createNodeId, safeDispose, sameNodes } from "../../presentation-hierarchies-react/internal/Utils.js";
import { createTestGroupingNode, createTestHierarchyNode } from "../TestUtils.js";

describe("createNodeId", () => {
  it("creates id for `generic` node", () => {
    const node = createTestHierarchyNode({ id: "custom", key: { type: "generic", id: "custom", source: "s" } });
    expect(createNodeId(node)).to.be.eq("generic,custom,s");
  });

  it("creates id for `instances` node", () => {
    const node = createTestHierarchyNode({
      id: "custom",
      key: {
        type: "instances",
        instanceKeys: [
          { id: "0x1", className: "Schema:Class" },
          { id: "0x2", className: "Schema:Class" },
        ],
      },
    });
    expect(createNodeId(node)).to.be.eq("instances,0x1,Schema:Class,0x2,Schema:Class");
  });

  it("creates id for `class-grouping` node", () => {
    const node = createTestGroupingNode({
      id: "custom",
      key: {
        type: "class-grouping",
        className: "Schema:Class",
      },
      groupedInstanceKeys: [{ id: "0x1", className: "Schema:Class" }],
    });
    expect(createNodeId(node)).to.be.eq("class-grouping,Schema:Class");
  });

  it("creates id for `label-grouping` node", () => {
    const node = createTestGroupingNode({
      id: "custom",
      key: {
        type: "label-grouping",
        label: "TestLabel",
      },
      groupedInstanceKeys: [{ id: "0x1", className: "Schema:Class" }],
    });
    expect(createNodeId(node)).to.be.eq("label-grouping,TestLabel");
  });

  it("creates id for `property-grouping:value` node", () => {
    const node = createTestGroupingNode({
      id: "custom",
      key: {
        type: "property-grouping:value",
        formattedPropertyValue: "test-value",
        propertyClassName: "TestClass",
        propertyName: "TestProp",
      },
      groupedInstanceKeys: [{ id: "0x1", className: "Schema:Class" }],
    });
    expect(createNodeId(node)).to.be.eq("property-grouping:value,test-value,TestClass,TestProp");
  });

  it("creates id for `instances` node child node", () => {
    const node = createTestHierarchyNode({
      id: "custom",
      key: {
        type: "instances",
        instanceKeys: [{ id: "0x3", className: "Schema:Class" }],
      },
      parentKeys: [
        { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] },
        { type: "class-grouping", className: "Schema:OtherClass" },
      ],
    });
    expect(createNodeId(node)).to.be.eq("instances,0x1,Schema:Class;class-grouping,Schema:OtherClass;instances,0x3,Schema:Class");
  });
});

describe("sameNodes", () => {
  it("compares same `generic` nodes", () => {
    const lhs = createTestHierarchyNode({ id: "lhs", key: { type: "generic", id: "custom", source: "s" } });
    const rhs = createTestHierarchyNode({ id: "rhs", key: { type: "generic", id: "custom", source: "s" } });
    expect(sameNodes(lhs, rhs)).to.be.true;
  });

  it("compares same `instance` nodes", () => {
    const lhs = createTestHierarchyNode({ id: "lhs", key: { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] } });
    const rhs = createTestHierarchyNode({ id: "rhs", key: { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] } });
    expect(sameNodes(lhs, rhs)).to.be.true;
  });

  it("compares same `class-grouping` nodes", () => {
    const lhs = createTestGroupingNode({ id: "lhs", key: { type: "class-grouping", className: "Schema:Class" } });
    const rhs = createTestGroupingNode({ id: "rhs", key: { type: "class-grouping", className: "Schema:Class" } });
    expect(sameNodes(lhs, rhs)).to.be.true;
  });

  it("compares same child nodes", () => {
    const lhs = createTestHierarchyNode({
      id: "lhs",
      key: { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] },
      parentKeys: [{ type: "instances", instanceKeys: [{ id: "0x2", className: "Schema:Class" }] }],
    });
    const rhs = createTestHierarchyNode({
      id: "rhs",
      key: { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] },
      parentKeys: [{ type: "instances", instanceKeys: [{ id: "0x2", className: "Schema:Class" }] }],
    });
    expect(sameNodes(lhs, rhs)).to.be.true;
  });

  it("compares different `instance` nodes", () => {
    const lhs = createTestHierarchyNode({ id: "lhs", key: { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] } });
    const rhs = createTestHierarchyNode({ id: "rhs", key: { type: "instances", instanceKeys: [{ id: "0x2", className: "Schema:Class" }] } });
    expect(sameNodes(lhs, rhs)).to.be.false;
  });

  it("compares child nodes from different levels", () => {
    const lhs = createTestHierarchyNode({
      id: "lhs",
      key: { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] },
      parentKeys: [{ type: "instances", instanceKeys: [{ id: "0x2", className: "Schema:Class" }] }],
    });
    const rhs = createTestHierarchyNode({
      id: "rhs",
      key: { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] },
      parentKeys: [{ type: "instances", instanceKeys: [{ id: "0x3", className: "Schema:Class" }] }],
    });
    expect(sameNodes(lhs, rhs)).to.be.false;
  });

  it("compares child nodes from different depths", () => {
    const lhs = createTestHierarchyNode({
      id: "lhs",
      key: { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] },
      parentKeys: [{ type: "instances", instanceKeys: [{ id: "0x2", className: "Schema:Class" }] }],
    });
    const rhs = createTestHierarchyNode({
      id: "rhs",
      key: { type: "instances", instanceKeys: [{ id: "0x1", className: "Schema:Class" }] },
      parentKeys: [
        { type: "instances", instanceKeys: [{ id: "0x2", className: "Schema:Class" }] },
        { type: "instances", instanceKeys: [{ id: "0x3", className: "Schema:Class" }] },
      ],
    });
    expect(sameNodes(lhs, rhs)).to.be.false;
  });
});

describe("safeDispose", () => {
  it("disposes object with `Symbol.dispose` method", () => {
    const disposable = { [Symbol.dispose]: sinon.stub() };
    safeDispose(disposable);
    expect(disposable[Symbol.dispose]).to.be.calledOnce;
  });

  it("disposes object with `dispose` method", () => {
    const disposable = { dispose: sinon.stub() };
    safeDispose(disposable);
    expect(disposable.dispose).to.be.calledOnce;
  });

  it("does nothing with non-disposable object", () => {
    const disposable = { x: 123 };
    expect(() => safeDispose(disposable)).to.not.throw();
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import sinon from "sinon";
import { Id64, Logger, LogLevel } from "@itwin/core-bentley";
import { ECClass, SchemaContext } from "@itwin/ecschema-metadata";
import { HierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import * as common from "../../../hierarchy-builder/internal/Common";
import { createClassGroupingOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/ClassGrouping";
import { createTestNode, getObservableResult } from "../../Utils";

describe("ClassGrouping", () => {
  before(() => {
    Logger.initializeToConsole();
    Logger.turnOffCategories();
    Logger.setLevel(LOGGING_NAMESPACE, LogLevel.Trace);
  });

  const schemas = {} as unknown as SchemaContext;
  let getClassStub: sinon.SinonStub<[SchemaContext, string], Promise<ECClass>>;
  beforeEach(() => {
    getClassStub = sinon.stub(common, "getClass");
  });

  function stubClass(schemaName: string, className: string, classLabel?: string) {
    const fullName = `${schemaName}:${className}`;
    getClassStub.withArgs(schemas, fullName).resolves({
      fullName,
      name: className,
      label: classLabel,
    } as unknown as ECClass);
    return {
      id: Id64.invalid,
      name: fullName,
      label: classLabel ?? className,
    };
  }

  it("doesn't group non-instance nodes", async () => {
    const nodes: HierarchyNode[] = [
      {
        label: "custom",
        key: "test",
        children: false,
      },
    ];
    const result = await getObservableResult(from(nodes).pipe(createClassGroupingOperator(schemas)));
    expect(result).to.deep.eq(nodes);
  });

  it("groups one instance node", async () => {
    const nodes = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:TestClass", id: "0x1" }] },
        params: { groupByClass: true },
      }),
    ];
    const classInfo = stubClass("TestSchema", "TestClass");
    const result = await getObservableResult(from(nodes).pipe(createClassGroupingOperator(schemas)));
    expect(result).to.deep.eq([
      {
        label: "TestClass",
        key: {
          type: "class-grouping",
          class: classInfo,
        },
        children: nodes,
      },
    ] as HierarchyNode[]);
  });

  it("groups multiple instance nodes", async () => {
    const nodes = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
        params: { groupByClass: true },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:B", id: "0x2" }] },
        label: "2",
        params: { groupByClass: true },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x3" }] },
        label: "3",
        params: { groupByClass: true },
      }),
    ];
    const classA = stubClass("TestSchema", "A", "Class A");
    const classB = stubClass("TestSchema", "B", "Class B");
    const result = await getObservableResult(from(nodes).pipe(createClassGroupingOperator(schemas)));
    expect(result).to.deep.eq([
      {
        label: "Class A",
        key: {
          type: "class-grouping",
          class: classA,
        },
        children: [nodes[0], nodes[2]],
      },
      {
        label: "Class B",
        key: {
          type: "class-grouping",
          class: classB,
        },
        children: [nodes[1]],
      },
    ] as HierarchyNode[]);
  });

  it("groups some input nodes", async () => {
    const nodes = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x1" }] },
        label: "1",
        params: { groupByClass: true },
      }),
      createTestNode({
        key: "custom",
        label: "custom",
        params: { groupByClass: true },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema:A", id: "0x2" }] },
        label: "2",
        params: { groupByClass: true },
      }),
    ];
    const classA = stubClass("TestSchema", "A", "Class A");
    const result = await getObservableResult(from(nodes).pipe(createClassGroupingOperator(schemas)));
    expect(result).to.deep.eq([
      {
        label: "Class A",
        key: {
          type: "class-grouping",
          class: classA,
        },
        children: [nodes[0], nodes[2]],
      },
      nodes[1],
    ] as HierarchyNode[]);
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { HierarchyNode } from "../../../../hierarchy-builder/HierarchyNode";
import { createGroupingOperator } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { IMetadataProvider } from "../../../../hierarchy-builder/Metadata";
import { createGetClassStub, createTestNode, getObservableResult, TStubClassFunc } from "../../../Utils";

describe("ClassGrouping", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  let stubClass: TStubClassFunc;
  beforeEach(() => {
    stubClass = createGetClassStub(metadataProvider).stubClass;
  });

  it("doesn't group non-instance nodes", async () => {
    const nodes: HierarchyNode[] = [
      {
        label: "custom",
        key: "test",
        children: false,
        params: { grouping: { byClass: true } },
      },
    ];
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq(nodes);
  });

  it("groups one instance node", async () => {
    const nodes = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        params: { grouping: { byClass: true } },
      }),
    ];
    const classInfo = stubClass({ schemaName: "TestSchema", className: "TestClass" });
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
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
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
        params: { grouping: { byClass: true } },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
        label: "2",
        params: { grouping: { byClass: true } },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x3" }] },
        label: "3",
        params: { grouping: { byClass: true } },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x4" }] },
        label: "4",
      }),
    ];
    const classA = stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A" });
    const classB = stubClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B" });
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq([
      nodes[3],
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
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
        params: { grouping: { byClass: true } },
      }),
      createTestNode({
        key: "custom",
        label: "custom",
        params: { grouping: { byClass: true } },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x2" }] },
        label: "2",
        params: { grouping: { byClass: true } },
      }),
    ];
    const classA = stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A" });
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
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

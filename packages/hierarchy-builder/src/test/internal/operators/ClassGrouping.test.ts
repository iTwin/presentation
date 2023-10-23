/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { LogLevel } from "@itwin/core-bentley";
import { HierarchyNode, ProcessedHierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createClassGroupingOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/ClassGrouping";
import { IMetadataProvider } from "../../../hierarchy-builder/Metadata";
import { createGetClassStub, createTestProcessedNode, getObservableResult, setupLogging, TStubClassFunc } from "../../Utils";

describe("ClassGrouping", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  const metadataProvider = {} as unknown as IMetadataProvider;
  let stubClass: TStubClassFunc;
  beforeEach(() => {
    stubClass = createGetClassStub(metadataProvider).stubClass;
  });

  it("doesn't group non-instance nodes", async () => {
    const nodes = [
      createTestProcessedNode({
        label: "custom",
        key: "test",
        children: false,
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createClassGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq(nodes);
  });

  it("groups one instance node", async () => {
    const nodes = [
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        processingParams: { groupByClass: true },
      }),
    ];
    const classInfo = stubClass({ schemaName: "TestSchema", className: "TestClass" });
    const result = await getObservableResult(from(nodes).pipe(createClassGroupingOperator(metadataProvider)));
    const expectedClassGroupingNodeKey = {
      type: "class-grouping",
      class: classInfo,
    };
    expect(result).to.deep.eq([
      {
        label: "TestClass",
        key: expectedClassGroupingNodeKey,
        parentKeys: [],
        children: nodes.map((gn) => ({ ...gn, parentKeys: [expectedClassGroupingNodeKey] })),
      },
    ] as ProcessedHierarchyNode[]);
  });

  it("groups multiple instance nodes", async () => {
    const nodes = [
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
        processingParams: { groupByClass: true },
      }),
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
        label: "2",
        processingParams: { groupByClass: true },
      }),
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x3" }] },
        label: "3",
        processingParams: { groupByClass: true },
      }),
    ];
    const classA = stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A" });
    const classB = stubClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B" });
    const result = await getObservableResult(from(nodes).pipe(createClassGroupingOperator(metadataProvider)));
    const expectedClassAGroupingNodeKey = {
      type: "class-grouping",
      class: classA,
    };
    const expectedClassBGroupingNodeKey = {
      type: "class-grouping",
      class: classB,
    };
    expect(result).to.deep.eq([
      {
        label: "Class A",
        key: expectedClassAGroupingNodeKey,
        parentKeys: [],
        children: [nodes[0], nodes[2]].map((gn) => ({ ...gn, parentKeys: [expectedClassAGroupingNodeKey] })),
      },
      {
        label: "Class B",
        key: expectedClassBGroupingNodeKey,
        parentKeys: [],
        children: [nodes[1]].map((gn) => ({ ...gn, parentKeys: [expectedClassBGroupingNodeKey] })),
      },
    ] as ProcessedHierarchyNode[]);
  });

  it("groups some input nodes", async () => {
    const nodes = [
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
        processingParams: { groupByClass: true },
      }),
      createTestProcessedNode({
        key: "custom",
        label: "custom",
        processingParams: { groupByClass: true },
      }),
      createTestProcessedNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x2" }] },
        label: "2",
        processingParams: { groupByClass: true },
      }),
    ];
    const classA = stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A" });
    const result = await getObservableResult(from(nodes).pipe(createClassGroupingOperator(metadataProvider)));
    const expectedClassAGroupingNodeKey = {
      type: "class-grouping",
      class: classA,
    };
    expect(result).to.deep.eq([
      {
        label: "Class A",
        key: expectedClassAGroupingNodeKey,
        parentKeys: [],
        children: [nodes[0], nodes[2]].map((gn) => ({ ...gn, parentKeys: [expectedClassAGroupingNodeKey] })),
      },
      nodes[1],
    ] as HierarchyNode[]);
  });
});

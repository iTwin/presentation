/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { GroupingNodeKey } from "../../../../hierarchies/HierarchyNodeKey";
import { GroupingHandlerResult } from "../../../../hierarchies/internal/operators/Grouping";
import { createClassGroups } from "../../../../hierarchies/internal/operators/grouping/ClassGrouping";
import { createECSchemaProviderStub, createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../../../Utils";

describe("ClassGrouping", () => {
  let schemaProvider: ReturnType<typeof createECSchemaProviderStub>;

  beforeEach(() => {
    schemaProvider = createECSchemaProviderStub();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("groups one instance node", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        parentKeys: ["x"],
        processingParams: { grouping: { byClass: true } },
      }),
    ];
    const classInfo = schemaProvider.stubEntityClass({ schemaName: "TestSchema", className: "TestClass" });
    const expectedClassGroupingNodeKey: GroupingNodeKey = {
      type: "class-grouping",
      className: classInfo.fullName,
    };
    expect(await createClassGroups(schemaProvider, undefined, nodes)).to.deep.eq({
      groupingType: "class",
      grouped: [
        {
          label: "TestClass",
          key: expectedClassGroupingNodeKey,
          parentKeys: ["x"],
          groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
          children: nodes.map((gn) => ({ ...gn, parentKeys: ["x", expectedClassGroupingNodeKey] })),
        },
      ],
      ungrouped: [],
    } as GroupingHandlerResult);
  });

  it("groups multiple instance nodes", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        parentKeys: ["x"],
        label: "1",
        processingParams: { grouping: { byClass: true } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x2" }] },
        parentKeys: ["x"],
        label: "2",
        processingParams: { grouping: { byClass: true } },
      }),
    ];
    const classA = schemaProvider.stubEntityClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A" });
    const expectedClassGroupingNodeKey: GroupingNodeKey = {
      type: "class-grouping",
      className: classA.fullName,
    };
    expect(await createClassGroups(schemaProvider, undefined, nodes)).to.deep.eq({
      groupingType: "class",
      grouped: [
        {
          label: "Class A",
          key: expectedClassGroupingNodeKey,
          parentKeys: ["x"],
          groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
          children: nodes.map((gn) => ({ ...gn, parentKeys: ["x", expectedClassGroupingNodeKey] })),
        },
      ],
      ungrouped: [],
    });
  });

  it("creates different groups for nodes of different classes", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        parentKeys: ["x"],
        label: "1",
        processingParams: { grouping: { byClass: true } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
        parentKeys: ["x"],
        label: "2",
        processingParams: { grouping: { byClass: true } },
      }),
    ];
    const classA = schemaProvider.stubEntityClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A" });
    const expectedClassAGroupingNodeKey: GroupingNodeKey = {
      type: "class-grouping",
      className: classA.fullName,
    };
    const classB = schemaProvider.stubEntityClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B" });
    const expectedClassBGroupingNodeKey: GroupingNodeKey = {
      type: "class-grouping",
      className: classB.fullName,
    };
    expect(await createClassGroups(schemaProvider, undefined, nodes)).to.deep.eq({
      groupingType: "class",
      grouped: [
        {
          label: "Class A",
          key: expectedClassAGroupingNodeKey,
          parentKeys: ["x"],
          groupedInstanceKeys: nodes[0].key.instanceKeys,
          children: [nodes[0]].map((gn) => ({ ...gn, parentKeys: ["x", expectedClassAGroupingNodeKey] })),
        },
        {
          label: "Class B",
          key: expectedClassBGroupingNodeKey,
          parentKeys: ["x"],
          groupedInstanceKeys: nodes[1].key.instanceKeys,
          children: [nodes[1]].map((gn) => ({ ...gn, parentKeys: ["x", expectedClassBGroupingNodeKey] })),
        },
      ],
      ungrouped: [],
    });
  });

  it("doesn't create duplicate class group", async () => {
    const parentNode = createTestProcessedGroupingNode({
      key: {
        type: "class-grouping",
        className: "TestSchema.TestClass",
      },
    });
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        parentKeys: ["x"],
        processingParams: { grouping: { byClass: true } },
      }),
    ];
    schemaProvider.stubEntityClass({ schemaName: "TestSchema", className: "TestClass" });
    expect(await createClassGroups(schemaProvider, parentNode, nodes)).to.deep.eq({
      groupingType: "class",
      grouped: [],
      ungrouped: nodes,
    } as GroupingHandlerResult);
  });
});

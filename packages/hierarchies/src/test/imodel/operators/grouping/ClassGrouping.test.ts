/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { createClassGroups } from "../../../../hierarchies/imodel/operators/grouping/ClassGrouping.js";
import { createECSchemaProviderStub, createTestGenericNodeKey, createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../../../Utils.js";

import type { GroupingNodeKey } from "../../../../hierarchies/HierarchyNodeKey.js";
import type { GroupingHandlerResult } from "../../../../hierarchies/imodel/operators/Grouping.js";

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
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
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
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
          children: nodes.map((gn) => ({ ...gn, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedClassGroupingNodeKey] })),
        },
      ],
      ungrouped: [],
    } as GroupingHandlerResult);
  });

  it("groups multiple instance nodes", async () => {
    // note: class names are intentionally in different casing & format to ensure we support that
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byClass: true } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "testSchema.a", id: "0x2" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
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
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
          children: nodes.map((gn) => ({ ...gn, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedClassGroupingNodeKey] })),
        },
      ],
      ungrouped: [],
    });
  });

  it("creates different groups for nodes of different classes", async () => {
    const nodes = [
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
        label: "1",
        processingParams: { grouping: { byClass: true } },
      }),
      createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
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
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes[0].key.instanceKeys,
          children: [nodes[0]].map((gn) => ({ ...gn, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedClassAGroupingNodeKey] })),
        },
        {
          label: "Class B",
          key: expectedClassBGroupingNodeKey,
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          groupedInstanceKeys: nodes[1].key.instanceKeys,
          children: [nodes[1]].map((gn) => ({ ...gn, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedClassBGroupingNodeKey] })),
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
        parentKeys: [createTestGenericNodeKey({ id: "x" })],
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

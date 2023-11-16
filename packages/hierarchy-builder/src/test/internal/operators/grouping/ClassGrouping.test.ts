/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { IMetadataProvider } from "../../../../hierarchy-builder/ECMetadata";
import { GroupingNodeKey } from "../../../../hierarchy-builder/HierarchyNode";
import { GroupingHandlerResult } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { createClassGroups } from "../../../../hierarchy-builder/internal/operators/grouping/ClassGrouping";
import { createGetClassStub, createTestProcessedInstanceNode, TStubClassFunc } from "../../../Utils";

describe("ClassGrouping", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  let stubClass: TStubClassFunc;
  beforeEach(() => {
    stubClass = createGetClassStub(metadataProvider).stubClass;
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
    const classInfo = stubClass({ schemaName: "TestSchema", className: "TestClass" });
    const expectedClassGroupingNodeKey: GroupingNodeKey = {
      type: "class-grouping",
      class: classInfo,
    };
    expect(await createClassGroups(metadataProvider, nodes)).to.deep.eq({
      groupingType: "class",
      grouped: [
        {
          label: "TestClass",
          key: expectedClassGroupingNodeKey,
          parentKeys: ["x"],
          children: nodes.map((gn) => ({ ...gn, parentKeys: [...gn.parentKeys, expectedClassGroupingNodeKey] })),
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
    const classA = stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A" });
    const expectedClassGroupingNodeKey: GroupingNodeKey = {
      type: "class-grouping",
      class: classA,
    };
    expect(await createClassGroups(metadataProvider, nodes)).to.deep.eq({
      groupingType: "class",
      grouped: [
        {
          label: "Class A",
          key: expectedClassGroupingNodeKey,
          parentKeys: ["x"],
          children: nodes.map((gn) => ({ ...gn, parentKeys: [...gn.parentKeys, expectedClassGroupingNodeKey] })),
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
    const classA = stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A" });
    const expectedClassAGroupingNodeKey: GroupingNodeKey = {
      type: "class-grouping",
      class: classA,
    };
    const classB = stubClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B" });
    const expectedClassBGroupingNodeKey: GroupingNodeKey = {
      type: "class-grouping",
      class: classB,
    };
    expect(await createClassGroups(metadataProvider, nodes)).to.deep.eq({
      groupingType: "class",
      grouped: [
        {
          label: "Class A",
          key: expectedClassAGroupingNodeKey,
          parentKeys: ["x"],
          children: [nodes[0]].map((gn) => ({ ...gn, parentKeys: [...gn.parentKeys, expectedClassAGroupingNodeKey] })),
        },
        {
          label: "Class B",
          key: expectedClassBGroupingNodeKey,
          parentKeys: ["x"],
          children: [nodes[1]].map((gn) => ({ ...gn, parentKeys: [...gn.parentKeys, expectedClassBGroupingNodeKey] })),
        },
      ],
      ungrouped: [],
    });
  });
});

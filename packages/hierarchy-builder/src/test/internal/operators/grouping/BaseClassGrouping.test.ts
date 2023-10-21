/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { HierarchyNode } from "../../../../hierarchy-builder/HierarchyNode";
import { createGroupingOperator } from "../../../../hierarchy-builder/internal/operators/Grouping";
import { IMetadataProvider } from "../../../../hierarchy-builder/Metadata";
import { createGetClassStub, createTestNode, getObservableResult, isMock, TStubClassFunc } from "../../../Utils";

describe("BaseClassGrouping", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  let stubClass: TStubClassFunc;
  beforeEach(() => {
    stubClass = createGetClassStub(metadataProvider).stubClass;
  });

  it("does not group non-instance nodes", async () => {
    const nodes: HierarchyNode[] = [
      {
        label: "custom",
        key: "test",
        children: false,
        params: {
          grouping: {
            byBaseClasses: {
              fullClassNames: ["CustomSchema.CustomClass"],
            },
          },
        },
      },
    ];
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq(nodes);
  });

  it("does not group if not entity or relationship baseClass", async () => {
    const nodes = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        params: {
          grouping: {
            byBaseClasses: {
              fullClassNames: ["TestSchema.TestParentClass"],
            },
          },
        },
      }),
    ];
    stubClass({ schemaName: "TestSchema", className: "TestClass", is: isMock });
    stubClass({
      schemaName: "TestSchema",
      className: "TestParentClass",
      classLabel: "TestSchema.TestParentClass",
      isEntityClass: () => false,
      isRelationshipClass: () => false,
    });
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq(nodes);
  });

  it("groups one instance node", async () => {
    const nodes = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        params: {
          grouping: {
            byBaseClasses: {
              fullClassNames: ["TestSchema.TestParentClass"],
            },
          },
        },
      }),
    ];
    stubClass({ schemaName: "TestSchema", className: "TestClass", is: isMock });
    const parentClassInfo = stubClass({
      schemaName: "TestSchema",
      className: "TestParentClass",
      classLabel: "TestSchema.TestParentClass",
      isEntityClass: () => true,
      isRelationshipClass: () => true,
    });
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq([
      {
        label: "TestSchema.TestParentClass",
        key: {
          type: "class-grouping",
          class: parentClassInfo,
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
        params: {
          grouping: {
            byBaseClasses: {
              fullClassNames: ["TestSchema.TestParentClassA"],
            },
          },
        },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
        label: "2",
        params: {
          grouping: {
            byBaseClasses: {
              fullClassNames: ["TestSchema.TestParentClassB"],
            },
          },
        },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x3" }] },
        label: "3",
        params: {
          grouping: {
            byBaseClasses: {
              fullClassNames: ["TestSchema.TestParentClassA"],
            },
          },
        },
      }),
    ];
    stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", is: isMock });
    stubClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B", is: isMock });
    const parentClassA = stubClass({
      schemaName: "TestSchema",
      className: "TestParentClassA",
      classLabel: "TestSchema.TestParentClassA",
      isEntityClass: () => true,
      isRelationshipClass: () => true,
    });
    const parentClassB = stubClass({
      schemaName: "TestSchema",
      className: "TestParentClassB",
      classLabel: "TestSchema.TestParentClassB",
      isEntityClass: () => true,
      isRelationshipClass: () => true,
    });
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq([
      {
        label: "TestSchema.TestParentClassA",
        key: {
          type: "class-grouping",
          class: parentClassA,
        },
        children: [nodes[0], nodes[2]],
      },
      {
        label: "TestSchema.TestParentClassB",
        key: {
          type: "class-grouping",
          class: parentClassB,
        },
        children: [nodes[1]],
      },
    ] as HierarchyNode[]);
  });

  it("groups nodes into multiple base classes", async () => {
    const nodes = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
        params: {
          grouping: {
            byBaseClasses: {
              fullClassNames: ["TestSchema.TestParentClassA", "TestSchema.TestParentClassAA"],
            },
          },
        },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x3" }] },
        label: "2",
        params: {
          grouping: {
            byBaseClasses: {
              fullClassNames: ["TestSchema.TestParentClassA", "TestSchema.TestParentClassAA", "TestSchema.TestRandomClassAA"],
            },
          },
        },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x2" }] },
        label: "3",
        params: {
          grouping: {
            byBaseClasses: {
              fullClassNames: ["TestSchema.TestParentClassAA"],
            },
          },
        },
      }),
    ];
    stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", is: isMock });
    const parentClassA = stubClass({
      schemaName: "TestSchema",
      className: "TestParentClassA",
      classLabel: "TestSchema.TestParentClassA",
      isEntityClass: () => true,
      isRelationshipClass: () => true,
    });
    const parentClassAA = stubClass({
      schemaName: "TestSchema",
      className: "TestParentClassAA",
      classLabel: "TestSchema.TestParentClassAA",
      isEntityClass: () => true,
      isRelationshipClass: () => true,
      is: isMock,
    });
    stubClass({ schemaName: "TestSchema", className: "TestRandomClassAA", isEntityClass: () => true, isRelationshipClass: () => true });
    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider)));
    expect(result).to.deep.eq([
      {
        label: "TestSchema.TestParentClassA",
        key: {
          type: "class-grouping",
          class: parentClassA,
        },
        children: [
          {
            label: "TestSchema.TestParentClassAA",
            key: {
              type: "class-grouping",
              class: parentClassAA,
            },
            children: [nodes[0], nodes[1]],
          },
        ],
      },
      {
        label: "TestSchema.TestParentClassAA",
        key: {
          type: "class-grouping",
          class: parentClassAA,
        },
        children: [nodes[2]],
      },
    ] as HierarchyNode[]);
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { HierarchyNode } from "../../../../hierarchy-builder/HierarchyNode";
import * as baseClassGrouping from "../../../../hierarchy-builder/internal/operators/grouping/BaseClassGrouping";
import { ECClass, IMetadataProvider } from "../../../../hierarchy-builder/Metadata";
import { createGetClassStub, createTestNode, TStubClassFunc } from "../../../Utils";

describe("BaseClassGrouping", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  const ecClass = {
    fullName: "TestSchema.TestParentClass",
    label: "TestParentClass",
  } as unknown as ECClass;
  let stubClass: TStubClassFunc;
  beforeEach(() => {
    stubClass = createGetClassStub(metadataProvider).stubClass;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("getBaseClassGroupingECClasses", () => {
    it("extracts ECClasses in the order: the most base -> lesser base -> least base ECClass", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          params: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.TestParentClass2", "TestSchema.TestParentClass1", "TestSchema.TestParentClass3"],
              },
            },
          },
        }),
      ];
      stubClass({
        schemaName: "TestSchema",
        className: "TestParentClass1",
        isEntityClass: () => true,
        isRelationshipClass: () => true,
      });
      stubClass({
        schemaName: "TestSchema",
        className: "TestParentClass2",
        isEntityClass: () => true,
        isRelationshipClass: () => true,
        is: async () => true,
      });
      stubClass({
        schemaName: "TestSchema",
        className: "TestParentClass3",
        isEntityClass: () => true,
        isRelationshipClass: () => true,
        is: async (className) => className === "TestSchema.TestParentClass1",
      });

      const result = await baseClassGrouping.getBaseClassGroupingECClasses(metadataProvider, nodes);
      expect(result[0].fullName).to.eq("TestSchema.TestParentClass1");
      expect(result[1].fullName).to.eq("TestSchema.TestParentClass3");
      expect(result[2].fullName).to.eq("TestSchema.TestParentClass2");
    });

    it("doesn't extract ECClasses that are not of entity or relationship type", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          params: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.TestParentClass1"],
              },
            },
          },
        }),
      ];
      stubClass({
        schemaName: "TestSchema",
        className: "TestParentClass1",
        isEntityClass: () => false,
        isRelationshipClass: () => false,
      });
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(metadataProvider, nodes);
      expect(result).to.deep.eq([]);
    });

    it("returns empty array if base classes aren't provided", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        }),
      ];
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(metadataProvider, nodes);
      expect(result).to.deep.eq([]);
    });
  });

  describe("createBaseClassGroupsForSingleBaseClass", async () => {
    it("doesn't group non-instance nodes", async () => {
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

      const result = await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(metadataProvider, nodes, ecClass);
      expect(result.grouped).to.deep.eq([]);
      expect(result.ungrouped).to.deep.eq(nodes);
    });

    it("doesn't group if provided ECClass is not in the nodes' grouping base class list", async () => {
      const nodes = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          params: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.ProvidedParentClass"],
              },
            },
          },
        }),
      ];

      const result = await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(metadataProvider, nodes, ecClass);
      expect(result.grouped).to.deep.eq([]);
      expect(result.ungrouped).to.deep.eq(nodes);
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
      const specificECClass = { fullName: "TestSchema.TestParentClass", name: "Test Parent Class" } as unknown as ECClass;

      stubClass({ schemaName: "TestSchema", className: "TestClass", is: async () => true });

      const result = await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(metadataProvider, nodes, specificECClass);
      expect(result.grouped).to.deep.eq([
        {
          label: specificECClass.name,
          key: {
            type: "class-grouping",
            class: {
              name: specificECClass.fullName,
              label: specificECClass.name,
            },
          },
          children: nodes,
        },
      ] as HierarchyNode[]);
      expect(result.ungrouped).to.deep.eq([]);
    });

    it("groups multiple instance nodes", async () => {
      const nodes = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
          params: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.TestParentClass"],
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
                fullClassNames: ["TestSchema.TestParentClass"],
              },
            },
          },
        }),
      ];

      stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", is: async () => true });
      stubClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B", is: async () => true });

      const result = await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(metadataProvider, nodes, ecClass);
      expect(result.grouped).to.deep.eq([
        {
          label: ecClass.label,
          key: {
            type: "class-grouping",
            class: {
              name: ecClass.fullName,
              label: ecClass.label,
            },
          },
          children: [nodes[0], nodes[1]],
        },
      ] as HierarchyNode[]);
      expect(result.ungrouped).to.deep.eq([]);
    });

    it("groups only nodes for which ECClass is base", async () => {
      const nodes = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
          params: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.TestParentClass"],
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
                fullClassNames: ["TestSchema.TestParentClass"],
              },
            },
          },
        }),
      ];
      stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", is: async () => true });
      stubClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B", is: async () => false });

      const result = await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(metadataProvider, nodes, ecClass);
      expect(result.grouped).to.deep.eq([
        {
          label: ecClass.label,
          key: {
            type: "class-grouping",
            class: {
              name: ecClass.fullName,
              label: ecClass.label,
            },
          },
          children: [nodes[0]],
        },
      ] as HierarchyNode[]);
      expect(result.ungrouped).to.deep.eq([nodes[1]]);
    });
  });

  describe("createBaseClassGroupingHandlers", () => {
    it("creates base class grouping handlers from the provided fullClassNames", async () => {
      const nodes: HierarchyNode[] = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          params: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.TestParentClass1"],
              },
            },
          },
        }),
      ];
      stubClass({
        schemaName: "TestSchema",
        className: "TestParentClass1",
        isEntityClass: () => true,
        isRelationshipClass: () => true,
      });
      stubClass({ schemaName: "TestSchema", className: "TestClass", is: async () => true });

      const result = await baseClassGrouping.createBaseClassGroupingHandlers(metadataProvider, nodes);
      expect(result.length).to.eq(1);
      const handlerResult = await result[0](nodes);
      expect(handlerResult.groupingType).to.eq("base-class");
    });
  });
});

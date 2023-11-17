/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { ECClass, IMetadataProvider } from "../../../../hierarchy-builder/ECMetadata";
import { GroupingNodeKey } from "../../../../hierarchy-builder/HierarchyNode";
import * as baseClassGrouping from "../../../../hierarchy-builder/internal/operators/grouping/BaseClassGrouping";
import { ClassStubs, createClassStubs, createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../../../Utils";

describe("BaseClassGrouping", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  let classStubs: ClassStubs;
  beforeEach(() => {
    classStubs = createClassStubs(metadataProvider);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("getBaseClassGroupingECClasses", () => {
    it("extracts ECClasses in the order: the most base -> lesser base -> least base ECClass", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.Class2", "TestSchema.Class1", "TestSchema.Class3"],
              },
            },
          },
        }),
      ];
      classStubs.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class1",
      });
      classStubs.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class2",
        is: async (className) => className === "TestSchema.Class1",
      });
      classStubs.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class3",
        is: async () => true,
      });

      const result = await baseClassGrouping.getBaseClassGroupingECClasses(metadataProvider, nodes);
      expect(result[0].fullName).to.eq("TestSchema.Class1");
      expect(result[1].fullName).to.eq("TestSchema.Class2");
      expect(result[2].fullName).to.eq("TestSchema.Class3");
    });

    it("doesn't extract ECClasses that are not of entity or relationship type", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.Class"],
              },
            },
          },
        }),
      ];
      classStubs.stubOtherClass({
        schemaName: "TestSchema",
        className: "Class",
      });
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(metadataProvider, nodes);
      expect(result).to.deep.eq([]);
    });

    it("returns empty array if base classes aren't provided", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        }),
      ];
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(metadataProvider, nodes);
      expect(result).to.deep.eq([]);
    });
  });

  describe("createBaseClassGroupsForSingleBaseClass", async () => {
    it("doesn't group if provided ECClass is not in the nodes' grouping base class list", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          parentKeys: ["x"],
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.Class"],
              },
            },
          },
        }),
      ];
      const ecClass = { fullName: "TestSchema.ParentClass", label: "ParentClass" } as unknown as ECClass;
      expect(await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(metadataProvider, nodes, ecClass)).to.deep.eq({
        groupingType: "base-class",
        grouped: [],
        ungrouped: nodes,
      });
    });

    it("groups one instance node", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          parentKeys: ["x"],
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.ParentClass"],
              },
            },
          },
        }),
      ];
      const eCClass = { fullName: "TestSchema.ParentClass", name: "Parent Class" } as unknown as ECClass;

      classStubs.stubEntityClass({ schemaName: "TestSchema", className: "TestClass", is: async () => true });

      const expectedGroupingNodeKey: GroupingNodeKey = {
        type: "class-grouping",
        class: {
          name: eCClass.fullName,
          label: eCClass.name,
        },
      };
      expect(await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(metadataProvider, nodes, eCClass)).to.deep.eq({
        groupingType: "base-class",
        grouped: [
          createTestProcessedGroupingNode({
            label: eCClass.name,
            key: expectedGroupingNodeKey,
            parentKeys: ["x"],
            children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
          }),
        ],
        ungrouped: [],
      });
    });

    it("groups multiple instance nodes", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          parentKeys: ["x"],
          label: "1",
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.ParentClass"],
              },
            },
          },
        }),
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
          parentKeys: ["x"],
          label: "2",
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.ParentClass"],
              },
            },
          },
        }),
      ];

      classStubs.stubEntityClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", is: async () => true });
      classStubs.stubEntityClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B", is: async () => true });
      const ecClass = { fullName: "TestSchema.ParentClass", label: "ParentClass" } as unknown as ECClass;

      const expectedGroupingNodeKey: GroupingNodeKey = {
        type: "class-grouping",
        class: {
          name: ecClass.fullName,
          label: ecClass.label,
        },
      };

      expect(await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(metadataProvider, nodes, ecClass)).to.deep.eq({
        groupingType: "base-class",
        grouped: [
          createTestProcessedGroupingNode({
            label: ecClass.label,
            key: expectedGroupingNodeKey,
            parentKeys: ["x"],
            children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
          }),
        ],
        ungrouped: [],
      });
    });

    it("groups only nodes for which ECClass is base", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          parentKeys: ["x"],
          label: "1",
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.ParentClass"],
              },
            },
          },
        }),
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
          parentKeys: ["x"],
          label: "2",
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.ParentClass"],
              },
            },
          },
        }),
      ];
      classStubs.stubEntityClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", is: async () => true });
      classStubs.stubEntityClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B", is: async () => false });
      const ecClass = { fullName: "TestSchema.ParentClass", label: "ParentClass" } as unknown as ECClass;

      const expectedGroupingNodeKey: GroupingNodeKey = {
        type: "class-grouping",
        class: {
          name: ecClass.fullName,
          label: ecClass.label,
        },
      };

      expect(await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(metadataProvider, nodes, ecClass)).to.deep.eq({
        groupingType: "base-class",
        grouped: [
          createTestProcessedGroupingNode({
            label: ecClass.label,
            key: expectedGroupingNodeKey,
            parentKeys: ["x"],
            children: [nodes[0]].map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
          }),
        ],
        ungrouped: [nodes[1]],
      });
    });
  });

  describe("createBaseClassGroupingHandlers", () => {
    it("creates base class grouping handlers from the provided fullClassNames", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.Class"],
              },
            },
          },
        }),
      ];
      classStubs.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class",
      });
      classStubs.stubEntityClass({ schemaName: "TestSchema", className: "TestClass", is: async () => true });

      const result = await baseClassGrouping.createBaseClassGroupingHandlers(metadataProvider, nodes);
      expect(result.length).to.eq(1);
      const handlerResult = await result[0](nodes);
      expect(handlerResult.groupingType).to.eq("base-class");
    });
  });
});

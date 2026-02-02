/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import type { EC } from "@itwin/presentation-shared";
import type { GroupingNodeKey } from "../../../../hierarchies/HierarchyNodeKey.js";
import * as baseClassGrouping from "../../../../hierarchies/imodel/operators/grouping/BaseClassGrouping.js";
import { createIModelAccessStub, createTestGenericNodeKey, createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../../../Utils.js";

describe("BaseClassGrouping", () => {
  let imodelAccess: ReturnType<typeof createIModelAccessStub>;
  beforeEach(() => {
    imodelAccess = createIModelAccessStub();
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
                fullClassNames: ["TestSchema.Class1", "TestSchema.Class2", "TestSchema.Class3"],
              },
            },
          },
        }),
      ];
      const class2 = imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class2",
      });
      const class1 = imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class1",
        baseClass: class2,
      });
      imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class3",
        baseClass: class1,
      });
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(imodelAccess, undefined, nodes);
      expect(result.length).to.eq(3);
      expect(result[0].fullName).to.eq("TestSchema.Class2");
      expect(result[1].fullName).to.eq("TestSchema.Class1");
      expect(result[2].fullName).to.eq("TestSchema.Class3");
    });

    it("returns classes that are deeper in class hierarchy than the class of parent class grouping node", async () => {
      const parentNode = createTestProcessedGroupingNode({
        key: { type: "class-grouping", className: "TestSchema.Class2" },
      });
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass4", id: "0x1" }] },
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.Class1", "TestSchema.Class2", "TestSchema.Class3", "TestSchema.Class4"],
              },
            },
          },
        }),
      ];
      const class1 = imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class1",
      });
      const class2 = imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class2",
        baseClass: class1,
      });
      const class3 = imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class3",
        baseClass: class2,
      });
      imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class4",
        baseClass: class3,
      });
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(imodelAccess, parentNode, nodes);
      expect(result.length).to.eq(2);
      expect(result[0].fullName).to.eq("TestSchema.Class3");
      expect(result[1].fullName).to.eq("TestSchema.Class4");
    });

    it("returns empty classes list when the class of parent class grouping node matches grouping class", async () => {
      const parentNode = createTestProcessedGroupingNode({
        key: { type: "class-grouping", className: "TestSchema.Class1" },
      });
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass2", id: "0x1" }] },
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.Class1"],
              },
            },
          },
        }),
      ];
      const class1 = imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class1",
      });
      imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class2",
        baseClass: class1,
      });
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(imodelAccess, parentNode, nodes);
      expect(result.length).to.eq(0);
    });

    it("returns empty classes list when the class of parent class grouping node doesn't match any of the grouping class ancestors", async () => {
      const parentNode = createTestProcessedGroupingNode({
        key: { type: "class-grouping", className: "TestSchema.Class2" },
      });
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass2", id: "0x1" }] },
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.Class1"],
              },
            },
          },
        }),
      ];
      const class1 = imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class1",
      });
      imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class2",
        baseClass: class1,
      });
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(imodelAccess, parentNode, nodes);
      expect(result.length).to.eq(0);
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
      imodelAccess.stubOtherClass({
        schemaName: "TestSchema",
        className: "Class",
      });
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(imodelAccess, undefined, nodes);
      expect(result).to.deep.eq([]);
    });

    it("returns empty array if base classes aren't provided", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        }),
      ];
      const result = await baseClassGrouping.getBaseClassGroupingECClasses(imodelAccess, undefined, nodes);
      expect(result).to.deep.eq([]);
    });
  });

  describe("createBaseClassGroupsForSingleBaseClass", async () => {
    it("doesn't group if provided ECClass is not in the nodes' grouping base class list", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.Class"],
              },
            },
          },
        }),
      ];
      const ecClass = { fullName: "TestSchema.ParentClass", label: "ParentClass" } as unknown as EC.Class;
      expect(await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(nodes, ecClass, imodelAccess)).to.deep.eq({
        groupingType: "base-class",
        grouped: [],
        ungrouped: nodes,
      });
    });

    it("groups one instance node", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["TestSchema.ParentClass"],
              },
            },
          },
        }),
      ];
      const baseClass = imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "ParentClass" });
      imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "TestClass", baseClass });

      const expectedGroupingNodeKey: GroupingNodeKey = {
        type: "class-grouping",
        className: baseClass.fullName,
      };
      expect(await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(nodes, baseClass, imodelAccess)).to.deep.eq({
        groupingType: "base-class",
        grouped: [
          createTestProcessedGroupingNode({
            label: baseClass.name,
            key: expectedGroupingNodeKey,
            parentKeys: [createTestGenericNodeKey({ id: "x" })],
            groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
            children: nodes.map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey] })),
          }),
        ],
        ungrouped: [],
      });
    });

    it("groups multiple instance nodes", async () => {
      // note: class names are intentionally in different casing & format to ensure we support that
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          label: "1",
          processingParams: {
            grouping: {
              byBaseClasses: {
                /* cspell:disable-next-line */
                fullClassNames: ["testschema:parentclass"],
              },
            },
          },
        }),
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "testSchema.b", id: "0x2" }] },
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
          label: "2",
          processingParams: {
            grouping: {
              byBaseClasses: {
                fullClassNames: ["testSchema.parentClass"],
              },
            },
          },
        }),
      ];

      const baseClass = imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "ParentClass", classLabel: "Parent Class" });
      imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", baseClass });
      imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B", baseClass });

      const expectedGroupingNodeKey: GroupingNodeKey = {
        type: "class-grouping",
        className: baseClass.fullName,
      };

      expect(await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(nodes, baseClass, imodelAccess)).to.deep.eq({
        groupingType: "base-class",
        grouped: [
          createTestProcessedGroupingNode({
            label: baseClass.label,
            key: expectedGroupingNodeKey,
            parentKeys: [createTestGenericNodeKey({ id: "x" })],
            groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
            children: nodes.map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey] })),
          }),
        ],
        ungrouped: [],
      });
    });

    it("groups only nodes for which ECClass is base", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
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
          parentKeys: [createTestGenericNodeKey({ id: "x" })],
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

      const baseClass = imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "ParentClass", classLabel: "Parent Class" });
      imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", baseClass });
      imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B" });

      const expectedGroupingNodeKey: GroupingNodeKey = {
        type: "class-grouping",
        className: baseClass.fullName,
      };

      expect(await baseClassGrouping.createBaseClassGroupsForSingleBaseClass(nodes, baseClass, imodelAccess)).to.deep.eq({
        groupingType: "base-class",
        grouped: [
          createTestProcessedGroupingNode({
            label: baseClass.label,
            key: expectedGroupingNodeKey,
            parentKeys: [createTestGenericNodeKey({ id: "x" })],
            groupedInstanceKeys: nodes[0].key.instanceKeys,
            children: [nodes[0]].map((n) => ({ ...n, parentKeys: [createTestGenericNodeKey({ id: "x" }), expectedGroupingNodeKey] })),
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
      imodelAccess.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class",
      });
      imodelAccess.stubEntityClass({ schemaName: "TestSchema", className: "TestClass" });

      const result = await baseClassGrouping.createBaseClassGroupingHandlers(imodelAccess, undefined, nodes);
      expect(result.length).to.eq(1);
      const handlerResult = await result[0](nodes, []);
      expect(handlerResult.groupingType).to.eq("base-class");
    });
  });
});

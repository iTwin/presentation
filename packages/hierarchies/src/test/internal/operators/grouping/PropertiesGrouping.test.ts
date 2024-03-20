/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { ECClass, ECProperty, IMetadataProvider } from "../../../../hierarchies/ECMetadata";
import { GroupingNodeKey, HierarchyNodePropertyGroup, PropertyOtherValuesGroupingNodeKey } from "../../../../hierarchies/HierarchyNode";
import { BaseClassChecker } from "../../../../hierarchies/internal/Common";
import * as propertiesGrouping from "../../../../hierarchies/internal/operators/grouping/PropertiesGrouping";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "../../../../hierarchies/values/Formatting";
import { ClassStubs, createClassStubs, createTestProcessedGroupingNode, createTestProcessedInstanceNode, testLocalizedStrings } from "../../../Utils";

describe("PropertiesGrouping", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  let classStubs: ClassStubs;
  let formatter: IPrimitiveValueFormatter;

  beforeEach(() => {
    formatter = createDefaultValueFormatter();
    classStubs = createClassStubs(metadataProvider);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("getUniquePropertiesGroupInfo", () => {
    function checkPropertyGroupInfo(
      received: propertiesGrouping.PropertyGroupInfo,
      expectedECClassName: string,
      expectedPreviousPropertiesGroupingInfo: propertiesGrouping.PreviousPropertiesGroupingInfo,
      expectedPropertyGroup: Omit<HierarchyNodePropertyGroup, "propertyValue">,
    ) {
      expect(received.ecClass.fullName).to.eq(expectedECClassName);
      expect(received.previousPropertiesGroupingInfo).to.deep.eq(expectedPreviousPropertiesGroupingInfo);
      expect(received.propertyGroup.propertyName).to.eq(expectedPropertyGroup.propertyName);
      expect(received.propertyGroup.ranges).to.deep.eq(expectedPropertyGroup.ranges);
    }

    it("doesn't extract propertiesGroupInfo from node when it doesn't have grouping.byProperties set", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
        }),
      ];
      const result = await propertiesGrouping.getUniquePropertiesGroupInfo(metadataProvider, nodes);
      expect(result).to.deep.eq([]);
    });

    it("extracts propertiesGroupInfo with ranges undefined when node doesn't have ranges set", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          processingParams: {
            grouping: {
              byProperties: {
                propertiesClassName: "TestSchema.Class",
                propertyGroups: [
                  {
                    propertyName: "PropertyName",
                    propertyValue: "PropertyValue",
                  },
                ],
              },
            },
          },
        }),
      ];
      classStubs.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class",
      });
      const result = await propertiesGrouping.getUniquePropertiesGroupInfo(metadataProvider, nodes);
      expect(result.length).to.eq(1);
      checkPropertyGroupInfo(result[0], "TestSchema.Class", [], { propertyName: "PropertyName", ranges: undefined });
    });

    it("extracts propertiesGroupInfo from single node in the order which properties were provided", async () => {
      const propertyGroup1: HierarchyNodePropertyGroup = {
        propertyName: "PropertyName1",
        propertyValue: 1,
        ranges: [{ fromValue: 1, toValue: 5, rangeLabel: "RangeLabel1" }],
      };
      const propertyGroup2: HierarchyNodePropertyGroup = {
        propertyName: "PropertyName2",
        propertyValue: 2,
        ranges: [{ fromValue: 1, toValue: 5 }],
      };
      const className = "TestSchema.Class";
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          processingParams: {
            grouping: {
              byProperties: {
                propertiesClassName: className,
                propertyGroups: [propertyGroup1, propertyGroup2],
              },
            },
          },
        }),
      ];
      classStubs.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class",
      });

      const result = await propertiesGrouping.getUniquePropertiesGroupInfo(metadataProvider, nodes);
      expect(result.length).to.eq(2);
      checkPropertyGroupInfo(result[0], className, [], propertyGroup1);
      checkPropertyGroupInfo(result[1], className, [{ propertiesClassName: className, propertyGroup: propertyGroup1 }], propertyGroup2);
    });

    it("extracts propertiesGroupInfo from multiple nodes in the order which different properties were provided", async () => {
      const propertyGroup1: HierarchyNodePropertyGroup = {
        propertyName: "PropertyName1",
        propertyValue: 1,
        ranges: [{ fromValue: 1, toValue: 5, rangeLabel: "RangeLabel1" }],
      };
      const propertyGroup2: HierarchyNodePropertyGroup = {
        propertyName: "PropertyName2",
        propertyValue: 2,
        ranges: [{ fromValue: 1, toValue: 5 }],
      };
      const className = "TestSchema.Class";
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          processingParams: {
            grouping: {
              byProperties: {
                propertiesClassName: className,
                propertyGroups: [propertyGroup1],
              },
            },
          },
        }),
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x2" }] },
          processingParams: {
            grouping: {
              byProperties: {
                propertiesClassName: className,
                propertyGroups: [propertyGroup2],
              },
            },
          },
        }),
      ];
      classStubs.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class",
      });

      const result = await propertiesGrouping.getUniquePropertiesGroupInfo(metadataProvider, nodes);
      expect(result.length).to.eq(2);
      checkPropertyGroupInfo(result[0], className, [], propertyGroup1);
      checkPropertyGroupInfo(result[1], className, [], propertyGroup2);
    });

    it("doesn't extract duplicate properties from multiple nodes", async () => {
      const propertyGroup1: HierarchyNodePropertyGroup = {
        propertyName: "PropertyName1",
        propertyValue: 1,
      };
      const propertyGroup2: HierarchyNodePropertyGroup = {
        propertyName: "PropertyName2",
        propertyValue: 2,
      };
      const propertyGroup3: HierarchyNodePropertyGroup = {
        propertyName: "PropertyName3",
        propertyValue: 3,
      };
      const propertyGroup4: HierarchyNodePropertyGroup = {
        propertyName: "PropertyName4",
        propertyValue: 4,
      };
      const className = "TestSchema.Class";
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x1" }] },
          processingParams: {
            grouping: {
              byProperties: {
                propertiesClassName: className,
                propertyGroups: [propertyGroup1, propertyGroup2, propertyGroup3],
              },
            },
          },
        }),
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.TestClass", id: "0x2" }] },
          processingParams: {
            grouping: {
              byProperties: {
                propertiesClassName: className,
                propertyGroups: [propertyGroup1, propertyGroup2, propertyGroup4, propertyGroup3],
              },
            },
          },
        }),
      ];

      classStubs.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class",
      });

      const result = await propertiesGrouping.getUniquePropertiesGroupInfo(metadataProvider, nodes);
      expect(result.length).to.eq(5);
      checkPropertyGroupInfo(result[0], className, [], propertyGroup1);
      checkPropertyGroupInfo(result[1], className, [{ propertiesClassName: className, propertyGroup: propertyGroup1 }], propertyGroup2);
      checkPropertyGroupInfo(
        result[2],
        className,
        [
          { propertiesClassName: className, propertyGroup: propertyGroup1 },
          { propertiesClassName: className, propertyGroup: propertyGroup2 },
        ],
        propertyGroup3,
      );
      checkPropertyGroupInfo(
        result[3],
        className,
        [
          { propertiesClassName: className, propertyGroup: propertyGroup1 },
          { propertiesClassName: className, propertyGroup: propertyGroup2 },
        ],
        propertyGroup4,
      );
      checkPropertyGroupInfo(
        result[4],
        className,
        [
          { propertiesClassName: className, propertyGroup: propertyGroup1 },
          { propertiesClassName: className, propertyGroup: propertyGroup2 },
          { propertiesClassName: className, propertyGroup: propertyGroup4 },
        ],
        propertyGroup3,
      );
    });
  });

  describe("doRangesMatch", async () => {
    [
      {
        ranges1: undefined,
        ranges2: undefined,
        expectedResult: true,
      },
      {
        ranges1: undefined,
        ranges2: [{ fromValue: 1, toValue: 2 }],
        expectedResult: false,
      },
      {
        ranges1: [{ fromValue: 1, toValue: 2 }],
        ranges2: undefined,
        expectedResult: false,
      },
      {
        ranges1: [{ fromValue: 1, toValue: 2 }],
        ranges2: [{ fromValue: 1, toValue: 3 }],
        expectedResult: false,
      },
      {
        ranges1: [{ fromValue: 2, toValue: 3 }],
        ranges2: [{ fromValue: 1, toValue: 3 }],
        expectedResult: false,
      },
      {
        ranges1: [
          { fromValue: 1, toValue: 2 },
          { fromValue: 3, toValue: 4 },
        ],
        ranges2: [{ fromValue: 1, toValue: 2 }],
        expectedResult: false,
      },
      {
        ranges1: [{ fromValue: 1, toValue: 3, rangeLabel: "label" }],
        ranges2: [{ fromValue: 1, toValue: 3 }],
        expectedResult: false,
      },
      {
        ranges1: [{ fromValue: 1, toValue: 2 }],
        ranges2: [{ fromValue: 1, toValue: 2, rangeLabel: "label" }],
        expectedResult: false,
      },
      {
        ranges1: [{ fromValue: 1, toValue: 2, rangeLabel: "label" }],
        ranges2: [{ fromValue: 1, toValue: 2, rangeLabel: "label" }],
        expectedResult: true,
      },
      {
        testCase: [[{ fromValue: 1, toValue: 2 }], [{ fromValue: 1, toValue: 2 }]],
        ranges1: [{ fromValue: 1, toValue: 2 }],
        ranges2: [{ fromValue: 1, toValue: 2 }],
        expectedResult: true,
      },
    ].forEach(({ ranges1, ranges2, expectedResult }) => {
      it(`returns ${expectedResult} when ranges1 is: '${JSON.stringify(ranges1)} and ranges2 is: '${JSON.stringify(ranges2)}'`, async () => {
        expect(propertiesGrouping.doRangesMatch(ranges1, ranges2)).to.eq(expectedResult);
      });
    });
  });

  describe("doPreviousPropertiesMatch", async () => {
    [
      {
        testCase: "full class names don't match",
        previousPropertiesGroupingInfo: [
          {
            propertiesClassName: "TestSchema.other",
            propertyGroup: {
              propertyName: "PropertyName",
            },
          },
        ],
        nodesProperties: {
          propertiesClassName: "TestSchema.Name",
          propertyGroups: [
            {
              propertyName: "PropertyName",
              propertyValue: "PropertyValue",
            },
          ],
        },
        expectedResult: false,
      },
      {
        testCase: "property names don't match",
        previousPropertiesGroupingInfo: [
          {
            propertiesClassName: "TestSchema.Name",
            propertyGroup: {
              propertyName: "OtherName",
            },
          },
        ],
        nodesProperties: {
          propertiesClassName: "TestSchema.Name",
          propertyGroups: [
            {
              propertyName: "PropertyName",
              propertyValue: "PropertyValue",
            },
          ],
        },
        expectedResult: false,
      },
      {
        testCase: "ranged properties don't match",
        previousPropertiesGroupingInfo: [
          {
            propertiesClassName: "TestSchema.Name",
            propertyGroup: {
              propertyName: "PropertyName",
              ranges: [{ fromValue: 1, toValue: 2 }],
            },
          },
        ],
        nodesProperties: {
          propertiesClassName: "TestSchema.Name",
          propertyGroups: [
            {
              propertyName: "PropertyName",
              propertyValue: "PropertyValue",
            },
          ],
        },
        expectedResult: false,
      },
      {
        testCase: "all properties match",
        previousPropertiesGroupingInfo: [
          {
            propertiesClassName: "TestSchema.Name",
            propertyGroup: {
              propertyName: "PropertyName",
            },
          },
        ],
        nodesProperties: {
          propertiesClassName: "TestSchema.Name",
          propertyGroups: [
            {
              propertyName: "PropertyName",
              propertyValue: "PropertyValue",
            },
          ],
        },
        expectedResult: true,
      },
    ].forEach(({ testCase, previousPropertiesGroupingInfo, nodesProperties, expectedResult }) => {
      it(`returns ${expectedResult} when ${testCase}`, async () => {
        expect(propertiesGrouping.doPreviousPropertiesMatch(previousPropertiesGroupingInfo, nodesProperties)).to.eq(expectedResult);
      });
    });
  });

  describe("createPropertyGroups", async () => {
    describe("propertyInfo is different from nodes' byProperties processing params", async () => {
      it("doesn't group when fullClassName isn't the same as the one in nodes' property grouping params", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const ecClass = { fullName: "TestSchema.Other" } as unknown as ECClass;
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName" },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });

      it("doesn't group when previousPropertiesGroupingInfo has more properties, than there are in nodes' property grouping params", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const ecClass = { fullName: "TestSchema.Class" } as unknown as ECClass;
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass,
          previousPropertiesGroupingInfo: [{ propertiesClassName: "TestSchema.Class", propertyGroup: { propertyName: "PropertyName2" } }],
          propertyGroup: { propertyName: "PropertyName" },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });

      it("doesn't group when propertyName isn't the same as the one in nodes' property grouping params", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const ecClass = { fullName: "TestSchema.Class" } as unknown as ECClass;
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "Other" },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });

      it("doesn't group when ranges aren't the same as node's property grouping params", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const ecClass = { fullName: "TestSchema.Class" } as unknown as ECClass;
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName", ranges: [{ fromValue: 1, toValue: 5 }] },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });

      it("doesn't group when nodes' ECClass isn't a child of provided ECClass", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const ecClass = { fullName: "TestSchema.Class" } as unknown as ECClass;

        classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => false,
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName" },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });

      it("doesn't group when nodes' properties and provided previous properties don't match", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [
                    { propertyName: "PropertyName1", propertyValue: "PropertyValue1" },
                    { propertyName: "PropertyName2", propertyValue: "PropertyValue2" },
                  ],
                },
              },
            },
          }),
        ];
        const ecClass = { fullName: "TestSchema.Class" } as unknown as ECClass;
        classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass,
          previousPropertiesGroupingInfo: [{ propertiesClassName: "TestSchema.Class", propertyGroup: { propertyName: "Other" } }],
          propertyGroup: { propertyName: "PropertyName2" },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });
    });

    it("doesn't group when byProperties isn't set", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
        }),
      ];
      const ecClass = { fullName: "TestSchema.Class" } as unknown as ECClass;
      const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
        ecClass,
        previousPropertiesGroupingInfo: [],
        propertyGroup: { propertyName: "PropertyName" },
      };
      expect(
        await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
      ).to.deep.eq({
        groupingType: "property",
        grouped: [],
        ungrouped: nodes,
      });
    });

    describe("value grouping", async () => {
      it("doesn't group node, when property value is not primitive", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => false } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName" },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });

      it("doesn't call getClass when it was called before with the same className", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x2" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => false } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => false,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName" },
        };
        await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider));
        expect(classStubs.stub).to.be.calledOnce;
      });

      it("doesn't group, when property value isn't set and createGroupForUnspecifiedValues isn't set", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: undefined }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName" },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });

      it("groups node into property value grouping node, when property value isn't set and createGroupForUnspecifiedValues is true", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  createGroupForUnspecifiedValues: true,
                  propertyGroups: [{ propertyName: "PropertyName" }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName" },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:value",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          formattedPropertyValue: "",
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: testLocalizedStrings.unspecified,
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
              children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
            }),
          ],
          ungrouped: [],
        });
      });

      it("groups node into property value grouping node", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true, primitiveType: "String" } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName" },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:value",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          formattedPropertyValue: "PropertyValue",
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "PropertyValue",
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
              children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
            }),
          ],
          ungrouped: [],
        });
      });

      it("groups multiple nodes when they have the same property value into property value grouping node", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x2" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true, primitiveType: "String" } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName" },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:value",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          formattedPropertyValue: "PropertyValue",
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "PropertyValue",
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
              children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
            }),
          ],
          ungrouped: [],
        });
      });

      it("creates different property value groups for nodes with different property values", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue1" }],
                },
              },
            },
          }),
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x2" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "PropertyValue2" }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true, primitiveType: "String" } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName" },
        };
        const expectedGroupingNodeKey1: GroupingNodeKey = {
          type: "property-grouping:value",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          formattedPropertyValue: "PropertyValue1",
        };
        const expectedGroupingNodeKey2: GroupingNodeKey = {
          type: "property-grouping:value",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          formattedPropertyValue: "PropertyValue2",
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "PropertyValue1",
              key: expectedGroupingNodeKey1,
              groupedInstanceKeys: nodes[0].key.instanceKeys,
              children: [{ ...nodes[0], parentKeys: [...nodes[0].parentKeys, expectedGroupingNodeKey1] }],
            }),
            createTestProcessedGroupingNode({
              label: "PropertyValue2",
              key: expectedGroupingNodeKey2,
              groupedInstanceKeys: nodes[1].key.instanceKeys,
              children: [{ ...nodes[1], parentKeys: [...nodes[1].parentKeys, expectedGroupingNodeKey2] }],
            }),
          ],
          ungrouped: [],
        });
      });

      it("groups only nodes which match the provided property name", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName1", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x2" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName2", propertyValue: "PropertyValue" }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName1", isPrimitive: () => true, primitiveType: "String" } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName1" },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:value",
          propertyName: "PropertyName1",
          propertyClassName: "TestSchema.Class",
          formattedPropertyValue: "PropertyValue",
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "PropertyValue",
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes[0].key.instanceKeys,
              children: [{ ...nodes[0], parentKeys: [...nodes[0].parentKeys, expectedGroupingNodeKey] }],
            }),
          ],
          ungrouped: [nodes[1]],
        });
      });
    });

    describe("range grouping", async () => {
      it("doesn't group, when property value doesn't fit in provided range and createGroupForOutOfRangeValues isn't set", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: 12, ranges: [{ fromValue: 1, toValue: 5 }] }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName", ranges: [{ fromValue: 1, toValue: 5 }] },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });

      it("groups node into property other value grouping node, when property value doesn't fit in provided range and createGroupForOutOfRangeValues is true", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  createGroupForOutOfRangeValues: true,
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: 12, ranges: [{ fromValue: 1, toValue: 5 }] }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName", ranges: [{ fromValue: 1, toValue: 5 }] },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:other",
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: testLocalizedStrings.other,
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
              children: nodes.map((n) => ({
                ...n,
                parentKeys: [...n.parentKeys, expectedGroupingNodeKey],
              })),
            }),
          ],
          ungrouped: [],
        });
      });

      it("doesn't group, when property value isn't a number and createGroupForOutOfRangeValues isn't set", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "someValue", ranges: [{ fromValue: 1, toValue: 5 }] }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName", ranges: [{ fromValue: 1, toValue: 5 }] },
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [],
          ungrouped: nodes,
        });
      });

      it("groups node into other property grouping node, when property value isn't a number and createGroupForOutOfRangeValues is true", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  createGroupForOutOfRangeValues: true,
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: "someValue", ranges: [{ fromValue: 1, toValue: 5 }] }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName", ranges: [{ fromValue: 1, toValue: 5 }] },
        };
        const expectedGroupingNodeKey: PropertyOtherValuesGroupingNodeKey = {
          type: "property-grouping:other",
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: testLocalizedStrings.other,
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
              children: nodes.map((n) => ({
                ...n,
                parentKeys: [...n.parentKeys, expectedGroupingNodeKey],
              })),
            }),
          ],
          ungrouped: [],
        });
      });

      it("groups node into property value range grouping node, when property value fits in provided range", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: 5, ranges: [{ fromValue: 1, toValue: 5 }] }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName", ranges: [{ fromValue: 1, toValue: 5 }] },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:range",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          fromValue: 1,
          toValue: 5,
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "1 - 5",
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
              children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
            }),
          ],
          ungrouped: [],
        });
      });

      it("groups node and applies provided range label when property value fits in provided range", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: 5, ranges: [{ fromValue: 1.5, toValue: 5.5, rangeLabel: "rangeLabel" }] }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName", ranges: [{ fromValue: 1.5, toValue: 5.5, rangeLabel: "rangeLabel" }] },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:range",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          fromValue: 1.5,
          toValue: 5.5,
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "rangeLabel",
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
              children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
            }),
          ],
          ungrouped: [],
        });
      });

      it("groups only nodes, which match the provided ranged property", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: 5, ranges: [{ fromValue: 1, toValue: 5, rangeLabel: "rangeLabel" }] }],
                },
              },
            },
          }),
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x2" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: 5, ranges: [{ fromValue: 1, toValue: 4, rangeLabel: "rangeLabel" }] }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName", ranges: [{ fromValue: 1, toValue: 5, rangeLabel: "rangeLabel" }] },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:range",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          fromValue: 1,
          toValue: 5,
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "rangeLabel",
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes[0].key.instanceKeys,
              children: [{ ...nodes[0], parentKeys: [...nodes[0].parentKeys, expectedGroupingNodeKey] }],
            }),
          ],
          ungrouped: [nodes[1]],
        });
      });

      it("groups multiple nodes, when property values fit into range", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: 5, ranges: [{ fromValue: 1, toValue: 5, rangeLabel: "rangeLabel" }] }],
                },
              },
            },
          }),
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x2" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [{ propertyName: "PropertyName", propertyValue: 2, ranges: [{ fromValue: 1, toValue: 5, rangeLabel: "rangeLabel" }] }],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: { propertyName: "PropertyName", ranges: [{ fromValue: 1, toValue: 5, rangeLabel: "rangeLabel" }] },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:range",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          fromValue: 1,
          toValue: 5,
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "rangeLabel",
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes.flatMap((n) => n.key.instanceKeys),
              children: nodes.map((n) => ({ ...n, parentKeys: [...n.parentKeys, expectedGroupingNodeKey] })),
            }),
          ],
          ungrouped: [],
        });
      });

      it("groups when provided range order is different from nodes' ranged property order", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [
                    {
                      propertyName: "PropertyName",
                      propertyValue: 3.5,
                      ranges: [
                        { fromValue: 1, toValue: 4 },
                        { fromValue: 3, toValue: 10 },
                      ],
                    },
                  ],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: {
            propertyName: "PropertyName",
            ranges: [
              { fromValue: 3, toValue: 10 },
              { fromValue: 1, toValue: 4 },
            ],
          },
        };
        const expectedGroupingNodeKey: GroupingNodeKey = {
          type: "property-grouping:range",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          fromValue: 1,
          toValue: 4,
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "1 - 4",
              key: expectedGroupingNodeKey,
              groupedInstanceKeys: nodes[0].key.instanceKeys,
              children: [{ ...nodes[0], parentKeys: [...nodes[0].parentKeys, expectedGroupingNodeKey] }],
            }),
          ],
          ungrouped: [],
        });
      });

      it("groups nodes with different property values into different nodes", async () => {
        const nodes = [
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [
                    {
                      propertyName: "PropertyName",
                      propertyValue: 6,
                      ranges: [
                        { fromValue: 1, toValue: 4 },
                        { fromValue: 5, toValue: 10 },
                      ],
                    },
                  ],
                },
              },
            },
          }),
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x2" }] },
            processingParams: {
              grouping: {
                byProperties: {
                  propertiesClassName: "TestSchema.Class",
                  propertyGroups: [
                    {
                      propertyName: "PropertyName",
                      propertyValue: 2,
                      ranges: [
                        { fromValue: 1, toValue: 4 },
                        { fromValue: 5, toValue: 10 },
                      ],
                    },
                  ],
                },
              },
            },
          }),
        ];
        const property = { name: "PropertyName", isPrimitive: () => true } as unknown as ECProperty;
        const stubbedClass = classStubs.stubEntityClass({
          schemaName: "TestSchema",
          className: "Class",
          is: async () => true,
          properties: [property],
        });
        const propertyInfo: propertiesGrouping.PropertyGroupInfo = {
          ecClass: stubbedClass,
          previousPropertiesGroupingInfo: [],
          propertyGroup: {
            propertyName: "PropertyName",
            ranges: [
              { fromValue: 1, toValue: 4 },
              { fromValue: 5, toValue: 10 },
            ],
          },
        };
        const expectedGroupingNodeKey1: GroupingNodeKey = {
          type: "property-grouping:range",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          fromValue: 5,
          toValue: 10,
        };
        const expectedGroupingNodeKey2: GroupingNodeKey = {
          type: "property-grouping:range",
          propertyName: "PropertyName",
          propertyClassName: "TestSchema.Class",
          fromValue: 1,
          toValue: 4,
        };
        expect(
          await propertiesGrouping.createPropertyGroups(nodes, propertyInfo, formatter, testLocalizedStrings, new BaseClassChecker(metadataProvider)),
        ).to.deep.eq({
          groupingType: "property",
          grouped: [
            createTestProcessedGroupingNode({
              label: "1 - 4",
              key: expectedGroupingNodeKey2,
              groupedInstanceKeys: nodes[1].key.instanceKeys,
              children: [{ ...nodes[1], parentKeys: [...nodes[1].parentKeys, expectedGroupingNodeKey2] }],
            }),
            createTestProcessedGroupingNode({
              label: "5 - 10",
              key: expectedGroupingNodeKey1,
              groupedInstanceKeys: nodes[0].key.instanceKeys,
              children: [{ ...nodes[0], parentKeys: [...nodes[0].parentKeys, expectedGroupingNodeKey1] }],
            }),
          ],
          ungrouped: [],
        });
      });
    });
  });

  describe("createPropertiesGroupingHandlers", () => {
    it("creates property grouping handlers from the provided properties", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.Class", id: "0x1" }] },
          processingParams: {
            grouping: {
              byProperties: {
                propertiesClassName: "TestSchema.Class",
                propertyGroups: [
                  {
                    propertyName: "PropertyName",
                    propertyValue: "PropertyValue",
                  },
                ],
              },
            },
          },
        }),
      ];
      classStubs.stubEntityClass({
        schemaName: "TestSchema",
        className: "Class",
      });

      const result = await propertiesGrouping.createPropertiesGroupingHandlers(
        metadataProvider,
        nodes,
        formatter,
        testLocalizedStrings,
        new BaseClassChecker(metadataProvider),
      );
      expect(result.length).to.eq(1);
      const handlerResult = await result[0](nodes);
      expect(handlerResult.groupingType).to.eq("property");
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import {
  ECArrayProperty,
  ECEnumerationProperty,
  ECNavigationProperty,
  ECPrimitiveProperty,
  ECStructProperty,
  IMetadataProvider,
} from "../../hierarchy-builder/ECMetadata";
import {
  GenericInstanceFilter,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
  PropertyFilterRuleBinaryOperator,
  RelatedInstanceDescription,
} from "../../hierarchy-builder/GenericInstanceFilter";
import { NodeSelectClauseColumnNames, NodeSelectQueryFactory } from "../../hierarchy-builder/queries/NodeSelectQueryFactory";
import { ClassStubs, createClassStubs } from "../Utils";
import { trimWhitespace } from "./Utils";

describe("NodeSelectQueryFactory", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  let factory: NodeSelectQueryFactory;
  beforeEach(() => {
    factory = new NodeSelectQueryFactory(metadataProvider);
  });

  describe("createSelectClause", () => {
    it("creates valid clause with value props", async () => {
      const result = await factory.createSelectClause({
        ecClassId: "0x1",
        ecInstanceId: "0x2",
        nodeLabel: "label",
        autoExpand: false,
        supportsFiltering: false,
        extendedData: {
          id: "0x3",
          str: "test",
          num: 1.23,
          bool: true,
        },
        grouping: {
          byClass: true,
          byLabel: { hideIfOneGroupedNode: false, autoExpand: "single-child" },
          byBaseClasses: {
            fullClassNames: ["testSchema.testName"],
            hideIfNoSiblings: false,
            hideIfOneGroupedNode: true,
            autoExpand: "always",
          },
          byProperties: {
            propertiesClassName: "testSchema.testName",
            createGroupForOutOfRangeValues: false,
            createGroupForUnspecifiedValues: true,
            propertyGroups: [
              {
                propertyName: "PropertyName",
                propertyClassAlias: "this",
                ranges: [
                  {
                    fromValue: 1,
                    toValue: 2,
                    rangeLabel: "range label",
                  },
                ],
              },
            ],
          },
        },
        hasChildren: true,
        hideIfNoChildren: true,
        hideNodeInHierarchy: true,
      });
      expect(trimWhitespace(result)).to.eq(
        trimWhitespace(`
        ec_ClassName(0x1) AS ${NodeSelectClauseColumnNames.FullClassName},
        0x2 AS ${NodeSelectClauseColumnNames.ECInstanceId},
        'label' AS ${NodeSelectClauseColumnNames.DisplayLabel},
        CAST(TRUE AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
        CAST(TRUE AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(TRUE AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
        json_object(
          'byLabel', json_object('hideIfOneGroupedNode', FALSE, 'autoExpand', 'single-child'),
          'byClass', TRUE,
          'byBaseClasses', json_object('fullClassNames', json_array('testSchema.testName'), 'hideIfNoSiblings', FALSE, 'hideIfOneGroupedNode', TRUE, 'autoExpand', 'always'),
          'byProperties', json_object('propertiesClassName', 'testSchema.testName', 'propertyGroups', json_array(json_object('propertyName', 'PropertyName', 'propertyValue', [this].[PropertyName], 'ranges', json_array(json_object('fromValue', 1, 'toValue', 2, 'rangeLabel', 'range label')))), 'createGroupForOutOfRangeValues', CAST(FALSE AS BOOLEAN), 'createGroupForUnspecifiedValues', CAST(TRUE AS BOOLEAN))
        ) AS ${NodeSelectClauseColumnNames.Grouping},
        json_object(
          'id', 0x3,
          'str', 'test',
          'num', 1.23,
          'bool', TRUE
        ) AS ${NodeSelectClauseColumnNames.ExtendedData},
        CAST(FALSE AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand},
        CAST(FALSE AS BOOLEAN) AS ${NodeSelectClauseColumnNames.SupportsFiltering}
      `),
      );
    });

    it("creates valid clause with selector props", async () => {
      const result = await factory.createSelectClause({
        ecClassId: { selector: "x.ECClassId" },
        ecInstanceId: { selector: "x.ECInstanceId" },
        nodeLabel: { selector: "x.Label" },
        autoExpand: { selector: "x.AutoExpand" },
        supportsFiltering: { selector: "x.SupportsFiltering" },
        extendedData: {
          sel: { selector: "x.ExtendedData" },
        },
        grouping: {
          byClass: { hideIfNoSiblings: { selector: "x.classGroupHideIfNoSiblings" }, autoExpand: { selector: "x.classGroupAutoExpand" } },
          byLabel: { selector: "x.byLabel" },
          byBaseClasses: {
            fullClassNames: [{ selector: "x.baseClassFullGroupClassName" }],
            hideIfNoSiblings: { selector: "x.baseClassGroupHideIfNoSiblings" },
            hideIfOneGroupedNode: { selector: "x.baseClassGroupHideIfOneGroupedNode" },
            autoExpand: { selector: "x.baseClassGroupAutoExpand" },
          },
          byProperties: {
            propertiesClassName: "testSchema.testName",
            createGroupForOutOfRangeValues: { selector: "x.propertyGroupCreateGroupForOutOfRangeValues" },
            createGroupForUnspecifiedValues: { selector: "x.propertyGroupCreateGroupForUnspecifiedValues" },
            propertyGroups: [
              {
                propertyName: "PropertyName",
                propertyClassAlias: "x",
                ranges: [
                  {
                    fromValue: { selector: "x.propertyFromValue" },
                    toValue: { selector: "x.propertyToValue" },
                  },
                ],
              },
            ],
          },
        },
        hasChildren: { selector: "x.HasChildren" },
        hideIfNoChildren: { selector: "x.HideIfNoChildren" },
        hideNodeInHierarchy: { selector: "x.HideNodeInHierarchy" },
      });
      expect(trimWhitespace(result)).to.eq(
        trimWhitespace(`
        ec_ClassName(x.ECClassId) AS ${NodeSelectClauseColumnNames.FullClassName},
        x.ECInstanceId AS ${NodeSelectClauseColumnNames.ECInstanceId},
        x.Label AS ${NodeSelectClauseColumnNames.DisplayLabel},
        CAST(x.HasChildren AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
        CAST(x.HideIfNoChildren AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(x.HideNodeInHierarchy AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
        json_object(
          'byLabel', x.byLabel,
          'byClass', json_object('hideIfNoSiblings', x.classGroupHideIfNoSiblings, 'autoExpand', x.classGroupAutoExpand),
          'byBaseClasses', json_object('fullClassNames', json_array(x.baseClassFullGroupClassName), 'hideIfNoSiblings', x.baseClassGroupHideIfNoSiblings, 'hideIfOneGroupedNode', x.baseClassGroupHideIfOneGroupedNode, 'autoExpand', x.baseClassGroupAutoExpand),
          'byProperties', json_object('propertiesClassName', 'testSchema.testName', 'propertyGroups', json_array(json_object('propertyName', 'PropertyName', 'propertyValue', [x].[PropertyName], 'ranges', json_array(json_object('fromValue', x.propertyFromValue, 'toValue', x.propertyToValue)))), 'createGroupForOutOfRangeValues', CAST(x.propertyGroupCreateGroupForOutOfRangeValues AS BOOLEAN), 'createGroupForUnspecifiedValues', CAST(x.propertyGroupCreateGroupForUnspecifiedValues AS BOOLEAN))
        ) AS ${NodeSelectClauseColumnNames.Grouping},
        json_object(
          'sel', x.ExtendedData
        ) AS ${NodeSelectClauseColumnNames.ExtendedData},
        CAST(x.AutoExpand AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand},
        CAST(x.SupportsFiltering AS BOOLEAN) AS ${NodeSelectClauseColumnNames.SupportsFiltering}
      `),
      );
    });

    it("creates valid clause with null props", async () => {
      const result = await factory.createSelectClause({
        ecClassId: "0x1",
        ecInstanceId: "0x2",
        nodeLabel: "label",
      });
      expect(trimWhitespace(result)).to.eq(
        trimWhitespace(`
        ec_ClassName(0x1) AS ${NodeSelectClauseColumnNames.FullClassName},
        0x2 AS ${NodeSelectClauseColumnNames.ECInstanceId},
        'label' AS ${NodeSelectClauseColumnNames.DisplayLabel},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
        CAST(NULL AS TEXT) AS ${NodeSelectClauseColumnNames.Grouping},
        CAST(NULL AS TEXT) AS ${NodeSelectClauseColumnNames.ExtendedData},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.SupportsFiltering}
      `),
      );
    });

    it("creates valid clause with complex grouping params", async () => {
      const result = await factory.createSelectClause({
        ecClassId: "0x1",
        ecInstanceId: "0x2",
        nodeLabel: "label",
        grouping: {
          byLabel: { mergeId: "merge id" },
          byClass: { autoExpand: "always", hideIfNoSiblings: false, hideIfOneGroupedNode: false },
          byBaseClasses: {
            fullClassNames: ["testSchema.testName"],
          },
          byProperties: {
            propertiesClassName: "testSchema.testName",
            propertyGroups: [
              {
                propertyName: "PropertyName",
                propertyClassAlias: "this",
              },
            ],
          },
        },
      });
      expect(trimWhitespace(result)).to.eq(
        trimWhitespace(`
        ec_ClassName(0x1) AS ${NodeSelectClauseColumnNames.FullClassName},
        0x2 AS ${NodeSelectClauseColumnNames.ECInstanceId},
        'label' AS ${NodeSelectClauseColumnNames.DisplayLabel},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
        json_object(
          'byLabel', json_object('mergeId', 'merge id'),
          'byClass', json_object('hideIfNoSiblings', FALSE, 'hideIfOneGroupedNode', FALSE, 'autoExpand', 'always'),
          'byBaseClasses', json_object('fullClassNames', json_array('testSchema.testName')),
          'byProperties', json_object('propertiesClassName', 'testSchema.testName', 'propertyGroups', json_array(json_object('propertyName', 'PropertyName', 'propertyValue', [this].[PropertyName])))
        ) AS ${NodeSelectClauseColumnNames.Grouping},
        CAST(NULL AS TEXT) AS ${NodeSelectClauseColumnNames.ExtendedData},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.SupportsFiltering}
      `),
      );
    });

    it("returns columns in valid order", async () => {
      const expectedOrder = Object.keys(NodeSelectClauseColumnNames);
      const clause = await factory.createSelectClause({
        ecClassId: "0x1",
        ecInstanceId: "0x2",
        nodeLabel: "test",
      });
      const actualOrder = new Array<string>();
      for (const match of clause.matchAll(/ AS (?<column_name>[\w\d_]+)[,\s]/gim)) {
        if (match.groups?.column_name) {
          actualOrder.push(match.groups.column_name);
        }
      }
      expect(actualOrder).to.deep.eq(expectedOrder);
    });
  });

  describe("createFilterClauses", () => {
    let classStubs: ClassStubs;
    beforeEach(() => {
      classStubs = createClassStubs(metadataProvider);
    });
    afterEach(() => {
      sinon.restore();
    });

    it("creates valid result when filter is undefined", async () => {
      classStubs.stubEntityClass({ schemaName: "x", className: "y" });
      expect(await factory.createFilterClauses(undefined, { fullName: "x.y", alias: "content-class" })).to.deep.eq({
        from: "x.y",
        joins: "",
        where: "",
      });
    });

    it("creates valid result when content and property classes don't intersect", async () => {
      classStubs.stubEntityClass({ schemaName: "x", className: "a" });
      classStubs.stubEntityClass({ schemaName: "x", className: "b" });
      const filter: GenericInstanceFilter = {
        propertyClassName: "x.a",
        relatedInstances: [],
        rules: {
          operator: "And",
          rules: [],
        },
      };
      expect(await factory.createFilterClauses(filter, { fullName: "x.b", alias: "content-class" })).to.deep.eq({
        from: "x.b",
        joins: "",
        where: "FALSE",
      });
    });

    describe("from", () => {
      it("specializes content class if property class is its subclass", async () => {
        classStubs.stubEntityClass({ schemaName: "x", className: "a" });
        classStubs.stubEntityClass({ schemaName: "x", className: "b", is: async () => true });
        const filter: GenericInstanceFilter = {
          propertyClassName: "x.b",
          relatedInstances: [],
          rules: {
            operator: "And",
            rules: [],
          },
        };
        expect(await factory.createFilterClauses(filter, { fullName: "x.a", alias: "content-class" })).to.deep.eq({
          from: "x.b",
          joins: "",
          where: "",
        });
      });

      it("uses content class if it's a subclass of property class", async () => {
        classStubs.stubEntityClass({ schemaName: "x", className: "a", is: async () => true });
        classStubs.stubEntityClass({ schemaName: "x", className: "b" });
        const filter: GenericInstanceFilter = {
          propertyClassName: "x.b",
          relatedInstances: [],
          rules: {
            operator: "And",
            rules: [],
          },
        };
        expect(await factory.createFilterClauses(filter, { fullName: "x.a", alias: "content-class" })).to.deep.eq({
          from: "x.a",
          joins: "",
          where: "",
        });
      });
    });

    describe("where", () => {
      describe("by filter classes", () => {
        it("adds class filter when filter class names are specified", async () => {
          classStubs.stubEntityClass({ schemaName: "x", className: "y", is: async () => true });
          const filter: GenericInstanceFilter = {
            propertyClassName: "x.y",
            filterClassNames: ["x.a", "x.b"],
            relatedInstances: [],
            rules: {
              operator: "And",
              rules: [],
            },
          };
          expect(await factory.createFilterClauses(filter, { fullName: "x.y", alias: "content-class" })).to.deep.eq({
            from: "x.y",
            joins: "",
            where: "[content-class].[ECClassId] IS (x.a, x.b)",
          });
        });
      });

      describe("by properties", () => {
        const testClassProps = { schemaName: "s", className: "c", is: async () => true };
        interface TestPropertyFilterProps {
          classAlias: string;
          rule: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup;
          expectedECSql: string;
          skipClassStub?: boolean;
          relatedInstances?: RelatedInstanceDescription[];
        }
        async function testPropertyFilter({ classAlias, rule, expectedECSql, skipClassStub, relatedInstances }: TestPropertyFilterProps) {
          if (!skipClassStub) {
            classStubs.stubEntityClass(testClassProps);
          }
          const filter: GenericInstanceFilter = {
            propertyClassName: "s.c",
            relatedInstances: relatedInstances ?? [],
            rules: rule,
          };
          const res = await factory.createFilterClauses(filter, { fullName: "s.c", alias: classAlias });
          expect(trimWhitespace(res.where ?? "")).to.eq(trimWhitespace(expectedECSql));
        }

        it(`joins multiple rule groups with "and" operator`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: {
              operator: "And",
              rules: [
                {
                  propertyName: "a",
                  operator: "True",
                },
                {
                  propertyName: "b",
                  operator: "False",
                },
              ],
            },
            expectedECSql: `[x].[a] AND NOT [x].[b]`,
          }));

        it(`joins multiple rule groups with "or" operator`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: {
              operator: "Or",
              rules: [
                {
                  propertyName: "a",
                  operator: "True",
                },
                {
                  propertyName: "b",
                  operator: "False",
                },
              ],
            },
            expectedECSql: `([x].[a] OR NOT [x].[b])`,
          }));

        it(`creates "is true" filter`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: { propertyName: "p", operator: "True" },
            expectedECSql: `[x].[p]`,
          }));

        it(`creates "is false" filter`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: { propertyName: "p", operator: "False" },
            expectedECSql: `NOT [x].[p]`,
          }));

        it(`creates "is null" filter`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: { propertyName: "p", operator: "Null" },
            expectedECSql: `[x].[p] IS NULL`,
          }));

        it(`creates "is not null" filter`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: { propertyName: "p", operator: "NotNull" },
            expectedECSql: `[x].[p] IS NOT NULL`,
          }));

        it(`creates navigation property filter`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [{ name: "p", isNavigation: () => true } as ECNavigationProperty],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator: "Equal", value: { className: "a.b", id: "0x123" } },
            expectedECSql: `[x].[p].[Id] = 0x123`,
          });
        });

        it(`creates string enumeration property filter`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [{ name: "p", isNavigation: () => false, isEnumeration: () => true } as ECEnumerationProperty],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator: "Equal", value: "abc" },
            expectedECSql: `[x].[p] = 'abc'`,
          });
        });

        it(`creates numeric enumeration property filter`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [{ name: "p", isNavigation: () => false, isEnumeration: () => true } as ECEnumerationProperty],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator: "Equal", value: 123 },
            expectedECSql: `[x].[p] = 123`,
          });
        });

        it(`creates point2d property filter`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Point2d",
              } as ECPrimitiveProperty,
            ],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator: "Equal", value: { x: 1.23, y: 4.56 } },
            expectedECSql: `
              [x].[p].[x] BETWEEN ${1.23 - Number.EPSILON} AND ${1.23 + Number.EPSILON}
              AND [x].[p].[y] BETWEEN ${4.56 - Number.EPSILON} AND ${4.56 + Number.EPSILON}
            `,
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator: "NotEqual", value: { x: 1.23, y: 4.56 } },
            expectedECSql: `
              NOT (
                [x].[p].[x] BETWEEN ${1.23 - Number.EPSILON} AND ${1.23 + Number.EPSILON}
                AND [x].[p].[y] BETWEEN ${4.56 - Number.EPSILON} AND ${4.56 + Number.EPSILON}
              )
            `,
          });
        });

        it(`creates point3d property filter`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Point3d",
              } as ECPrimitiveProperty,
            ],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator: "Equal", value: { x: 1.23, y: 4.56, z: 7.89 } },
            expectedECSql: `
              [x].[p].[x] BETWEEN ${1.23 - Number.EPSILON} AND ${1.23 + Number.EPSILON}
              AND [x].[p].[y] BETWEEN ${4.56 - Number.EPSILON} AND ${4.56 + Number.EPSILON}
              AND [x].[p].[z] BETWEEN ${7.89 - Number.EPSILON} AND ${7.89 + Number.EPSILON}
            `,
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator: "NotEqual", value: { x: 1.23, y: 4.56, z: 7.89 } },
            expectedECSql: `
              NOT (
                [x].[p].[x] BETWEEN ${1.23 - Number.EPSILON} AND ${1.23 + Number.EPSILON}
                AND [x].[p].[y] BETWEEN ${4.56 - Number.EPSILON} AND ${4.56 + Number.EPSILON}
                AND [x].[p].[z] BETWEEN ${7.89 - Number.EPSILON} AND ${7.89 + Number.EPSILON}
              )
            `,
          });
        });

        it(`creates DateTime property filter`, async () => {
          const now = new Date();
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "DateTime",
              } as ECPrimitiveProperty,
            ],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator: "LessOrEqual", value: now },
            expectedECSql: `[x].[p] <= julianday('${now.toISOString()}')`,
          });
        });

        it(`creates floating point property filters`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Double",
              } as ECPrimitiveProperty,
            ],
          });
          const createProps = (operator: PropertyFilterRuleBinaryOperator, value: number, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator, value },
            expectedECSql,
          });
          await testPropertyFilter(createProps("Greater", 1.23456, `[x].[p] > 1.23456`));
          await testPropertyFilter(createProps("GreaterOrEqual", 1.23456, `[x].[p] >= 1.23456`));
          await testPropertyFilter(createProps("Less", 1.23456, `[x].[p] < 1.23456`));
          await testPropertyFilter(createProps("LessOrEqual", 1.23456, `[x].[p] <= 1.23456`));
          await testPropertyFilter(createProps("Equal", 1.23456, `[x].[p] BETWEEN ${1.23456 - Number.EPSILON} AND ${1.23456 + Number.EPSILON}`));
          await testPropertyFilter(createProps("NotEqual", 1.23456, `[x].[p] NOT BETWEEN ${1.23456 - Number.EPSILON} AND ${1.23456 + Number.EPSILON}`));
        });

        it(`creates string property filters`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "String",
              } as ECPrimitiveProperty,
            ],
          });
          const createProps = (operator: PropertyFilterRuleBinaryOperator, value: string, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator, value },
            expectedECSql,
          });
          await testPropertyFilter(createProps("Equal", "test", `[x].[p] = 'test'`));
          await testPropertyFilter(createProps("NotEqual", "test", `[x].[p] <> 'test'`));
          await testPropertyFilter(createProps("Like", "test%", `[x].[p] LIKE 'test%' ESCAPE '\\'`));
        });

        it(`creates boolean property filters`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Boolean",
              } as ECPrimitiveProperty,
            ],
          });
          const createProps = (operator: PropertyFilterRuleBinaryOperator, value: boolean, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator, value },
            expectedECSql,
          });
          await testPropertyFilter(createProps("Equal", true, `[x].[p] = TRUE`));
          await testPropertyFilter(createProps("NotEqual", false, `[x].[p] <> FALSE`));
        });

        it(`creates integer property filters`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Integer",
              } as ECPrimitiveProperty,
            ],
          });
          const createProps = (operator: PropertyFilterRuleBinaryOperator, value: number, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator, value },
            expectedECSql,
          });
          await testPropertyFilter(createProps("Equal", 123, `[x].[p] = 123`));
          await testPropertyFilter(createProps("NotEqual", 123, `[x].[p] <> 123`));
          await testPropertyFilter(createProps("Less", 123, `[x].[p] < 123`));
          await testPropertyFilter(createProps("LessOrEqual", 123, `[x].[p] <= 123`));
          await testPropertyFilter(createProps("Greater", 123, `[x].[p] > 123`));
          await testPropertyFilter(createProps("GreaterOrEqual", 123, `[x].[p] >= 123`));
        });

        it(`creates long property filters`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Long",
              } as ECPrimitiveProperty,
            ],
          });
          const createProps = (operator: PropertyFilterRuleBinaryOperator, value: number, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: { propertyName: "p", operator, value },
            expectedECSql,
          });
          const long = Number.MAX_SAFE_INTEGER;
          await testPropertyFilter(createProps("Equal", long, `[x].[p] = ${long}`));
          await testPropertyFilter(createProps("NotEqual", long, `[x].[p] <> ${long}`));
          await testPropertyFilter(createProps("Less", long, `[x].[p] < ${long}`));
          await testPropertyFilter(createProps("LessOrEqual", long, `[x].[p] <= ${long}`));
          await testPropertyFilter(createProps("Greater", long, `[x].[p] > ${long}`));
          await testPropertyFilter(createProps("GreaterOrEqual", long, `[x].[p] >= ${long}`));
        });

        it(`creates related property filters`, async () => {
          const contentClass = classStubs.stubEntityClass(testClassProps);
          const propertyClass = classStubs.stubEntityClass({
            schemaName: "x",
            className: "target",
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Integer",
              } as ECPrimitiveProperty,
            ],
          });
          const relationship = classStubs.stubRelationshipClass({
            schemaName: "x",
            className: "rel",
            source: { polymorphic: false, abstractConstraint: Promise.resolve(contentClass) },
            target: { polymorphic: false, abstractConstraint: Promise.resolve(propertyClass) },
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            relatedInstances: [
              {
                path: [
                  {
                    sourceClassName: contentClass.fullName,
                    relationshipName: relationship.fullName,
                    targetClassName: propertyClass.fullName,
                  },
                ],
                alias: "r",
              },
            ],
            rule: { sourceAlias: "r", propertyName: "p", operator: "Equal", value: 123 },
            expectedECSql: `[r].[p] = 123`,
          });
        });

        it(`throws when related property filter uses non-existing class alias`, async () => {
          const contentClass = classStubs.stubEntityClass(testClassProps);
          const propertyClass = classStubs.stubEntityClass({
            schemaName: "x",
            className: "target",
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Integer",
              } as ECPrimitiveProperty,
            ],
          });
          const relationship = classStubs.stubRelationshipClass({
            schemaName: "x",
            className: "rel",
            source: { polymorphic: false, abstractConstraint: Promise.resolve(contentClass) },
            target: { polymorphic: false, abstractConstraint: Promise.resolve(propertyClass) },
          });
          await expect(
            factory.createFilterClauses(
              {
                propertyClassName: contentClass.fullName,
                relatedInstances: [
                  {
                    path: [
                      {
                        sourceClassName: contentClass.fullName,
                        relationshipName: relationship.fullName,
                        targetClassName: propertyClass.fullName,
                      },
                    ],
                    alias: "r",
                  },
                ],
                rules: { sourceAlias: "does-not-exist", propertyName: "p", operator: "Equal", value: 123 },
              },
              { fullName: contentClass.fullName, alias: "x" },
            ),
          ).to.eventually.be.rejected;
        });

        it(`throws when property class doesn't have the property`, async () => {
          const contentClass = classStubs.stubEntityClass(testClassProps);
          await expect(
            factory.createFilterClauses(
              {
                propertyClassName: contentClass.fullName,
                relatedInstances: [],
                rules: { sourceAlias: "x", propertyName: "p", operator: "Equal", value: 123 },
              },
              { fullName: contentClass.fullName, alias: "x" },
            ),
          ).to.eventually.be.rejected;
        });

        it(`throws on struct property filters`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => false,
                isStruct: () => true,
              } as ECStructProperty,
            ],
          });
          await expect(
            testPropertyFilter({
              skipClassStub: true,
              classAlias: "x",
              rule: { propertyName: "p", operator: "Equal", value: "test" },
              expectedECSql: ``,
            }),
          ).to.eventually.be.rejected;
        });

        it(`throws on array property filters`, async () => {
          classStubs.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => false,
                isArray: () => true,
              } as ECArrayProperty,
            ],
          });
          await expect(
            testPropertyFilter({
              skipClassStub: true,
              classAlias: "x",
              rule: { propertyName: "p", operator: "Equal", value: "test" },
              expectedECSql: ``,
            }),
          ).to.eventually.be.rejected;
        });
      });
    });

    describe("join", () => {
      it("creates joins for single-step related instance path", async () => {
        const sourceClass = classStubs.stubEntityClass({ schemaName: "x", className: "y", is: async () => true });
        classStubs.stubRelationshipClass({
          schemaName: "x",
          className: "r",
          direction: "Forward",
          source: {
            abstractConstraint: Promise.resolve(sourceClass),
            polymorphic: false,
          },
          target: {
            abstractConstraint: Promise.resolve(classStubs.stubEntityClass({ schemaName: "x", className: "t" })),
            polymorphic: false,
          },
        });
        const filter: GenericInstanceFilter = {
          propertyClassName: "x.y",
          relatedInstances: [
            {
              path: [
                {
                  sourceClassName: "x.y",
                  relationshipName: "x.r",
                  targetClassName: "x.t",
                },
              ],
              alias: "a",
            },
          ],
          rules: {
            operator: "And",
            rules: [],
          },
        };
        const res = await factory.createFilterClauses(filter, { fullName: "x.y", alias: "content-class" });
        expect(trimWhitespace(res.joins)).to.deep.eq(
          trimWhitespace(`
            INNER JOIN [x].[r] [rel_0_x_r_0] ON [rel_0_x_r_0].[SourceECInstanceId] = [content-class].[ECInstanceId]
            INNER JOIN [x].[t] [a] ON [a].[ECInstanceId] = [rel_0_x_r_0].[TargetECInstanceId]
          `),
        );
      });

      it("creates joins for multi-step related instance path", async () => {
        const sourceClass = classStubs.stubEntityClass({ schemaName: "x", className: "y", is: async () => true });
        const intermediateClass = classStubs.stubEntityClass({ schemaName: "x", className: "t1" });
        const targetClass = classStubs.stubEntityClass({ schemaName: "x", className: "t2" });
        classStubs.stubRelationshipClass({
          schemaName: "x",
          className: "r1",
          direction: "Forward",
          source: {
            abstractConstraint: Promise.resolve(sourceClass),
            polymorphic: false,
          },
          target: {
            abstractConstraint: Promise.resolve(intermediateClass),
            polymorphic: false,
          },
        });
        classStubs.stubRelationshipClass({
          schemaName: "x",
          className: "r2",
          direction: "Forward",
          source: {
            abstractConstraint: Promise.resolve(intermediateClass),
            polymorphic: false,
          },
          target: {
            abstractConstraint: Promise.resolve(targetClass),
            polymorphic: false,
          },
        });
        const filter: GenericInstanceFilter = {
          propertyClassName: "x.y",
          relatedInstances: [
            {
              path: [
                {
                  sourceClassName: "x.y",
                  relationshipName: "x.r1",
                  targetClassName: "x.t1",
                },
                {
                  sourceClassName: "x.t1",
                  relationshipName: "x.r2",
                  relationshipReverse: true,
                  targetClassName: "x.t2",
                },
              ],
              alias: "a",
            },
          ],
          rules: {
            operator: "And",
            rules: [],
          },
        };
        const res = await factory.createFilterClauses(filter, { fullName: "x.y", alias: "content-class" });
        expect(trimWhitespace(res.joins)).to.deep.eq(
          trimWhitespace(`
            INNER JOIN [x].[r1] [rel_0_x_r1_0] ON [rel_0_x_r1_0].[SourceECInstanceId] = [content-class].[ECInstanceId]
            INNER JOIN [x].[t1] [rel_0_x_t1_0] ON [rel_0_x_t1_0].[ECInstanceId] = [rel_0_x_r1_0].[TargetECInstanceId]
            INNER JOIN [x].[r2] [rel_0_x_r2_1] ON [rel_0_x_r2_1].[TargetECInstanceId] = [rel_0_x_t1_0].[ECInstanceId]
            INNER JOIN [x].[t2] [a] ON [a].[ECInstanceId] = [rel_0_x_r2_1].[SourceECInstanceId]
          `),
        );
      });

      it("creates joins for multiple related instance paths", async () => {
        const sourceClass = classStubs.stubEntityClass({ schemaName: "x", className: "y", is: async () => true });
        const targetClass1 = classStubs.stubEntityClass({ schemaName: "x", className: "t1" });
        const targetClass2 = classStubs.stubEntityClass({ schemaName: "x", className: "t2" });
        classStubs.stubRelationshipClass({
          schemaName: "x",
          className: "r1",
          direction: "Forward",
          source: {
            abstractConstraint: Promise.resolve(sourceClass),
            polymorphic: false,
          },
          target: {
            abstractConstraint: Promise.resolve(targetClass1),
            polymorphic: false,
          },
        });
        classStubs.stubRelationshipClass({
          schemaName: "x",
          className: "r2",
          direction: "Forward",
          source: {
            abstractConstraint: Promise.resolve(sourceClass),
            polymorphic: false,
          },
          target: {
            abstractConstraint: Promise.resolve(targetClass2),
            polymorphic: false,
          },
        });
        const filter: GenericInstanceFilter = {
          propertyClassName: "x.y",
          relatedInstances: [
            {
              path: [
                {
                  sourceClassName: "x.y",
                  relationshipName: "x.r1",
                  targetClassName: "x.t1",
                },
              ],
              alias: "a",
            },
            {
              path: [
                {
                  sourceClassName: "x.y",
                  relationshipName: "x.r2",
                  relationshipReverse: true,
                  targetClassName: "x.t2",
                },
              ],
              alias: "b",
            },
          ],
          rules: {
            operator: "And",
            rules: [],
          },
        };
        const res = await factory.createFilterClauses(filter, { fullName: "x.y", alias: "content-class" });
        expect(trimWhitespace(res.joins)).to.deep.eq(
          trimWhitespace(`
            INNER JOIN [x].[r1] [rel_0_x_r1_0] ON [rel_0_x_r1_0].[SourceECInstanceId] = [content-class].[ECInstanceId]
            INNER JOIN [x].[t1] [a] ON [a].[ECInstanceId] = [rel_0_x_r1_0].[TargetECInstanceId]
            INNER JOIN [x].[r2] [rel_1_x_r2_0] ON [rel_1_x_r2_0].[TargetECInstanceId] = [content-class].[ECInstanceId]
            INNER JOIN [x].[t2] [b] ON [b].[ECInstanceId] = [rel_1_x_r2_0].[SourceECInstanceId]
          `),
        );
      });
    });
  });
});
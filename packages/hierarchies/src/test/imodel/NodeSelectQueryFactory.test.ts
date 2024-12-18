/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import {
  GenericInstanceFilter,
  GenericInstanceFilterRelatedInstanceDescription,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
  GenericInstanceFilterRuleOperator,
} from "@itwin/core-common";
import { EC, trimWhitespace } from "@itwin/presentation-shared";
import { createNodesQueryClauseFactory, NodeSelectClauseColumnNames, NodesQueryClauseFactory } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import { createIModelAccessStub, createInstanceLabelSelectClauseFactoryStub } from "../Utils.js";

describe("createNodesQueryClauseFactory", () => {
  let imodelAccess: ReturnType<typeof createIModelAccessStub>;
  let factory: NodesQueryClauseFactory;
  let instanceLabelSelectClauseFactory: ReturnType<typeof createInstanceLabelSelectClauseFactoryStub>;
  beforeEach(() => {
    imodelAccess = createIModelAccessStub();
    instanceLabelSelectClauseFactory = createInstanceLabelSelectClauseFactoryStub();
    factory = createNodesQueryClauseFactory({ imodelAccess, instanceLabelSelectClauseFactory });
  });
  afterEach(() => {
    sinon.restore();
  });

  describe("createSelectClause", () => {
    it(`throws when property grouping uses non-existing class name`, async () => {
      await expect(
        factory.createSelectClause({
          ecClassId: { selector: "class_id" },
          ecInstanceId: { selector: "instance_id" },
          nodeLabel: "label",
          grouping: {
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
        }),
      ).to.eventually.be.rejected;
    });

    it(`throws when property class doesn't have the property`, async () => {
      imodelAccess.stubEntityClass({
        schemaName: "testSchema",
        className: "testName",
        is: async () => true,
      });
      await expect(
        factory.createSelectClause({
          ecClassId: { selector: "class_id" },
          ecInstanceId: { selector: "instance_id" },
          nodeLabel: "label",
          grouping: {
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
        }),
      ).to.eventually.be.rejected;
    });

    it(`throws when abstractConstraint is undefined`, async () => {
      imodelAccess.stubEntityClass({
        schemaName: "testSchema",
        className: "testName",
        is: async () => true,
        properties: [
          {
            name: "PropertyName",
            isNavigation: () => true,
            direction: "Forward",
            relationshipClass: Promise.resolve({
              target: {
                abstractConstraint: Promise.resolve(undefined),
              },
            }),
          } as EC.NavigationProperty,
        ],
      });
      await expect(
        factory.createSelectClause({
          ecClassId: { selector: "class_id" },
          ecInstanceId: { selector: "instance_id" },
          nodeLabel: "label",
          grouping: {
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
        }),
      ).to.eventually.be.rejected;
    });

    it("creates valid clause with value props", async () => {
      imodelAccess.stubEntityClass({
        schemaName: "testSchema",
        className: "testName",
        is: async () => true,
        properties: [{ name: "PropertyName", isNavigation: () => false } as EC.Property],
      });
      const result = await factory.createSelectClause({
        ecClassId: { selector: "class_id" },
        ecInstanceId: { selector: "instance_id" },
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
          byLabel: { groupId: "group id", hideIfOneGroupedNode: false, autoExpand: "single-child" },
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
        ec_ClassName(class_id) AS ${NodeSelectClauseColumnNames.FullClassName},
        instance_id AS ${NodeSelectClauseColumnNames.ECInstanceId},
        'label' AS ${NodeSelectClauseColumnNames.DisplayLabel},
        CAST(TRUE AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
        CAST(TRUE AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(TRUE AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
        json_object(
          'byLabel', json_object('groupId', 'group id', 'hideIfOneGroupedNode', FALSE, 'autoExpand', 'single-child'),
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

    it("creates valid clause with value props and navigation property", async () => {
      imodelAccess.stubEntityClass({
        schemaName: "testSchema",
        className: "testName",
        is: async () => true,
        properties: [
          {
            name: "PropertyName",
            isNavigation: () => true,
            direction: "Backward",
            relationshipClass: Promise.resolve({
              source: {
                abstractConstraint: Promise.resolve({ fullName: "testSchema.SourceClass" }),
              },
            }),
          } as EC.NavigationProperty,
        ],
      });
      const result = await factory.createSelectClause({
        ecClassId: { selector: "class_id" },
        ecInstanceId: { selector: "instance_id" },
        nodeLabel: "label",
        grouping: {
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
        ec_ClassName(class_id) AS ${NodeSelectClauseColumnNames.FullClassName},
        instance_id AS ${NodeSelectClauseColumnNames.ECInstanceId},
        'label' AS ${NodeSelectClauseColumnNames.DisplayLabel},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
        json_object(
          'byProperties', json_object('propertiesClassName', 'testSchema.testName', 'propertyGroups', json_array(json_object('propertyName', 'PropertyName', 'propertyValue', (
            SELECT ${await instanceLabelSelectClauseFactory.createSelectClause({ classAlias: "target" })}
            FROM testSchema.SourceClass AS target
            WHERE [target].[ECInstanceId] = [this].[PropertyName].[Id]))))
        ) AS ${NodeSelectClauseColumnNames.Grouping},
        CAST(NULL AS TEXT) AS ${NodeSelectClauseColumnNames.ExtendedData},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.SupportsFiltering}
      `),
      );
    });

    it("creates valid clause with selector props", async () => {
      imodelAccess.stubEntityClass({
        schemaName: "testSchema",
        className: "testName",
        is: async () => true,
        properties: [{ name: "PropertyName", isNavigation: () => false } as EC.Property],
      });
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
        ecClassId: { selector: "class_id" },
        ecInstanceId: { selector: "instance_id" },
        nodeLabel: "label",
      });
      expect(trimWhitespace(result)).to.eq(
        trimWhitespace(`
        ec_ClassName(class_id) AS ${NodeSelectClauseColumnNames.FullClassName},
        instance_id AS ${NodeSelectClauseColumnNames.ECInstanceId},
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
      imodelAccess.stubEntityClass({
        schemaName: "testSchema",
        className: "testName",
        is: async () => true,
        properties: [{ name: "PropertyName", isNavigation: () => false } as EC.Property],
      });
      const result = await factory.createSelectClause({
        ecClassId: { selector: "class_id" },
        ecInstanceId: { selector: "instance_id" },
        nodeLabel: "label",
        grouping: {
          byLabel: { action: "merge" },
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
        ec_ClassName(class_id) AS ${NodeSelectClauseColumnNames.FullClassName},
        instance_id AS ${NodeSelectClauseColumnNames.ECInstanceId},
        'label' AS ${NodeSelectClauseColumnNames.DisplayLabel},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
        json_object(
          'byLabel', json_object('action', 'merge'),
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
        ecClassId: { selector: "'0x1'" },
        ecInstanceId: { selector: "'0x2'" },
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
    it("creates valid result when filter is undefined", async () => {
      imodelAccess.stubEntityClass({ schemaName: "x", className: "y" });
      expect(await factory.createFilterClauses({ filter: undefined, contentClass: { fullName: "x.y", alias: "content-class" } })).to.deep.eq({
        from: "x.y",
        joins: "",
        where: "",
      });
    });

    it("creates valid result when content and property classes don't intersect", async () => {
      imodelAccess.stubEntityClass({ schemaName: "x", className: "a" });
      imodelAccess.stubEntityClass({ schemaName: "x", className: "b" });
      const filter: GenericInstanceFilter = {
        propertyClassNames: ["x.a"],
        relatedInstances: [],
        rules: {
          operator: "and",
          rules: [],
        },
      };
      expect(await factory.createFilterClauses({ filter, contentClass: { fullName: "x.b", alias: "content-class" } })).to.deep.eq({
        from: "x.b",
        joins: "",
        where: "FALSE",
      });
    });

    describe("from", () => {
      it("specializes content class if property class is its subclass", async () => {
        imodelAccess.stubEntityClass({ schemaName: "x", className: "a" });
        imodelAccess.stubEntityClass({ schemaName: "x", className: "b", is: async () => true });
        const filter: GenericInstanceFilter = {
          propertyClassNames: ["x.b"],
          relatedInstances: [],
          rules: {
            operator: "and",
            rules: [],
          },
        };
        expect(await factory.createFilterClauses({ filter, contentClass: { fullName: "x.a", alias: "content-class" } })).to.deep.eq({
          from: "x.b",
          joins: "",
          where: "",
        });
      });

      it("uses content class if it's a subclass of property class", async () => {
        imodelAccess.stubEntityClass({ schemaName: "x", className: "a", is: async () => true });
        imodelAccess.stubEntityClass({ schemaName: "x", className: "b" });
        const filter: GenericInstanceFilter = {
          propertyClassNames: ["x.b"],
          relatedInstances: [],
          rules: {
            operator: "and",
            rules: [],
          },
        };
        expect(await factory.createFilterClauses({ filter, contentClass: { fullName: "x.a", alias: "content-class" } })).to.deep.eq({
          from: "x.a",
          joins: "",
          where: "",
        });
      });

      it("uses content class if no property classes are provided", async () => {
        imodelAccess.stubEntityClass({ schemaName: "x", className: "a" });
        const filter: GenericInstanceFilter = {
          propertyClassNames: [],
          relatedInstances: [],
          rules: {
            operator: "and",
            rules: [],
          },
        };
        expect(await factory.createFilterClauses({ filter, contentClass: { fullName: "x.a", alias: "content-class" } })).to.deep.eq({
          from: "x.a",
          joins: "",
          where: "",
        });
      });

      it("uses the most specific property class when multiple classes provided", async () => {
        imodelAccess.stubEntityClass({ schemaName: "x", className: "a" });
        imodelAccess.stubEntityClass({ schemaName: "x", className: "b", is: async (className) => ["x.a"].includes(className) });
        imodelAccess.stubEntityClass({ schemaName: "x", className: "c", is: async (className) => ["x.a", "x.b"].includes(className) });
        imodelAccess.stubEntityClass({ schemaName: "x", className: "d", is: async (className) => ["x.a", "x.b", "x.c"].includes(className) });
        const filter: GenericInstanceFilter = {
          propertyClassNames: ["x.b", "x.d", "x.c"],
          relatedInstances: [],
          rules: {
            operator: "and",
            rules: [],
          },
        };
        expect(await factory.createFilterClauses({ filter, contentClass: { fullName: "x.a", alias: "content-class" } })).to.deep.eq({
          from: "x.d",
          joins: "",
          where: "",
        });
      });
    });

    describe("where", () => {
      describe("by filter classes", () => {
        it("adds class filter when filter class names are specified", async () => {
          imodelAccess.stubEntityClass({ schemaName: "x", className: "y", is: async () => true });
          const filter: GenericInstanceFilter = {
            propertyClassNames: ["x.y"],
            filteredClassNames: ["x.a", "x.b"],
            relatedInstances: [],
            rules: {
              operator: "and",
              rules: [],
            },
          };
          const clauses = await factory.createFilterClauses({ filter, contentClass: { fullName: "x.y", alias: "content-class" } });
          expect({ ...clauses, where: trimWhitespace(clauses.where) }).to.deep.eq({
            from: "x.y",
            joins: "",
            where: "[content-class].[ECClassId] IS ([x].[a], [x].[b])",
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
          relatedInstances?: GenericInstanceFilterRelatedInstanceDescription[];
        }
        async function testPropertyFilter({ classAlias, rule, expectedECSql, skipClassStub, relatedInstances }: TestPropertyFilterProps) {
          if (!skipClassStub) {
            imodelAccess.stubEntityClass(testClassProps);
          }
          const filter: GenericInstanceFilter = {
            propertyClassNames: ["s.c"],
            relatedInstances: relatedInstances ?? [],
            rules: rule,
          };
          const res = await factory.createFilterClauses({ filter, contentClass: { fullName: "s.c", alias: classAlias } });
          expect(trimWhitespace(res.where ?? "")).to.eq(trimWhitespace(expectedECSql));
        }

        it(`defaults to content class alias if it's not specified for property rule`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: {
              operator: "and",
              rules: [
                {
                  sourceAlias: "",
                  propertyName: "a",
                  operator: "is-true",
                  propertyTypeName: "boolean",
                },
              ],
            },
            expectedECSql: `[x].[a]`,
          }));

        it(`joins multiple rule groups with "and" operator`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: {
              operator: "and",
              rules: [
                {
                  sourceAlias: "x",
                  propertyName: "a",
                  operator: "is-true",
                  propertyTypeName: "boolean",
                },
                {
                  sourceAlias: "x",
                  propertyName: "b",
                  operator: "is-false",
                  propertyTypeName: "boolean",
                },
              ],
            },
            expectedECSql: `[x].[a] AND NOT [x].[b]`,
          }));

        it(`joins multiple rule groups with "or" operator`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: {
              operator: "or",
              rules: [
                {
                  sourceAlias: "x",
                  propertyName: "a",
                  operator: "is-true",
                  propertyTypeName: "boolean",
                },
                {
                  sourceAlias: "x",
                  propertyName: "b",
                  operator: "is-false",
                  propertyTypeName: "boolean",
                },
              ],
            },
            expectedECSql: `([x].[a] OR NOT [x].[b])`,
          }));

        it(`creates "is true" filter`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: { sourceAlias: "x", propertyName: "p", operator: "is-true", propertyTypeName: "boolean" },
            expectedECSql: `[x].[p]`,
          }));

        it(`creates "is false" filter`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: { sourceAlias: "x", propertyName: "p", operator: "is-false", propertyTypeName: "boolean" },
            expectedECSql: `NOT [x].[p]`,
          }));

        it(`creates "is null" filter`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: { sourceAlias: "x", propertyName: "p", operator: "is-null", propertyTypeName: "boolean" },
            expectedECSql: `[x].[p] IS NULL`,
          }));

        it(`creates "is not null" filter`, async () =>
          testPropertyFilter({
            classAlias: "x",
            rule: { sourceAlias: "x", propertyName: "p", operator: "is-not-null", propertyTypeName: "boolean" },
            expectedECSql: `[x].[p] IS NOT NULL`,
          }));

        it(`creates navigation property filter`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [{ name: "p", isNavigation: () => true } as EC.NavigationProperty],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator: "is-equal",
              propertyTypeName: "navigation",
              value: { rawValue: { className: "a.b", id: "0x123" }, displayValue: "a.b" },
            },
            expectedECSql: `[x].[p].[Id] = 0x123`,
          });
        });

        it(`creates string enumeration property filter`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [{ name: "p", isNavigation: () => false, isEnumeration: () => true } as EC.EnumerationProperty],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { sourceAlias: "x", propertyName: "p", operator: "is-equal", propertyTypeName: "string", value: { rawValue: "abc", displayValue: "abc" } },
            expectedECSql: `[x].[p] = 'abc'`,
          });
        });

        it(`creates numeric enumeration property filter`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [{ name: "p", isNavigation: () => false, isEnumeration: () => true } as EC.EnumerationProperty],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: { sourceAlias: "x", propertyName: "p", operator: "is-equal", propertyTypeName: "int", value: { rawValue: 123, displayValue: "123" } },
            expectedECSql: `[x].[p] = 123`,
          });
        });

        it(`creates point2d property filter`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Point2d",
              } as EC.PrimitiveProperty,
            ],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator: "is-equal",
              propertyTypeName: "point2d",
              value: { rawValue: { x: 1.23, y: 4.56 }, displayValue: "X: 1.23 Y:4.56" },
            },
            expectedECSql: `
              [x].[p].[x] BETWEEN ${1.23 - Number.EPSILON} AND ${1.23 + Number.EPSILON}
              AND [x].[p].[y] BETWEEN ${4.56 - Number.EPSILON} AND ${4.56 + Number.EPSILON}
            `,
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator: "is-not-equal",
              propertyTypeName: "point2d",
              value: { rawValue: { x: 1.23, y: 4.56 }, displayValue: "X: 1.23 Y:4.56" },
            },
            expectedECSql: `
              NOT (
                [x].[p].[x] BETWEEN ${1.23 - Number.EPSILON} AND ${1.23 + Number.EPSILON}
                AND [x].[p].[y] BETWEEN ${4.56 - Number.EPSILON} AND ${4.56 + Number.EPSILON}
              )
            `,
          });
        });

        it(`creates point3d property filter`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Point3d",
              } as EC.PrimitiveProperty,
            ],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator: "is-equal",
              propertyTypeName: "point3d",
              value: { rawValue: { x: 1.23, y: 4.56, z: 7.89 }, displayValue: "X 1.23 Y 4.56 Z 7.89" },
            },
            expectedECSql: `
              [x].[p].[x] BETWEEN ${1.23 - Number.EPSILON} AND ${1.23 + Number.EPSILON}
              AND [x].[p].[y] BETWEEN ${4.56 - Number.EPSILON} AND ${4.56 + Number.EPSILON}
              AND [x].[p].[z] BETWEEN ${7.89 - Number.EPSILON} AND ${7.89 + Number.EPSILON}
            `,
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator: "is-not-equal",
              propertyTypeName: "point3d",
              value: { rawValue: { x: 1.23, y: 4.56, z: 7.89 }, displayValue: "X 1.23 Y 4.56 Z 7.89" },
            },
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
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "DateTime",
              } as EC.PrimitiveProperty,
            ],
          });
          await testPropertyFilter({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator: "less-or-equal",
              propertyTypeName: "dateTime",
              value: { rawValue: now, displayValue: now.toDateString() },
            },
            expectedECSql: `[x].[p] <= julianday('${now.toISOString()}')`,
          });
        });

        it(`creates floating point property filters`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Double",
              } as EC.PrimitiveProperty,
            ],
          });
          const createProps = (operator: GenericInstanceFilterRuleOperator, value: number, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator,
              propertyTypeName: "double",
              value: { rawValue: value, displayValue: `${value}` },
            },
            expectedECSql,
          });
          await testPropertyFilter(createProps("greater", 1.23456, `[x].[p] > 1.23456`));
          await testPropertyFilter(createProps("greater-or-equal", 1.23456, `[x].[p] >= 1.23456`));
          await testPropertyFilter(createProps("less", 1.23456, `[x].[p] < 1.23456`));
          await testPropertyFilter(createProps("less-or-equal", 1.23456, `[x].[p] <= 1.23456`));
          await testPropertyFilter(createProps("is-equal", 1.23456, `[x].[p] BETWEEN ${1.23456 - Number.EPSILON} AND ${1.23456 + Number.EPSILON}`));
          await testPropertyFilter(createProps("is-not-equal", 1.23456, `[x].[p] NOT BETWEEN ${1.23456 - Number.EPSILON} AND ${1.23456 + Number.EPSILON}`));
        });

        it(`creates string property filters`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "String",
              } as EC.PrimitiveProperty,
            ],
          });
          const createProps = (operator: GenericInstanceFilterRuleOperator, value: string, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator,
              propertyTypeName: "string",
              value: { rawValue: value, displayValue: `${value}` },
            },
            expectedECSql,
          });
          await testPropertyFilter(createProps("is-equal", "test", `[x].[p] = 'test'`));
          await testPropertyFilter(createProps("is-not-equal", "test", `[x].[p] <> 'test'`));
          await testPropertyFilter(createProps("like", "test", `[x].[p] LIKE '%test%' ESCAPE '\\'`));
          await testPropertyFilter(createProps("like", "t%e%st", `[x].[p] LIKE '%t\\%e\\%st%' ESCAPE '\\'`));
          await testPropertyFilter(createProps("like", "t_e_st", `[x].[p] LIKE '%t\\_e\\_st%' ESCAPE '\\'`));
          await testPropertyFilter(createProps("like", "t\\e\\st", `[x].[p] LIKE '%t\\\\e\\\\st%' ESCAPE '\\'`));
        });

        it(`creates boolean property filters`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Boolean",
              } as EC.PrimitiveProperty,
            ],
          });
          const createProps = (operator: GenericInstanceFilterRuleOperator, value: boolean, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator,
              propertyTypeName: "boolean",
              value: { rawValue: value, displayValue: `${value}` },
            },
            expectedECSql,
          });
          await testPropertyFilter(createProps("is-equal", true, `[x].[p] = TRUE`));
          await testPropertyFilter(createProps("is-not-equal", false, `[x].[p] <> FALSE`));
        });

        it(`creates integer property filters`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Integer",
              } as EC.PrimitiveProperty,
            ],
          });
          const createProps = (operator: GenericInstanceFilterRuleOperator, value: number, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator,
              propertyTypeName: "int",
              value: { rawValue: value, displayValue: `${value}` },
            },
            expectedECSql,
          });
          await testPropertyFilter(createProps("is-equal", 123, `[x].[p] = 123`));
          await testPropertyFilter(createProps("is-not-equal", 123, `[x].[p] <> 123`));
          await testPropertyFilter(createProps("less", 123, `[x].[p] < 123`));
          await testPropertyFilter(createProps("less-or-equal", 123, `[x].[p] <= 123`));
          await testPropertyFilter(createProps("greater", 123, `[x].[p] > 123`));
          await testPropertyFilter(createProps("greater-or-equal", 123, `[x].[p] >= 123`));
        });

        it(`creates long property filters`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Long",
              } as EC.PrimitiveProperty,
            ],
          });
          const createProps = (operator: GenericInstanceFilterRuleOperator, value: number, expectedECSql: string) => ({
            skipClassStub: true,
            classAlias: "x",
            rule: {
              sourceAlias: "x",
              propertyName: "p",
              operator,
              propertyTypeName: "long",
              value: { rawValue: value, displayValue: `${value}` },
            },
            expectedECSql,
          });
          const long = Number.MAX_SAFE_INTEGER;
          await testPropertyFilter(createProps("is-equal", long, `[x].[p] = ${long}`));
          await testPropertyFilter(createProps("is-not-equal", long, `[x].[p] <> ${long}`));
          await testPropertyFilter(createProps("less", long, `[x].[p] < ${long}`));
          await testPropertyFilter(createProps("less-or-equal", long, `[x].[p] <= ${long}`));
          await testPropertyFilter(createProps("greater", long, `[x].[p] > ${long}`));
          await testPropertyFilter(createProps("greater-or-equal", long, `[x].[p] >= ${long}`));
        });

        it(`creates related property filters`, async () => {
          const contentClass = imodelAccess.stubEntityClass(testClassProps);
          const propertyClass = imodelAccess.stubEntityClass({
            schemaName: "x",
            className: "target",
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Integer",
              } as EC.PrimitiveProperty,
            ],
          });
          const relationship = imodelAccess.stubRelationshipClass({
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
                    relationshipClassName: relationship.fullName,
                    targetClassName: propertyClass.fullName,
                    isForwardRelationship: true,
                  },
                ],
                alias: "r",
              },
            ],
            rule: { sourceAlias: "r", propertyName: "p", operator: "is-equal", propertyTypeName: "int", value: { rawValue: 123, displayValue: "123" } },
            expectedECSql: `[r].[p] = 123`,
          });
        });

        it(`throws when related property filter uses non-existing class alias`, async () => {
          const contentClass = imodelAccess.stubEntityClass(testClassProps);
          const propertyClass = imodelAccess.stubEntityClass({
            schemaName: "x",
            className: "target",
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Integer",
              } as EC.PrimitiveProperty,
            ],
          });
          const relationship = imodelAccess.stubRelationshipClass({
            schemaName: "x",
            className: "rel",
            source: { polymorphic: false, abstractConstraint: Promise.resolve(contentClass) },
            target: { polymorphic: false, abstractConstraint: Promise.resolve(propertyClass) },
          });
          await expect(
            factory.createFilterClauses({
              filter: {
                propertyClassNames: [contentClass.fullName],
                relatedInstances: [
                  {
                    path: [
                      {
                        sourceClassName: contentClass.fullName,
                        relationshipClassName: relationship.fullName,
                        targetClassName: propertyClass.fullName,
                        isForwardRelationship: true,
                      },
                    ],
                    alias: "r",
                  },
                ],
                rules: {
                  sourceAlias: "does-not-exist",
                  propertyName: "p",
                  operator: "is-equal",
                  propertyTypeName: "int",
                  value: { rawValue: 123, displayValue: "123" },
                },
              },
              contentClass: { fullName: contentClass.fullName, alias: "x" },
            }),
          ).to.eventually.be.rejected;
        });

        it(`throws when property class doesn't have the property`, async () => {
          const contentClass = imodelAccess.stubEntityClass(testClassProps);
          await expect(
            factory.createFilterClauses({
              filter: {
                propertyClassNames: [contentClass.fullName],
                relatedInstances: [],
                rules: { sourceAlias: "x", propertyName: "p", operator: "is-equal", propertyTypeName: "int", value: { rawValue: 123, displayValue: "123" } },
              },
              contentClass: { fullName: contentClass.fullName, alias: "x" },
            }),
          ).to.eventually.be.rejected;
        });

        it(`throws on struct property filters`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => false,
                isStruct: () => true,
              } as EC.StructProperty,
            ],
          });
          await expect(
            testPropertyFilter({
              skipClassStub: true,
              classAlias: "x",
              rule: {
                sourceAlias: "x",
                propertyName: "p",
                operator: "is-equal",
                propertyTypeName: "string",
                value: { rawValue: "test", displayValue: "test" },
              },
              expectedECSql: ``,
            }),
          ).to.eventually.be.rejected;
        });

        it(`throws on array property filters`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => false,
                isArray: () => true,
              } as EC.ArrayProperty,
            ],
          });
          await expect(
            testPropertyFilter({
              skipClassStub: true,
              classAlias: "x",
              rule: {
                sourceAlias: "x",
                propertyName: "p",
                operator: "is-equal",
                propertyTypeName: "string",
                value: { rawValue: "test", displayValue: "test" },
              },
              expectedECSql: ``,
            }),
          ).to.eventually.be.rejected;
        });

        it(`throws on binary rules without value`, async () => {
          imodelAccess.stubEntityClass({
            ...testClassProps,
            properties: [
              {
                name: "p",
                isNavigation: () => false,
                isEnumeration: () => false,
                isPrimitive: () => true,
                primitiveType: "Integer",
              } as EC.PrimitiveProperty,
            ],
          });
          await expect(
            testPropertyFilter({
              skipClassStub: true,
              classAlias: "x",
              rule: {
                sourceAlias: "x",
                propertyName: "p",
                operator: "is-equal",
                propertyTypeName: "int",
                value: undefined,
              },
              expectedECSql: ``,
            }),
          ).to.eventually.be.rejected;
        });
      });
    });

    describe("join", () => {
      it("creates joins for single-step related instance path", async () => {
        const sourceClass = imodelAccess.stubEntityClass({ schemaName: "x", className: "y", is: async () => true });
        imodelAccess.stubRelationshipClass({
          schemaName: "x",
          className: "r",
          direction: "Forward",
          source: {
            abstractConstraint: Promise.resolve(sourceClass),
            polymorphic: false,
          },
          target: {
            abstractConstraint: Promise.resolve(imodelAccess.stubEntityClass({ schemaName: "x", className: "t" })),
            polymorphic: false,
          },
        });
        const filter: GenericInstanceFilter = {
          propertyClassNames: ["x.y"],
          relatedInstances: [
            {
              path: [
                {
                  sourceClassName: "x.y",
                  relationshipClassName: "x.r",
                  targetClassName: "x.t",
                  isForwardRelationship: true,
                },
              ],
              alias: "a",
            },
          ],
          rules: {
            operator: "and",
            rules: [],
          },
        };
        const res = await factory.createFilterClauses({ filter, contentClass: { fullName: "x.y", alias: "content-class" } });
        expect(trimWhitespace(res.joins)).to.deep.eq(
          trimWhitespace(`
            INNER JOIN [x].[r] [rel_0_x_r_0] ON [rel_0_x_r_0].[SourceECInstanceId] = [content-class].[ECInstanceId]
            INNER JOIN [x].[t] [a] ON [a].[ECInstanceId] = [rel_0_x_r_0].[TargetECInstanceId]
          `),
        );
      });

      it("creates joins for multi-step related instance path", async () => {
        const sourceClass = imodelAccess.stubEntityClass({ schemaName: "x", className: "y", is: async () => true });
        const intermediateClass = imodelAccess.stubEntityClass({ schemaName: "x", className: "t1" });
        const targetClass = imodelAccess.stubEntityClass({ schemaName: "x", className: "t2" });
        imodelAccess.stubRelationshipClass({
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
        imodelAccess.stubRelationshipClass({
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
          propertyClassNames: ["x.y"],
          relatedInstances: [
            {
              path: [
                {
                  sourceClassName: "x.y",
                  relationshipClassName: "x.r1",
                  targetClassName: "x.t1",
                  isForwardRelationship: true,
                },
                {
                  sourceClassName: "x.t1",
                  relationshipClassName: "x.r2",
                  isForwardRelationship: false,
                  targetClassName: "x.t2",
                },
              ],
              alias: "a",
            },
          ],
          rules: {
            operator: "and",
            rules: [],
          },
        };
        const res = await factory.createFilterClauses({ filter, contentClass: { fullName: "x.y", alias: "content-class" } });
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
        const sourceClass = imodelAccess.stubEntityClass({ schemaName: "x", className: "y", is: async () => true });
        const targetClass1 = imodelAccess.stubEntityClass({ schemaName: "x", className: "t1" });
        const targetClass2 = imodelAccess.stubEntityClass({ schemaName: "x", className: "t2" });
        imodelAccess.stubRelationshipClass({
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
        imodelAccess.stubRelationshipClass({
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
          propertyClassNames: ["x.y"],
          relatedInstances: [
            {
              path: [
                {
                  sourceClassName: "x.y",
                  relationshipClassName: "x.r1",
                  targetClassName: "x.t1",
                  isForwardRelationship: true,
                },
              ],
              alias: "a",
            },
            {
              path: [
                {
                  sourceClassName: "x.y",
                  relationshipClassName: "x.r2",
                  isForwardRelationship: false,
                  targetClassName: "x.t2",
                },
              ],
              alias: "b",
            },
          ],
          rules: {
            operator: "and",
            rules: [],
          },
        };
        const res = await factory.createFilterClauses({ filter, contentClass: { fullName: "x.y", alias: "content-class" } });
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

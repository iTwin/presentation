/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { NodeSelectClauseColumnNames, NodeSelectClauseFactory } from "../../hierarchy-builder/queries/NodeSelectClauseFactory";
import { trimWhitespace } from "./Utils";

describe("NodeSelectClauseFactory", () => {
  let factory: NodeSelectClauseFactory;
  beforeEach(() => {
    factory = new NodeSelectClauseFactory();
  });

  it("creates valid clause with value props", async () => {
    const result = await factory.createSelectClause({
      ecClassId: "0x1",
      ecInstanceId: "0x2",
      nodeLabel: "label",
      autoExpand: false,
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
          fullClassName: "testSchema.testName",
          propertyGroups: [
            {
              propertyName: "property name",
              propertyValue: 1,
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
      mergeByLabelId: "merge id",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
        ec_ClassName(0x1) AS ${NodeSelectClauseColumnNames.FullClassName},
        0x2 AS ${NodeSelectClauseColumnNames.ECInstanceId},
        'label' AS ${NodeSelectClauseColumnNames.DisplayLabel},
        CAST(1 AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HasChildren},
        CAST(1 AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(1 AS BOOLEAN) AS ${NodeSelectClauseColumnNames.HideNodeInHierarchy},
        json_object(
          'byLabel', json_object('hideIfOneGroupedNode',  CAST(0 AS BOOLEAN), 'autoExpand', CAST('single-child' AS TEXT)),
          'byClass', CAST(1 AS BOOLEAN),
          'byBaseClasses', json_object('fullClassNames', json_array('testSchema.testName'), 'hideIfNoSiblings', CAST(0 AS BOOLEAN), 'hideIfOneGroupedNode', CAST(1 AS BOOLEAN), 'autoExpand', CAST('always' AS TEXT)),
          'byProperties', json_object('fullClassName', 'testSchema.testName', 'propertyGroups', json_array(json_object('propertyName', 'property name', 'propertyValue', 1, 'ranges', json_array(json_object('fromValue', 1, 'toValue', 2, 'rangeLabel', 'range label')))))
        ) AS ${NodeSelectClauseColumnNames.Grouping},
        CAST('merge id' AS TEXT) AS ${NodeSelectClauseColumnNames.MergeByLabelId},
        json_object(
          'id', 0x3,
          'str', 'test',
          'num', 1.23,
          'bool', 1
        ) AS ${NodeSelectClauseColumnNames.ExtendedData},
        CAST(0 AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand}
      `),
    );
  });

  it("creates valid clause with selector props", async () => {
    const result = await factory.createSelectClause({
      ecClassId: { selector: "x.ECClassId" },
      ecInstanceId: { selector: "x.ECInstanceId" },
      nodeLabel: { selector: "x.Label" },
      autoExpand: { selector: "x.AutoExpand" },
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
          fullClassName: { selector: "x.propertyGroupFullClassName" },
          propertyGroups: [
            {
              propertyName: { selector: "x.propertyName" },
              propertyValue: { selector: "x.propertyValue" },
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
      mergeByLabelId: { selector: "x.MergeId" },
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
          'byLabel', CAST(x.byLabel AS BOOLEAN),
          'byClass', json_object('hideIfNoSiblings', CAST(x.classGroupHideIfNoSiblings AS BOOLEAN), 'autoExpand', CAST(x.classGroupAutoExpand AS TEXT)),
          'byBaseClasses', json_object('fullClassNames', json_array(x.baseClassFullGroupClassName), 'hideIfNoSiblings', CAST(x.baseClassGroupHideIfNoSiblings AS BOOLEAN), 'hideIfOneGroupedNode', CAST(x.baseClassGroupHideIfOneGroupedNode AS BOOLEAN), 'autoExpand', CAST(x.baseClassGroupAutoExpand AS TEXT)),
          'byProperties', json_object('fullClassName', x.propertyGroupFullClassName, 'propertyGroups', json_array(json_object('propertyName', x.propertyName, 'propertyValue', x.propertyValue, 'ranges', json_array(json_object('fromValue', x.propertyFromValue, 'toValue', x.propertyToValue)))))
        ) AS ${NodeSelectClauseColumnNames.Grouping},
        CAST(x.MergeId AS TEXT) AS ${NodeSelectClauseColumnNames.MergeByLabelId},
        json_object(
          'sel', x.ExtendedData
        ) AS ${NodeSelectClauseColumnNames.ExtendedData},
        CAST(x.AutoExpand AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand}
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
        CAST(NULL AS TEXT) AS ${NodeSelectClauseColumnNames.MergeByLabelId},
        CAST(NULL AS TEXT) AS ${NodeSelectClauseColumnNames.ExtendedData},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand}
      `),
    );
  });

  it("creates valid clause with when some of the groupings are set", async () => {
    const result = await factory.createSelectClause({
      ecClassId: "0x1",
      ecInstanceId: "0x2",
      nodeLabel: "label",
      grouping: {
        byBaseClasses: {
          fullClassNames: ["testSchema.testName"],
        },
        byProperties: {
          fullClassName: "testSchema.testName",
          propertyGroups: [
            {
              propertyName: "property name",
              propertyValue: true,
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
          'byBaseClasses', json_object('fullClassNames', json_array('testSchema.testName')),
          'byProperties', json_object('fullClassName', 'testSchema.testName', 'propertyGroups', json_array(json_object('propertyName', 'property name', 'propertyValue', CAST(1 AS BOOLEAN))))
        ) AS ${NodeSelectClauseColumnNames.Grouping},
        CAST(NULL AS TEXT) AS ${NodeSelectClauseColumnNames.MergeByLabelId},
        CAST(NULL AS TEXT) AS ${NodeSelectClauseColumnNames.ExtendedData},
        CAST(NULL AS BOOLEAN) AS ${NodeSelectClauseColumnNames.AutoExpand}
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

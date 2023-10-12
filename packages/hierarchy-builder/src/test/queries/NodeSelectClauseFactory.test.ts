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
        groupByClass: true,
        groupByLabel: true,
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
          'groupByClass', true,
          'groupByLabel', true
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
        groupByClass: { selector: "x.GroupByClass" },
        groupByLabel: { selector: "x.GroupByLabel" },
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
          'groupByClass', x.GroupByClass,
          'groupByLabel', x.GroupByLabel
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
        NULL AS ${NodeSelectClauseColumnNames.Grouping},
        CAST(NULL AS TEXT) AS ${NodeSelectClauseColumnNames.MergeByLabelId},
        NULL AS ${NodeSelectClauseColumnNames.ExtendedData},
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

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createECInstanceNodeSelectClause, ECInstanceNodeSelectClauseColumnNames } from "../hierarchy-builder/ECSqlSelectClauseHelpers";

describe("createECInstanceNodeSelectClause", () => {
  it("creates valid clause with value props", () => {
    const result = createECInstanceNodeSelectClause({
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
      groupByClass: true,
      hasChildren: true,
      hideIfNoChildren: true,
      hideNodeInHierarchy: true,
      mergeByLabelId: "merge id",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
        ec_ClassName(0x1) AS ${ECInstanceNodeSelectClauseColumnNames.FullClassName},
        0x2 AS ${ECInstanceNodeSelectClauseColumnNames.ECInstanceId},
        'label' AS ${ECInstanceNodeSelectClauseColumnNames.DisplayLabel},
        CAST(1 AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HasChildren},
        CAST(1 AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(1 AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HideNodeInHierarchy},
        CAST(1 AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.GroupByClass},
        CAST('merge id' AS TEXT) AS ${ECInstanceNodeSelectClauseColumnNames.MergeByLabelId},
        json_object(
          'id', 0x3,
          'str', 'test',
          'num', 1.23,
          'bool', 1
        ) AS ${ECInstanceNodeSelectClauseColumnNames.ExtendedData},
        CAST(0 AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.AutoExpand}
      `),
    );
  });

  it("creates valid clause with selector props", () => {
    const result = createECInstanceNodeSelectClause({
      ecClassId: { selector: "x.ECClassId" },
      ecInstanceId: { selector: "x.ECInstanceId" },
      nodeLabel: { selector: "x.Label" },
      autoExpand: { selector: "x.AutoExpand" },
      extendedData: {
        sel: { selector: "x.ExtendedData" },
      },
      groupByClass: { selector: "x.GroupByClass" },
      hasChildren: { selector: "x.HasChildren" },
      hideIfNoChildren: { selector: "x.HideIfNoChildren" },
      hideNodeInHierarchy: { selector: "x.HideNodeInHierarchy" },
      mergeByLabelId: { selector: "x.MergeId" },
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
        ec_ClassName(x.ECClassId) AS ${ECInstanceNodeSelectClauseColumnNames.FullClassName},
        x.ECInstanceId AS ${ECInstanceNodeSelectClauseColumnNames.ECInstanceId},
        x.Label AS ${ECInstanceNodeSelectClauseColumnNames.DisplayLabel},
        CAST(x.HasChildren AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HasChildren},
        CAST(x.HideIfNoChildren AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(x.HideNodeInHierarchy AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HideNodeInHierarchy},
        CAST(x.GroupByClass AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.GroupByClass},
        CAST(x.MergeId AS TEXT) AS ${ECInstanceNodeSelectClauseColumnNames.MergeByLabelId},
        json_object(
          'sel', x.ExtendedData
        ) AS ${ECInstanceNodeSelectClauseColumnNames.ExtendedData},
        CAST(x.AutoExpand AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.AutoExpand}
      `),
    );
  });

  it("creates valid clause with null props", () => {
    const result = createECInstanceNodeSelectClause({
      ecClassId: "0x1",
      ecInstanceId: "0x2",
      nodeLabel: "label",
    });
    expect(trimWhitespace(result)).to.eq(
      trimWhitespace(`
        ec_ClassName(0x1) AS ${ECInstanceNodeSelectClauseColumnNames.FullClassName},
        0x2 AS ${ECInstanceNodeSelectClauseColumnNames.ECInstanceId},
        'label' AS ${ECInstanceNodeSelectClauseColumnNames.DisplayLabel},
        CAST(NULL AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HasChildren},
        CAST(NULL AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HideIfNoChildren},
        CAST(NULL AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.HideNodeInHierarchy},
        CAST(NULL AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.GroupByClass},
        CAST(NULL AS TEXT) AS ${ECInstanceNodeSelectClauseColumnNames.MergeByLabelId},
        NULL AS ${ECInstanceNodeSelectClauseColumnNames.ExtendedData},
        CAST(NULL AS BOOLEAN) AS ${ECInstanceNodeSelectClauseColumnNames.AutoExpand}
      `),
    );
  });

  it("returns columns in valid order", () => {
    const expectedOrder = Object.keys(ECInstanceNodeSelectClauseColumnNames);
    const clause = createECInstanceNodeSelectClause({
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

function trimWhitespace(str: string): string {
  return str.replaceAll(/\s+/gm, " ").replaceAll(/\(\s+/g, "(").replaceAll(/\s+\)/g, ")");
}

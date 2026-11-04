/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { NodesLimitExceededError, RowsLimitExceededError } from "../hierarchies/HierarchyErrors.js";
import { createTestGenericNode } from "./Utils.js";

describe("RowsLimitExceededError", () => {
  it("creates error from props", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const error = new RowsLimitExceededError({ limit: 2, rows });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Query rows limit of 2 exceeded");
    expect(error.limit).toBe(2);
    expect(error.rows).toBe(rows);
  });

  it("creates error from limit with empty rows list", () => {
    // oxlint-disable-next-line typescript/no-deprecated
    const error = new RowsLimitExceededError(3);
    expect(error.message).toBe("Query rows limit of 3 exceeded");
    expect(error.limit).toBe(3);
    expect(error.rows).toEqual([]);
  });
});

describe("NodesLimitExceededError", () => {
  it("creates error from props", () => {
    const rows = [{ id: 1 }];
    const nodes = [createTestGenericNode()];
    const error = new NodesLimitExceededError({ limit: 1, rows, nodes });
    expect(error).toBeInstanceOf(RowsLimitExceededError);
    expect(error.message).toBe("Query rows limit of 1 exceeded");
    expect(error.limit).toBe(1);
    expect(error.rows).toBe(rows);
    expect(error.nodes).toBe(nodes);
  });
});

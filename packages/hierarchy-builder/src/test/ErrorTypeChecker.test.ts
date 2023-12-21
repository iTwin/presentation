/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ErrorTypeChecker } from "../hierarchy-builder/ErrorTypeChecker";
import { RowsLimitExceededError } from "../hierarchy-builder/internal/TreeNodesReader";

describe("ErrorTypeChecker", () => {
  const normalError = new Error("test");
  const rowsLimitError = new RowsLimitExceededError(1);
  describe("isRowsLimitExceededError", () => {
    it("returns correct result for different types of nodes", () => {
      expect(ErrorTypeChecker.isRowsLimitExceededError(normalError)).to.be.false;
      expect(ErrorTypeChecker.isRowsLimitExceededError(rowsLimitError)).to.be.true;
    });
  });
});

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { getByText, waitFor } from "@testing-library/react";

export async function ensureTableHasRowsWithCellValues(container: HTMLElement, propertyLabel: string, cellValues: string[]) {
  const table = await waitFor(() => {
    const sel = container.querySelector("table");
    expect(sel).is.not.null;
    return sel;
  });

  const columns = table!.querySelectorAll("thead td");
  let columnIndex = -1;
  columns.forEach((column, key) => {
    if (column.innerHTML === propertyLabel) {
      columnIndex = key;
    }
  });
  expect(columnIndex).to.not.eq(-1);

  const rows = table!.querySelectorAll("tbody tr");
  expect(rows).to.be.lengthOf(cellValues.length);

  rows.forEach((row, key) => {
    const cell = row.children[columnIndex] as HTMLElement;
    getByText(cell, cellValues[key]);
  });
}

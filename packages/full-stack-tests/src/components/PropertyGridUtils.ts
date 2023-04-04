/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { fireEvent, getByText, waitFor } from "@testing-library/react";

export async function ensurePropertyGridHasPropertyRecord(container: HTMLElement, propertyLabel: string, propertyValue: string) {
  // find & expand the root category
  const category = await waitFor(() => getRootPropertyCategory(container));
  if (!category.querySelector(".iui-expanded"))
    fireEvent.click(category.querySelector(".iui-expandable-block .iui-header")!);
  await waitFor(() => expect(category.querySelector(".iui-expanded")).to.not.be.null);

  // find the property record
  await waitFor(() => {
    getByText(container, propertyLabel);
    getByText(container, propertyValue);
  });
}

function getRootPropertyCategory(htmlContainer: HTMLElement) {
  const categoryElement = htmlContainer.querySelector(`.virtualized-grid-node-category`);
  if (!categoryElement)
    throw new Error(`Failed to find root category`);
  return categoryElement;
}

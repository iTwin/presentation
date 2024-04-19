/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { fireEvent, getByText, queryByRole, waitFor } from "@testing-library/react";

export async function ensurePropertyGridHasPropertyRecord(container: HTMLElement, categoryLabel: string, propertyLabel: string, propertyValue: string) {
  await waitFor(() => getByText(container, categoryLabel));
  const collapsedCategory = queryByRole(container, "button", { expanded: false, name: categoryLabel });
  if (collapsedCategory) {
    fireEvent.click(collapsedCategory);
  }

  // find the property record
  await waitFor(() => {
    getByText(container, propertyLabel);
    getByText(container, propertyValue);
  });
}

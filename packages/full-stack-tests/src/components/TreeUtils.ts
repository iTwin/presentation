/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { fireEvent } from "@testing-library/react";

/** Find a node in `ControlledTree` by label. Throws if the node is not found.  */
export function getNodeByLabel(htmlContainer: HTMLElement, label: string) {
  let curr = htmlContainer.querySelector<HTMLElement>(`[title*="${label}"]`);
  while (curr && !curr.classList.contains("core-tree-node")) curr = curr.parentElement;
  if (!curr || !curr.classList.contains("core-tree-node")) throw new Error(`Failed to find node with label "${label}"`);
  return curr;
}

/** Is the node represented by given HTML element currently selected in the tree. */
export function isNodeSelectedInTree(htmlElement: Element) {
  return htmlElement.classList.contains("is-selected");
}

/** Simulates a click on the node's chevron. */
export function toggleExpandNode(htmlElement: Element) {
  fireEvent.click(htmlElement.querySelector(".core-tree-expansionToggle")!);
}

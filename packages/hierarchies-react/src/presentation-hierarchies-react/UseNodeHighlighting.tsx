/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback } from "react";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
import type { TreeNode } from "./TreeNode.js";

/**
 * Props for `useNodeHighlighting` hook.
 * @alpha
 */
interface UseNodeHighlightingProps {
  /** Text that should be highlighted */
  highlightText?: string;
}

/**
 * Result of `useNodeHighlighting` hook.
 * @alpha
 */
interface UseNodeHighlightingResult {
  /** Function that creates highlighted node labels. */
  getLabel: (node: TreeNode) => React.ReactElement;
}

/**
 * A react hook that helps create highlighted node labels based on provided highlight.
 * @alpha
 */
export function useNodeHighlighting({ highlightText }: UseNodeHighlightingProps): UseNodeHighlightingResult {
  const getLabel = useCallback(
    (node: TreeNode) => {
      if (!highlightText || HierarchyNode.isGroupingNode(node.nodeData) || !node.nodeData.search?.isSearchTarget) {
        return <span>{node.label}</span>;
      }

      const matchedIndexes = new Array<number>();
      const nodeLabel = node.label.toLocaleLowerCase();
      const searchText = highlightText.toLocaleLowerCase();
      let fromPosition = 0;
      // Find all occurrences of the search text in the node label
      while (true) {
        const foundIndex = nodeLabel.indexOf(searchText, fromPosition);
        if (foundIndex === -1) {
          break;
        }
        matchedIndexes.push(foundIndex);
        fromPosition = foundIndex + searchText.length;
      }

      if (matchedIndexes.length === 0) {
        return <span>{node.label}</span>;
      }

      // Create the final label with highlighted parts
      const finalLabel = new Array<React.JSX.Element>();
      let lastAddedPosition = 0;
      for (let i = 0; i < matchedIndexes.length; ++i) {
        const matchedIndex = matchedIndexes[i];
        if (matchedIndex > lastAddedPosition) {
          finalLabel.push(<span key={`normal-${i}`}>{node.label.substring(lastAddedPosition, matchedIndex)}</span>);
          lastAddedPosition = matchedIndex;
        }
        const endingPlace = matchedIndex + highlightText.length;
        finalLabel.push(<mark key={`marked-${i}`}>{node.label.substring(lastAddedPosition, endingPlace)}</mark>);
        lastAddedPosition = endingPlace;
      }
      if (lastAddedPosition < node.label.length) {
        finalLabel.push(<span key={`normal-${matchedIndexes.length + 1}`}>{node.label.substring(lastAddedPosition)}</span>);
      }

      return <>{finalLabel}</>;
    },
    [highlightText],
  );

  return { getLabel };
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback } from "react";
import { PresentationHierarchyNode } from "./TreeNode.js";

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
  getLabel: (node: PresentationHierarchyNode) => React.ReactElement;
}

/**
 * A react hook that helps create highlighted node labels based on provided highlight.
 * @alpha
 */
export function useNodeHighlighting({ highlightText }: UseNodeHighlightingProps): UseNodeHighlightingResult {
  const getLabel = useCallback(
    (node: PresentationHierarchyNode) => {
      // We don't want to highligh if tree is reloading
      if (!highlightText) {
        return <span>{node.label}</span>;
      }
      const matchedIndexes = [...node.label.matchAll(new RegExp(highlightText, "gi"))].map((a) => a.index);
      if (matchedIndexes.length === 0) {
        return <span>{node.label}</span>;
      }
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

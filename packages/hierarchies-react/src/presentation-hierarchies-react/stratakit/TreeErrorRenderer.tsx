/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { cloneElement } from "react";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";
import { ErrorItemRenderer } from "./ErrorItemRenderer.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import type { ReactElement } from "react";
import type { ErrorItemRendererProps } from "./ErrorItemRenderer.js";
import type { useErrorNodes } from "./FlatTreeNode.js";

/**
 * Interface containing building blocks for `TreeErrorRenderer`.
 *
 * @alpha
 */
interface TreeErrorRendererOwnProps {
  /**
   * A user friendly display label of the tree. Should be unique within the consuming application,
   * as it's used for creating a unique accessible label for the error region.
   */
  treeLabel: string;
  /** List of error nodes to render errors for. */
  errorNodes: ReturnType<typeof useErrorNodes>;
  /** Callback to render custom error messages. Component should be wrapped in `ErrorRegion.Item` from `@itwin/itwinui-react` package. */
  renderError?: (props: ErrorItemRendererProps) => ReactElement;
}

/** @alpha */
export type TreeErrorRendererProps = TreeErrorRendererOwnProps & Omit<ErrorItemRendererProps, "errorNode">;

/**
 * A component that renders error display dropdown using the `unstable_ErrorRegion` component from `@itwin/itwinui-react`.
 * As input, the component uses a list of `ErrorNode` objects, which are generally created using the `useErrorList` hook.
 *
 * @alpha
 */
export function TreeErrorRenderer({ treeLabel, errorNodes, renderError, ...errorItemRendererProps }: TreeErrorRendererProps) {
  const { localizedStrings } = useLocalizationContext();
  const errorItems = errorNodes.map((errorNode) => {
    const errorRendererProps: ErrorItemRendererProps = {
      errorNode,
      ...errorItemRendererProps,
    };

    if (renderError) {
      return cloneElement(renderError(errorRendererProps), { key: errorNode.id });
    }

    return <ErrorItemRenderer key={errorNode.id} {...errorRendererProps} />;
  });

  return (
    <ErrorRegion.Root
      style={{ width: "100%" }}
      aria-label={localizedStrings.issuesForTree.replace("{{tree_label}}", treeLabel)}
      label={
        errorNodes.length === 0 ? localizedStrings.noIssuesFound : localizedStrings.issuesFound.replace("{{number_of_issues}}", errorNodes.length.toString())
      }
      items={errorItems}
    />
  );
}

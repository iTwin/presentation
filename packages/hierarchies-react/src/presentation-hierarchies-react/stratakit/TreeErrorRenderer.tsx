/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { cloneElement } from "react";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";
import { useTranslation } from "../LocalizationContext.js";
import { ErrorItemRenderer } from "./ErrorItemRenderer.js";

import type { JSX, ReactElement } from "react";
import type { useErrorNodes } from "../FlatTreeNode.js";
import type { ErrorItemRendererProps } from "./ErrorItemRenderer.js";

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
  /** Callback to render custom error messages. Component should be wrapped in `unstable_ErrorRegion.Item` from `@stratakit/structures` package. */
  renderError?: (props: ErrorItemRendererProps) => ReactElement;
}

/** @alpha */
export type TreeErrorRendererProps = TreeErrorRendererOwnProps & Omit<ErrorItemRendererProps, "errorNode">;

/**
 * A component that renders error display dropdown using the `unstable_ErrorRegion` component from `@stratakit/structures`.
 * As input, the component uses a list of `ErrorNode` objects, which are generally created using the `useErrorNodes` hook.
 *
 * @alpha
 */
export function TreeErrorRenderer({
  treeLabel,
  errorNodes,
  renderError,
  ...errorItemRendererProps
}: TreeErrorRendererProps): JSX.Element {
  const translate = useTranslation();
  const errorItems = errorNodes.map((errorNode) => {
    const errorRendererProps: ErrorItemRendererProps = { errorNode, ...errorItemRendererProps };

    if (renderError) {
      return cloneElement(renderError(errorRendererProps), { key: errorNode.id });
    }

    return <ErrorItemRenderer key={errorNode.id} {...errorRendererProps} />;
  });

  return (
    <ErrorRegion.Root
      style={{ width: "100%" }}
      aria-label={translate("issuesForTree").replace("{{tree_label}}", treeLabel)}
      label={
        errorNodes.length === 0
          ? translate("noIssuesFound")
          : translate("issuesFound").replace("{{number_of_issues}}", errorNodes.length.toString())
      }
      items={errorItems}
    />
  );
}

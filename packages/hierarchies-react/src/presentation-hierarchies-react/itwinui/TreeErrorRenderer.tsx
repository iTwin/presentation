/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, forwardRef, RefAttributes } from "react";
import { Anchor, Text, Tree } from "@itwin/itwinui-react/bricks";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils.js";
import { PresentationInfoNode } from "../TreeNode.js";
import { useTree } from "../UseTree.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import { TreeNodeRendererOwnProps } from "./TreeNodeRenderer.js";

interface TreeErrorRendererOwnProps {
  node: PresentationInfoNode;
}

type TreeErrorRendererProps = TreeErrorRendererOwnProps &
  Pick<TreeNodeRendererOwnProps, "onFilterClick" | "reloadTree"> &
  Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">>;

/** @alpha */
export const TreeErrorRenderer: React.ForwardRefExoticComponent<TreeErrorRendererProps & RefAttributes<HTMLDivElement>> = forwardRef(
  ({ node, getHierarchyLevelDetails, onFilterClick, reloadTree }, forwardedRef) => {
    const { localizedStrings } = useLocalizationContext();
    if (node.type === "ResultSetTooLarge") {
      return (
        <ResultSetTooLargeNode
          ref={forwardedRef}
          limit={node.resultSetSizeLimit}
          onOverrideLimit={getHierarchyLevelDetails ? (limit) => getHierarchyLevelDetails(node.parentNodeId)?.setSizeLimit(limit) : undefined}
          onFilterClick={
            onFilterClick
              ? () => {
                  const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.parentNodeId);
                  hierarchyLevelDetails && onFilterClick(hierarchyLevelDetails);
                }
              : undefined
          }
        />
      );
    }

    if (node.type === "NoFilterMatches") {
      return <Tree.Item ref={forwardedRef} label={localizedStrings.noFilteredChildren} aria-disabled={true} />;
    }

    const onRetry = reloadTree ? () => reloadTree({ parentNodeId: node.parentNodeId, state: "reset" }) : undefined;
    return <Tree.Item ref={forwardedRef} label={<ErrorNodeLabel message={node.message} onRetry={onRetry} />} aria-disabled={true} />;
  },
);
TreeErrorRenderer.displayName = "TreeErrorRenderer";

const ResultSetTooLargeNode = forwardRef<
  HTMLDivElement,
  Omit<ComponentPropsWithoutRef<typeof Tree.Item>, "onExpanded" | "label"> & ResultSetTooLargeNodeLabelProps
>(({ onFilterClick, onOverrideLimit, limit, ...props }, forwardedRef) => {
  return (
    <Tree.Item
      {...props}
      ref={forwardedRef}
      className="stateless-tree-node"
      label={<ResultSetTooLargeNodeLabel limit={limit} onFilterClick={onFilterClick} onOverrideLimit={onOverrideLimit} />}
    />
  );
});
ResultSetTooLargeNode.displayName = "ResultSetTooLargeNode";

interface ResultSetTooLargeNodeLabelProps {
  limit: number;
  onFilterClick?: () => void;
  onOverrideLimit?: (limit: number) => void;
}

function ResultSetTooLargeNodeLabel({ onFilterClick, onOverrideLimit, limit }: ResultSetTooLargeNodeLabelProps) {
  const { localizedStrings } = useLocalizationContext();
  const supportsFiltering = !!onFilterClick;
  const supportsLimitOverride = !!onOverrideLimit && limit < MAX_LIMIT_OVERRIDE;

  const limitExceededMessage = createLocalizedMessage(
    supportsFiltering ? localizedStrings.resultLimitExceededWithFiltering : localizedStrings.resultLimitExceeded,
    limit,
    onFilterClick,
  );
  const increaseLimitMessage = supportsLimitOverride
    ? createLocalizedMessage(
        supportsFiltering ? localizedStrings.increaseHierarchyLimitWithFiltering : localizedStrings.increaseHierarchyLimit,
        MAX_LIMIT_OVERRIDE,
        () => onOverrideLimit(MAX_LIMIT_OVERRIDE),
      )
    : { title: "", element: null };

  const title = `${limitExceededMessage.title} ${increaseLimitMessage.title}`;

  return (
    <div style={{ display: "flex", alignItems: "start" }} title={title}>
      {limitExceededMessage.element}
      {increaseLimitMessage.element}
    </div>
  );
}

function ErrorNodeLabel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { localizedStrings } = useLocalizationContext();
  return (
    <div style={{ display: "flex" }}>
      <Text>{message}</Text>
      {onRetry ? <Anchor onClick={onRetry}>{localizedStrings?.retry}</Anchor> : null}
    </div>
  );
}

function createLocalizedMessage(message: string, limit: number, onClick?: () => void) {
  const limitStr = limit.toLocaleString(undefined, { useGrouping: true });
  const messageWithLimit = message.replace("{{limit}}", limitStr);
  const exp = new RegExp("<link>(.*)</link>");
  const match = messageWithLimit.match(exp);

  if (!match) {
    return {
      title: messageWithLimit,
      element: (
        <div style={{ display: "flex" }}>
          <Text>{messageWithLimit}</Text>
        </div>
      ),
    };
  }

  const [fullText, innerText] = match;
  const [textBefore, textAfter] = messageWithLimit.split(fullText);

  return {
    title: messageWithLimit.replace(fullText, innerText),
    element: (
      <div style={{ display: "flex" }}>
        {textBefore ? <Text>{textBefore}</Text> : null}
        <Anchor
          // underline props does not exist in v5
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
        >
          {innerText}
        </Anchor>
        {textAfter ? <Text>{textAfter}</Text> : null}
      </div>
    ),
  };
}

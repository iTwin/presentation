/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, forwardRef, RefAttributes } from "react";
import { Anchor, Text, Tree } from "@itwin/itwinui-react-v5/bricks";
import { PresentationInfoNode, useTree } from "@itwin/presentation-hierarchies-react";
import { useLocalizationContext } from "./LocalizationContext";
import { TreeNodeRendererOwnProps } from "./TreeNodeRendererV5";

interface TreeErrorRendererOwnProps {
  node: PresentationInfoNode;
}

type TreeErrorRendererProps = TreeErrorRendererOwnProps &
  Pick<TreeNodeRendererOwnProps, "onFilterClick" | "reloadTree"> &
  Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">>;

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

const MAX_LIMIT_OVERRIDE = 10000; // TODO: remove when moved to hierarchies-react

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
    // <Flex flexDirection="column" gap="3xs" title={title} alignItems="start">
    <div style={{ display: "flex" }} title={title}>
      {limitExceededMessage.element}
      {increaseLimitMessage.element}
    </div>
    // </Flex>
  );
}

function ErrorNodeLabel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { localizedStrings } = useLocalizationContext();
  return (
    // <Flex flexDirection="row" gap="xs" title={message} alignItems="start"> // flex is not released yet
    <div style={{ display: "flex" }}>
      <Text>{message}</Text>
      {onRetry ? <Anchor onClick={onRetry}>{localizedStrings?.retry}</Anchor> : null}
    </div>
    // </Flex>
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
          {/* <Flex flexDirection="row" gap="3xs"> */}
          <Text>{messageWithLimit}</Text>
          {/* </Flex> */}
        </div>
      ),
    };
  }

  const [fullText, innerText] = match;
  const [textBefore, textAfter] = messageWithLimit.split(fullText);

  return {
    title: messageWithLimit.replace(fullText, innerText),
    element: (
      // <Flex flexDirection="row" gap="3xs">
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
      // </Flex>
    ),
  };
}

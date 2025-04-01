/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { CSSProperties } from "react";
import { Anchor } from "@itwin/itwinui-react/bricks";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { ErrorType } from "./FlatTreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";

export interface TreeErrorItemProps {
  /** A callback to reload a hierarchy level when an error occurs and `retry` button is clicked. */
  reloadTree?: (options: { parentNodeId: string | undefined; state: "reset" }) => void;
  /** Action to perform when the filter button is clicked for this node. */
  onFilterClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
}

interface TreeErrorRendererOwnProps {
  error: ErrorType;
  style?: CSSProperties;
}

type TreeErrorRendererProps = TreeErrorRendererOwnProps &
  TreeErrorItemProps &
  Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">> &
  Pick<LinkedNodeProps, "scrollToElement">;

export function TreeErrorRenderer({ error, scrollToElement, getHierarchyLevelDetails, onFilterClick }: TreeErrorRendererProps) {
  if (error.errorNode.type === "ResultSetTooLarge") {
    return (
      <ResultSetTooLarge
        onFilterClick={() => {
          const hierarchyLevelDetails = getHierarchyLevelDetails?.(error.parentNode?.id);
          hierarchyLevelDetails && onFilterClick?.(hierarchyLevelDetails);
        }}
        onOverrideLimit={getHierarchyLevelDetails ? (limit) => getHierarchyLevelDetails(error.parentNode?.id)?.setSizeLimit(limit) : undefined}
        scrollToElement={scrollToElement}
        limit={error.errorNode.resultSetSizeLimit}
        errorNode={error}
      />
    );
  }
  if (error.errorNode.type === "NoFilterMatches") {
    return <NoFilterMatches scrollToElement={scrollToElement} errorNode={error} />;
  }
  return <DefaultErrorContainer scrollToElement={scrollToElement} errorNode={error} />;
}

function NoFilterMatches({ onFilterClick, errorNode, scrollToElement }: LinkedNodeProps & Pick<TreeErrorItemProps, "onFilterClick">) {
  const { localizedStrings } = useLocalizationContext();

  return (
    <div style={{ gap: "8px", display: "flex", flexDirection: "column" }}>
      <MessageWithNode errorNode={errorNode} scrollToElement={scrollToElement} message={localizedStrings.noFilteredChildren} />
      <Anchor onClick={() => onFilterClick}>Change filter localization</Anchor>
    </div>
  );
}

function DefaultErrorContainer({ reloadTree, errorNode, scrollToElement }: LinkedNodeProps & Pick<TreeErrorItemProps, "reloadTree">) {
  const { localizedStrings } = useLocalizationContext();

  return (
    <div style={{ gap: "8px", display: "flex", flexDirection: "column" }}>
      <MessageWithNode errorNode={errorNode} scrollToElement={scrollToElement} message={localizedStrings.failedToCreateHierarchy} />
      <Anchor onClick={() => reloadTree}>{localizedStrings.retry}</Anchor>
    </div>
  );
}

type ResultSetTooLargeProps = {
  limit: number;
  onFilterClick?: () => void;
  onOverrideLimit?: (limit: number) => void;
} & LinkedNodeProps;

function ResultSetTooLarge({ errorNode, onFilterClick, limit, onOverrideLimit, scrollToElement }: ResultSetTooLargeProps) {
  const { localizedStrings } = useLocalizationContext();
  const supportsFiltering = !!onFilterClick;
  const supportsLimitOverride = !!onOverrideLimit && limit < MAX_LIMIT_OVERRIDE;
  const messageWithLimit = localizedStrings.resultLimitExceeded.replace("{{limit}}", limit.toString());

  return (
    <div style={{ gap: "8px", display: "flex", flexDirection: "column" }}>
      <MessageWithNode errorNode={errorNode} scrollToElement={scrollToElement} message={messageWithLimit} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {supportsLimitOverride && (
          <Anchor onClick={() => onOverrideLimit(MAX_LIMIT_OVERRIDE)}>
            {localizedStrings.increaseHierarchyLimit.replace("{{limit}}", MAX_LIMIT_OVERRIDE.toString())}
          </Anchor>
        )}
        {supportsFiltering && <Anchor onClick={onFilterClick}>{localizedStrings.increaseHierarchyLimitWithFiltering}</Anchor>}
      </div>
    </div>
  );
}

interface LinkedNodeProps {
  errorNode: ErrorType;
  scrollToElement: (node: ErrorType) => void;
}

function LinkedNode({ errorNode, scrollToElement }: LinkedNodeProps) {
  return <Anchor onClick={() => scrollToElement(errorNode)}>{errorNode.parentNode?.label}</Anchor>;
}

function MessageWithNode({ errorNode, scrollToElement, message }: LinkedNodeProps & { message: string }) {
  const splitMessage = message.split("{{node}}", 2);
  return (
    <div>
      {splitMessage[0]}
      <LinkedNode errorNode={errorNode} scrollToElement={scrollToElement} />
      {splitMessage[1]}
    </div>
  );
}

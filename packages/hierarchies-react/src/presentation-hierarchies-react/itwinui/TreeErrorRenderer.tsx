/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Anchor, unstable_ErrorRegion as ErrorRegion, Text } from "@itwin/itwinui-react/bricks";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { ErrorNode } from "./FlatTreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";

/** @alpha */
export interface TreeErrorItemProps {
  /** A callback to reload a hierarchy level when an error occurs and `retry` button is clicked. */
  reloadTree?: (options: { parentNodeId: string | undefined; state: "reset" }) => void;
  /** Action to perform when the filter button is clicked for this node. */
  onFilterClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
}

interface TreeErrorRendererOwnProps {
  errorList: ErrorNode[];
}

type TreeErrorRendererProps = TreeErrorRendererOwnProps &
  TreeErrorItemProps &
  Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">> &
  Pick<LinkedNodeProps, "scrollToElement">;

export function TreeErrorRenderer({ errorList, scrollToElement, getHierarchyLevelDetails, onFilterClick }: TreeErrorRendererProps) {
  const { localizedStrings } = useLocalizationContext();
  const errorItems = errorList.map((errorNode) => {
    if (errorNode.error.type === "ResultSetTooLarge") {
      return (
        <ResultSetTooLarge
          key={errorNode.error.id}
          onFilterClick={() => {
            const hierarchyLevelDetails = getHierarchyLevelDetails?.(errorNode.parent?.id);
            hierarchyLevelDetails && onFilterClick?.(hierarchyLevelDetails);
          }}
          onOverrideLimit={getHierarchyLevelDetails ? (limit) => getHierarchyLevelDetails(errorNode.parent?.id)?.setSizeLimit(limit) : undefined}
          scrollToElement={scrollToElement}
          limit={errorNode.error.resultSetSizeLimit}
          errorNode={errorNode}
        />
      );
    }
    if (errorNode.error.type === "NoFilterMatches") {
      return <NoFilterMatches key={errorNode.error.id} scrollToElement={scrollToElement} errorNode={errorNode} />;
    }
    return <DefaultErrorContainer key={errorNode.error.id} scrollToElement={scrollToElement} errorNode={errorNode} />;
  });

  return (
    <ErrorRegion.Root
      style={{ width: "100%" }}
      label={errorList.length !== 0 ? `${errorList.length} ${localizedStrings?.issuesFound}` : undefined}
      items={errorItems}
    />
  );
}

function NoFilterMatches({ onFilterClick, errorNode, scrollToElement }: LinkedNodeProps & Pick<TreeErrorItemProps, "onFilterClick">) {
  const { localizedStrings } = useLocalizationContext();

  return (
    <ErrorRegion.Item
      message={<MessageWithNode errorNode={errorNode} scrollToElement={scrollToElement} message={localizedStrings.noFilteredChildren} />}
      actions={<Anchor onClick={() => onFilterClick}>{localizedStrings.noFilteredChildrenChangeFilter}</Anchor>}
    />
  );
}

function DefaultErrorContainer({ reloadTree, errorNode, scrollToElement }: LinkedNodeProps & Pick<TreeErrorItemProps, "reloadTree">) {
  const { localizedStrings } = useLocalizationContext();

  return (
    <ErrorRegion.Item
      message={<MessageWithNode errorNode={errorNode} scrollToElement={scrollToElement} message={localizedStrings.failedToCreateHierarchy} />}
      actions={<Anchor onClick={() => reloadTree}>{localizedStrings.retry}</Anchor>}
    />
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
    <ErrorRegion.Item
      message={<MessageWithNode errorNode={errorNode} scrollToElement={scrollToElement} message={messageWithLimit} />}
      actions={
        <div style={{ display: "flex", flexDirection: "column" }}>
          {supportsLimitOverride && (
            <Anchor onClick={() => onOverrideLimit(MAX_LIMIT_OVERRIDE)}>
              {localizedStrings.increaseHierarchyLimit.replace("{{limit}}", MAX_LIMIT_OVERRIDE.toString())}
            </Anchor>
          )}
          {supportsFiltering && <Anchor onClick={onFilterClick}>{localizedStrings.increaseHierarchyLimitWithFiltering}</Anchor>}
        </div>
      }
    />
  );
}

interface LinkedNodeProps {
  errorNode: ErrorNode;
  scrollToElement: (node: ErrorNode) => void;
}

function LinkedNode({ errorNode, scrollToElement }: LinkedNodeProps) {
  return <Anchor onClick={() => scrollToElement(errorNode)}>{errorNode.parent?.label}</Anchor>;
}

function MessageWithNode({ errorNode, scrollToElement, message }: LinkedNodeProps & { message: string }) {
  const splitMessage = message.split("{{node}}", 2);
  return (
    <div>
      <Text variant={"body-sm"}>{splitMessage[0]}</Text>
      <LinkedNode errorNode={errorNode} scrollToElement={scrollToElement} />
      <Text variant={"body-sm"}>{splitMessage[1]}</Text>
    </div>
  );
}

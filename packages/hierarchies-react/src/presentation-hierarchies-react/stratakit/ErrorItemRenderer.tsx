/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Anchor, Text } from "@stratakit/bricks";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils.js";
import { HierarchyLevelDetails, TreeRendererProps } from "../Renderers.js";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { ErrorItem } from "./FlatTreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";

/** @alpha */
export interface ErrorItemRendererProps extends Pick<TreeRendererProps, "getHierarchyLevelDetails"> {
  errorItem: ErrorItem;
  /** A callback to reload a hierarchy level when an error occurs and `retry` button is clicked. */
  reloadTree: (options: { parentNodeId: string | undefined; state: "reset" }) => void;
  /** Action to perform when an error occurs and node label is clicked in the error message */
  scrollToElement: (errorNode: ErrorItem) => void;
  /** Action to perform when the filter button is clicked for this node. */
  onFilterClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
}

/**
 * Renders StrataKit `<ErrorRegion.Item />` for all supported error types:
 * - `ResultSetTooLarge` - renders `LocalizedStrings.resultLimitExceeded` message with actions to increase limit or apply filtering
 * - `NoFilterMatches` - renders `LocalizedStrings.noFilteredChildren` message with action to change filter
 * - `ChildrenLoad` - renders `LocalizedStrings.failedToCreateHierarchy` message with action to retry loading
 * - `Unknown` - renders message set on error object.
 *
 * @alpha
 */
export function ErrorItemRenderer({ errorItem, getHierarchyLevelDetails, onFilterClick, reloadTree, scrollToElement }: ErrorItemRendererProps) {
  const { localizedStrings } = useLocalizationContext();

  const { errorNode, expandTo } = errorItem;
  if (errorNode.error.type === "ResultSetTooLarge") {
    const limit = errorNode.error.resultSetSizeLimit;
    const onOverrideLimit = getHierarchyLevelDetails ? () => getHierarchyLevelDetails(errorNode.id)?.setSizeLimit(MAX_LIMIT_OVERRIDE) : undefined;
    return (
      <ErrorItemContainer
        errorNode={errorNode}
        actions={[
          {
            action: () => {
              onOverrideLimit?.();
            },
            label: localizedStrings.increaseHierarchyLimit.replace("{{limit}}", MAX_LIMIT_OVERRIDE.toString()),
            condition: () => !!onOverrideLimit && limit < MAX_LIMIT_OVERRIDE,
          },
          {
            action: () => {
              const hierarchyLevelDetails = getHierarchyLevelDetails?.(errorNode.id);
              hierarchyLevelDetails && onFilterClick?.(hierarchyLevelDetails);
            },
            label: localizedStrings.increaseHierarchyLimitWithFiltering,
            condition: () => !!onFilterClick && !!errorNode?.isFilterable,
          },
        ]}
        message={localizedStrings.resultLimitExceeded.replace("{{limit}}", limit.toString())}
        scrollToElement={() => scrollToElement({ errorNode, expandTo })}
      />
    );
  }
  if (errorNode.error.type === "NoFilterMatches") {
    return (
      <ErrorItemContainer
        errorNode={errorNode}
        actions={[
          {
            action: () => {
              const hierarchyLevelDetails = getHierarchyLevelDetails?.(errorNode.id);
              hierarchyLevelDetails && onFilterClick?.(hierarchyLevelDetails);
            },
            label: localizedStrings.noFilteredChildrenChangeFilter,
            condition: () => true,
          },
        ]}
        message={localizedStrings.noFilteredChildren}
        scrollToElement={() => scrollToElement({ errorNode, expandTo })}
      />
    );
  }
  if (errorNode.error.type === "ChildrenLoad") {
    return (
      <ErrorItemContainer
        errorNode={errorNode}
        actions={[
          {
            action: () => reloadTree({ parentNodeId: errorNode.id, state: "reset" }),
            label: localizedStrings.retry,
            condition: () => true,
          },
        ]}
        message={localizedStrings.failedToCreateHierarchy}
        scrollToElement={() => scrollToElement({ errorNode, expandTo })}
      />
    );
  }

  return <ErrorItemContainer errorNode={errorNode} message={errorNode.error.message} scrollToElement={() => scrollToElement({ errorNode, expandTo })} />;
}

type ErrorItemContainerProps = {
  errorNode: PresentationHierarchyNode;
  message: string;
  actions?: { action: () => void; label: string; condition: () => boolean }[];
} & Pick<MessageWithLinkProps, "scrollToElement">;

function ErrorItemContainer({ errorNode, message, actions, scrollToElement }: ErrorItemContainerProps) {
  return (
    <ErrorRegion.Item
      message={<MessageWithLink linkLabel={errorNode.label} scrollToElement={scrollToElement} message={message} />}
      messageId={errorNode.id}
      actions={actions
        ?.filter(({ condition }) => condition())
        .map(({ label, action }) => (
          <Text key={label} variant="body-sm">
            <Anchor onClick={action} render={<button />}>
              {label}
            </Anchor>
          </Text>
        ))}
    />
  );
}

interface MessageWithLinkProps {
  scrollToElement: () => void;
  message: string;
  linkLabel?: string;
}

function MessageWithLink({ linkLabel, scrollToElement, message }: MessageWithLinkProps) {
  const splitMessage = message.split("{{node}}", 2);
  return (
    <div style={{ display: "flex", whiteSpace: "pre", flexWrap: "wrap" }}>
      <Text variant={"body-sm"}>{splitMessage[0]}</Text>
      <Text variant={"body-sm"}>
        <Anchor onClick={scrollToElement} render={<button />}>
          {linkLabel}
        </Anchor>
      </Text>
      {splitMessage[1] ? <Text variant={"body-sm"}>{splitMessage[1]}</Text> : null}
    </div>
  );
}

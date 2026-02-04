/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Anchor, Text } from "@stratakit/bricks";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils.js";
import { useLocalizationContext } from "./LocalizationContext.js";

import type React from "react";
import type { HierarchyLevelDetails, TreeRendererProps } from "../Renderers.js";
import type { TreeNode } from "../TreeNode.js";
import type { useErrorNodes } from "./FlatTreeNode.js";

/** @alpha */
export interface ErrorItemRendererProps extends Pick<TreeRendererProps, "getHierarchyLevelDetails"> {
  /** A node containing an error. */
  errorNode: ReturnType<typeof useErrorNodes>[number];
  /** A callback to reload a hierarchy level when an error occurs and `retry` button is clicked. */
  reloadTree: (options: { parentNodeId: string | undefined }) => void;
  /** A callback to scroll to the node associated with the error. */
  scrollToNode: (errorNode: TreeNode) => void;
  /** A callback to initiate filtering of the given hierarchy level. */
  filterHierarchyLevel?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
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
export function ErrorItemRenderer({
  errorNode,
  getHierarchyLevelDetails,
  filterHierarchyLevel,
  reloadTree,
  scrollToNode,
}: ErrorItemRendererProps): React.JSX.Element {
  const { localizedStrings } = useLocalizationContext();

  if (errorNode.error.type === "ResultSetTooLarge") {
    const limit = errorNode.error.resultSetSizeLimit;
    const onOverrideLimit = () => getHierarchyLevelDetails(errorNode.id)?.setSizeLimit(MAX_LIMIT_OVERRIDE);
    return (
      <ErrorItemContainer
        errorNode={errorNode}
        actions={[
          {
            action: () => {
              onOverrideLimit();
            },
            label: localizedStrings.increaseHierarchyLimit.replace("{{limit}}", MAX_LIMIT_OVERRIDE.toString()),
            condition: () => limit < MAX_LIMIT_OVERRIDE,
          },
          {
            action: () => {
              const hierarchyLevelDetails = getHierarchyLevelDetails(errorNode.id);
              hierarchyLevelDetails && filterHierarchyLevel?.(hierarchyLevelDetails);
            },
            label: localizedStrings.increaseHierarchyLimitWithFiltering,
            condition: () => !!filterHierarchyLevel && !!errorNode.isFilterable,
          },
        ]}
        message={localizedStrings.resultLimitExceeded.replace("{{limit}}", limit.toString())}
        scrollToElement={() => scrollToNode(errorNode)}
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
              const hierarchyLevelDetails = getHierarchyLevelDetails(errorNode.id);
              hierarchyLevelDetails && filterHierarchyLevel?.(hierarchyLevelDetails);
            },
            label: localizedStrings.noFilteredChildrenChangeFilter,
            condition: () => true,
          },
        ]}
        message={localizedStrings.noFilteredChildren}
        scrollToElement={() => scrollToNode(errorNode)}
      />
    );
  }
  if (errorNode.error.type === "ChildrenLoad") {
    return (
      <ErrorItemContainer
        errorNode={errorNode}
        actions={[
          {
            action: () => reloadTree({ parentNodeId: errorNode.id }),
            label: localizedStrings.retry,
            condition: () => true,
          },
        ]}
        message={localizedStrings.failedToCreateHierarchy}
        scrollToElement={() => scrollToNode(errorNode)}
      />
    );
  }

  return <ErrorItemContainer errorNode={errorNode} message={errorNode.error.message} scrollToElement={() => scrollToNode(errorNode)} />;
}

type ErrorItemContainerProps = {
  errorNode: TreeNode;
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
      {splitMessage[0]}
      <Anchor onClick={scrollToElement} render={<button />}>
        {linkLabel}
      </Anchor>
      {splitMessage[1] ? splitMessage[1] : null}
    </div>
  );
}

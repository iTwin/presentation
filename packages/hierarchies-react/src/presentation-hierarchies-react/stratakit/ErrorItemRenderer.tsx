/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Anchor, Text } from "@stratakit/bricks";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils.js";
import { useTranslation } from "../LocalizationContext.js";

import type { JSX } from "react";
import type { HierarchyLevelDetails, TreeRendererProps } from "../Renderers.js";
import type { ErrorInfo, TreeNode } from "../TreeNode.js";

/** @alpha */
export interface ErrorItemRendererProps extends Pick<TreeRendererProps, "getHierarchyLevelDetails"> {
  /** The tree node associated with the error. Used for displaying the node label in error messages and for scrolling to the node. */
  treeNode: Omit<TreeNode, "errors">;
  /** The error to render. */
  error: ErrorInfo;
  /** A callback to reload a hierarchy level when an error occurs and `retry` button is clicked. */
  reloadTree: (options: { parentNodeId: string | undefined }) => void;
  /** A callback to scroll to the node associated with the error. */
  scrollToNode: (treeNode: Omit<TreeNode, "errors">) => void;
  /** A callback to initiate filtering of the given hierarchy level. */
  filterHierarchyLevel?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
}

/**
 * Renders StrataKit `<ErrorRegion.Item />` for all supported error types:
 * - `ResultSetTooLarge` - renders `resultLimitExceeded` message with actions to increase limit or apply filtering
 * - `NoFilterMatches` - renders `noFilteredChildren` message with action to change filter
 * - `ChildrenLoad` - renders `failedToCreateHierarchy` message with action to retry loading
 * - `Unknown` - renders message set on error object.
 *
 * @alpha
 */
export function ErrorItemRenderer({
  treeNode,
  error,
  getHierarchyLevelDetails,
  filterHierarchyLevel,
  reloadTree,
  scrollToNode,
}: ErrorItemRendererProps): JSX.Element {
  const translate = useTranslation();

  if (error.type === "ResultSetTooLarge") {
    const limit = error.resultSetSizeLimit;
    const onOverrideLimit = () => getHierarchyLevelDetails(treeNode.id)?.setSizeLimit(MAX_LIMIT_OVERRIDE);
    return (
      <ErrorItemContainer
        treeNode={treeNode}
        error={error}
        actions={[
          {
            action: () => {
              onOverrideLimit();
            },
            label: translate("increaseHierarchyLimit").replace("{{limit}}", MAX_LIMIT_OVERRIDE.toString()),
            condition: () => limit < MAX_LIMIT_OVERRIDE,
          },
          {
            action: () => {
              const hierarchyLevelDetails = getHierarchyLevelDetails(treeNode.id);
              hierarchyLevelDetails && filterHierarchyLevel?.(hierarchyLevelDetails);
            },
            label: translate("increaseHierarchyLimitWithFiltering"),
            condition: () => !!filterHierarchyLevel && !!treeNode.isFilterable,
          },
        ]}
        message={translate("resultLimitExceeded").replace("{{limit}}", limit.toString())}
        scrollToElement={() => scrollToNode(treeNode)}
      />
    );
  }
  if (error.type === "NoFilterMatches") {
    return (
      <ErrorItemContainer
        treeNode={treeNode}
        error={error}
        actions={[
          {
            action: () => {
              const hierarchyLevelDetails = getHierarchyLevelDetails(treeNode.id);
              hierarchyLevelDetails && filterHierarchyLevel?.(hierarchyLevelDetails);
            },
            label: translate("noFilteredChildrenChangeFilter"),
            condition: () => true,
          },
        ]}
        message={translate("noFilteredChildren")}
        scrollToElement={() => scrollToNode(treeNode)}
      />
    );
  }
  if (error.type === "ChildrenLoad") {
    return (
      <ErrorItemContainer
        treeNode={treeNode}
        error={error}
        actions={[
          {
            action: () => reloadTree({ parentNodeId: treeNode.id }),
            label: translate("retry"),
            condition: () => true,
          },
        ]}
        message={translate("failedToCreateHierarchy")}
        scrollToElement={() => scrollToNode(treeNode)}
      />
    );
  }
  return <ErrorItemContainer treeNode={treeNode} error={error} message={error.message} scrollToElement={() => scrollToNode(treeNode)} />;
}

type ErrorItemContainerProps = {
  treeNode: Omit<TreeNode, "errors">;
  error: ErrorInfo;
  message: string;
  actions?: { action: () => void; label: string; condition: () => boolean }[];
} & Pick<MessageWithLinkProps, "scrollToElement">;

function ErrorItemContainer({ treeNode, error, message, actions, scrollToElement }: ErrorItemContainerProps) {
  return (
    <ErrorRegion.Item
      message={<MessageWithLink linkLabel={treeNode.label} scrollToElement={scrollToElement} message={message} />}
      messageId={`${treeNode.id}:${error.id}`}
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

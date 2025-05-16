/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactElement } from "react";
import { Anchor, Text } from "@stratakit/bricks";
import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { ErrorNode } from "./FlatTreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";

/**
 * Interface containing error item related actions.
 *
 * @alpha
 */
interface TreeErrorItemProps {
  /** A callback to reload a hierarchy level when an error occurs and `retry` button is clicked. */
  reloadTree: (options: { parentNodeId: string | undefined; state: "reset" }) => void;
  /** Action to perform when the filter button is clicked for this node. */
  onFilterClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
  /** Action to perform when an error accurs and node label is clicked in the error message */
  scrollToElement: (errorNode: ErrorNode) => void;
}
/**
 * Interface containing building blocks for `TreeErrorRenderer`.
 *
 * @alpha
 */
interface TreeErrorRendererOwnProps {
  /** List of errors to be displayed */
  errorList: ErrorNode[];
  // Callback to render custom error messages. Component should be wrapped in `ErrorRegion.Item` from `@itwin/itwinui-react` package.
  renderError?: ({ errorNode, scrollToElement }: { errorNode: ErrorNode; scrollToElement: () => void }) => ReactElement;
}

/** @alpha */
export type TreeErrorRendererProps = TreeErrorRendererOwnProps & TreeErrorItemProps & Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">>;

/**
 * A component that renders error display dropdown using the `unstable_ErrorRegion` component from `@itwin/itwinui-react`.
 * As input, the component uses a list of `ErrorNode` objects, which are generally created using the `useErrorList` hook.
 *
 * @alpha
 */
export function TreeErrorRenderer({ errorList, reloadTree, scrollToElement, getHierarchyLevelDetails, onFilterClick, renderError }: TreeErrorRendererProps) {
  const { localizedStrings } = useLocalizationContext();
  const errorItems = errorList.map((errorNode) => {
    if (renderError) {
      return renderError({ errorNode, scrollToElement: () => scrollToElement(errorNode) });
    }

    if (errorNode.error.type === "ResultSetTooLarge") {
      const limit = errorNode.error.resultSetSizeLimit;
      const onOverrideLimit = getHierarchyLevelDetails ? () => getHierarchyLevelDetails(errorNode.parent?.id)?.setSizeLimit(MAX_LIMIT_OVERRIDE) : undefined;
      return (
        <ErrorItemContainer
          key={errorNode.error.id}
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
                const hierarchyLevelDetails = getHierarchyLevelDetails?.(errorNode.parent?.id);
                hierarchyLevelDetails && onFilterClick?.(hierarchyLevelDetails);
              },
              label: localizedStrings.increaseHierarchyLimitWithFiltering,
              condition: () => !!onFilterClick && !!errorNode.parent?.isFilterable,
            },
          ]}
          message={localizedStrings.resultLimitExceeded.replace("{{limit}}", limit.toString())}
          scrollToElement={() => scrollToElement(errorNode)}
        />
      );
    }
    if (errorNode.error.type === "NoFilterMatches") {
      return (
        <ErrorItemContainer
          key={errorNode.error.id}
          errorNode={errorNode}
          actions={[
            {
              action: () => {
                const hierarchyLevelDetails = getHierarchyLevelDetails?.(errorNode.parent?.id);
                hierarchyLevelDetails && onFilterClick?.(hierarchyLevelDetails);
              },
              label: localizedStrings.noFilteredChildrenChangeFilter,
              condition: () => true,
            },
          ]}
          message={localizedStrings.noFilteredChildren}
          scrollToElement={() => scrollToElement(errorNode)}
        />
      );
    }
    return (
      <ErrorItemContainer
        key={errorNode.error.id}
        errorNode={errorNode}
        actions={[
          {
            action: () => reloadTree({ parentNodeId: errorNode.parent?.id, state: "reset" }),
            label: localizedStrings.retry,
            condition: () => true,
          },
        ]}
        message={localizedStrings.failedToCreateHierarchy}
        scrollToElement={() => scrollToElement(errorNode)}
      />
    );
  });

  return (
    <ErrorRegion.Root
      style={{ width: "100%" }}
      label={errorList.length !== 0 ? `${errorList.length} ${localizedStrings?.issuesFound}` : undefined}
      items={errorItems}
    />
  );
}

type ErrorItemContainerProps = {
  errorNode: ErrorNode;
  message: string;
  actions?: { action: () => void; label: string; condition: () => boolean }[];
} & Pick<MessageWithLinkProps, "scrollToElement">;

function ErrorItemContainer({ errorNode, message, actions, scrollToElement }: ErrorItemContainerProps) {
  return (
    <ErrorRegion.Item
      message={<MessageWithLink linkLabel={errorNode.parent?.label} scrollToElement={scrollToElement} message={message} />}
      messageId={errorNode.error.id}
      actions={
        <div style={{ display: "flex", flexDirection: "column" }}>
          {actions
            ?.filter(({ condition }) => condition())
            .map(({ label, action }) => (
              <Anchor key={label} onClick={action}>
                {label}
              </Anchor>
            ))}
        </div>
      }
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
      <Anchor onClick={scrollToElement}>{linkLabel}</Anchor>
      {splitMessage[1] ? <Text variant={"body-sm"}>{splitMessage[1]}</Text> : null}
    </div>
  );
}

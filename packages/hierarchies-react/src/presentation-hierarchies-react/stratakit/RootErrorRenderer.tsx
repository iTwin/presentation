/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Button, Text } from "@stratakit/bricks";
import { Icon } from "@stratakit/foundations";
import errorSvg from "@stratakit/icons/status-error.svg";
import { ErrorInfo } from "../TreeNode.js";
import { UseTreeResult } from "../UseTree.js";
import { useLocalizationContext } from "./LocalizationContext.js";

/**
 * @alpha
 */
export type RootErrorRendererProps = {
  /** Root error to be displayed */
  rootError: ErrorInfo;
} & Pick<UseTreeResult, "getHierarchyLevelDetails" | "reloadTree">;

/**
 * A component that renders root node error state.
 *
 * @internal
 */
export function RootErrorRenderer({ rootError, getHierarchyLevelDetails, reloadTree }: RootErrorRendererProps) {
  const { localizedStrings } = useLocalizationContext();

  if (rootError.type === "ResultSetTooLarge") {
    const onOverrideLimit = () => getHierarchyLevelDetails(undefined)?.setSizeLimit("unbounded");
    return (
      <RootErrorContainer
        message={localizedStrings.rootResultLimitExceeded.replace("{{limit}}", rootError.resultSetSizeLimit.toString())}
        actions={[
          {
            action: onOverrideLimit,
            label: localizedStrings.increaseHierarchyLimitToUnlimited,
            condition: () => true,
          },
        ]}
      />
    );
  }

  return (
    <RootErrorContainer
      message={localizedStrings.failedToCreateRootHierarchy}
      actions={[
        {
          action: () => reloadTree({ parentNodeId: undefined, state: "reset" }),
          label: localizedStrings.retry,
          condition: () => true,
        },
      ]}
    />
  );
}

interface RootErrorContainerProps {
  message: string;
  actions?: { action: () => void; label: string; condition: () => boolean }[];
}

function RootErrorContainer({ actions, message }: RootErrorContainerProps) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}>
      <Icon href={errorSvg} size="large" />
      <Text variant={"body-sm"} style={{ textAlign: "center" }}>
        {message}
      </Text>
      {actions
        ?.filter(({ condition }) => condition())
        .map((action) => {
          return (
            <Button key={action.label} onClick={() => action.action()}>
              {action.label}
            </Button>
          );
        })}
    </div>
  );
}

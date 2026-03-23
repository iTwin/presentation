/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Button, Text } from "@stratakit/bricks";
import { Icon } from "@stratakit/foundations";
import { useTranslation } from "../LocalizationContext.js";

import errorSvg from "@stratakit/icons/status-error.svg";

import type { JSX } from "react";
import type { RootErrorRendererProps } from "../Renderers.js";
import type { ErrorInfo } from "../TreeNode.js";

/**
 * @alpha
 */
export type StrataKitRootErrorRendererProps = {
  /**
   * Root error to be displayed
   */
  error: ErrorInfo;
} & RootErrorRendererProps;

/**
 * A component that renders root node error state.
 *
 * @alpha
 */
export function StrataKitRootErrorRenderer({ error, getHierarchyLevelDetails, reloadTree }: StrataKitRootErrorRendererProps): JSX.Element {
  const translate = useTranslation();

  if (error.type === "ResultSetTooLarge") {
    const onOverrideLimit = () => getHierarchyLevelDetails(undefined)?.setSizeLimit("unbounded");
    return (
      <RootErrorContainer
        message={translate("rootResultLimitExceeded").replace("{{limit}}", error.resultSetSizeLimit.toString())}
        actions={[
          {
            action: onOverrideLimit,
            label: translate("increaseHierarchyLimitToUnlimited"),
            condition: () => true,
          },
        ]}
      />
    );
  }

  return (
    <RootErrorContainer
      message={translate("failedToCreateRootHierarchy")}
      actions={[
        {
          action: () => reloadTree({ parentNodeId: undefined, state: "reset" }),
          label: translate("retry"),
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

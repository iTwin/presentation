/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Button, Typography } from "@mui/material";
import { Icon } from "@stratakit/mui";
import { useTranslation } from "../LocalizationContext.js";

import errorSvg from "@stratakit/icons/status-error.svg";

import type { JSX } from "react";
import type { RootErrorRendererProps } from "../Renderers.js";

/**
 * @alpha
 */
export type StrataKitRootErrorRendererProps = RootErrorRendererProps;

/**
 * A component that renders root node error state.
 *
 * @alpha
 */
export function StrataKitRootErrorRenderer({
  error,
  getHierarchyLevelDetails,
  reloadTree,
}: StrataKitRootErrorRendererProps): JSX.Element {
  const translate = useTranslation();

  if (error.type === "ResultSetTooLarge") {
    const onOverrideLimit = () => getHierarchyLevelDetails(undefined)?.setSizeLimit("unbounded");
    return (
      <RootErrorContainer
        message={translate("rootResultLimitExceeded").replace("{{limit}}", error.resultSetSizeLimit.toString())}
        actions={[
          { action: onOverrideLimit, label: translate("increaseHierarchyLimitToUnlimited"), condition: () => true },
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
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <Icon href={errorSvg} size="large" />
      <Typography variant="caption" style={{ textAlign: "center" }}>
        {message}
      </Typography>
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

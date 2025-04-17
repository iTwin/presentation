/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactElement } from "react";
import { Button, Icon, Text } from "@itwin/itwinui-react/bricks";
import { useTree } from "../UseTree.js";
import { ErrorNode } from "./FlatTreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";

const errorSvg = new URL("@itwin/itwinui-icons/status-error.svg", import.meta.url).href;

/**
 * @alpha
 */
export type RootErrorRendererProps = {
  /** Root error to be displayed */
  errorNode: ErrorNode;
  // Callback to render custom root errors.
  renderRootError?: ({ errorNode }: { errorNode: ErrorNode }) => ReactElement;
} & Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails" | "reloadTree">;

/**
 * A component that renders root node error state.
 *
 * @alpha
 */
export function RootErrorRenderer({ errorNode, renderRootError, getHierarchyLevelDetails, reloadTree }: RootErrorRendererProps) {
  const { localizedStrings } = useLocalizationContext();

  if (renderRootError) {
    return renderRootError({ errorNode });
  }

  if (errorNode.error.type === "ResultSetTooLarge") {
    const onOverrideLimit = () => getHierarchyLevelDetails(undefined)?.setSizeLimit("unbounded");
    return (
      <RootErrorContainer
        message={localizedStrings.resultLimitExceeded.replace("{{limit}}", errorNode.error.resultSetSizeLimit.toString())}
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

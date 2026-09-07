/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext, useMemo, useState } from "react";
import { Menu } from "@mui/material";
import { useTranslation } from "../LocalizationContext.js";

import type { PropsWithChildren, ReactNode } from "react";

interface TreeContextMenuContextValue {
  openContextMenu: (props: { position: { x: number; y: number }; actions: ReactNode[] }) => void;
}

const TreeContextMenuContext = createContext<TreeContextMenuContextValue | undefined>(undefined);

/** @internal */
export function useTreeContextMenu() {
  return useContext(TreeContextMenuContext);
}

/**
 * Renders a single context menu shared by all tree items, avoiding the cost of mounting a `Menu` per row.
 *
 * @internal
 */
export function TreeContextMenuProvider({ children }: PropsWithChildren) {
  const translate = useTranslation();
  const [menuProps, setMenuProps] = useState<{ position: { x: number; y: number }; actions: ReactNode[] } | undefined>(
    undefined,
  );
  const contextValue = useMemo<TreeContextMenuContextValue>(() => ({ openContextMenu: setMenuProps }), []);
  return (
    <TreeContextMenuContext.Provider value={contextValue}>
      {children}
      <Menu
        open={!!menuProps}
        onClose={() => setMenuProps(undefined)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuProps(undefined);
        }}
        anchorReference="anchorPosition"
        anchorPosition={menuProps ? { top: menuProps.position.y, left: menuProps.position.x } : undefined}
        aria-label={translate("more")}
        onClick={() => setMenuProps(undefined)}
      >
        {menuProps?.actions}
      </Menu>
    </TreeContextMenuContext.Provider>
  );
}

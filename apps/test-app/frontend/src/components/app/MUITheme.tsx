/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createTheme } from "@mui/material";

export const skTheme = createTheme({
  palette: {
    primary: {
      main: "#188166", // var(--stratakit-color-bg-accent-base)
    },
    action: {
      hover: "var(--stratakit-color-bg-glow-on-surface-neutral-hover)",
      focus: undefined,
      selectedOpacity: 0.16,
    },
  },
  typography: {
    fontFamily: "var(--stratakit-font-family-sans)",
    fontWeightRegular: 400,
    body1: {
      fontSize: 12,
    },
  },
  shape: {
    borderRadius: 0,
  },
  spacing: 4,
  components: {
    MuiSvgIcon: {
      styleOverrides: {
        root: {
          width: 16,
          height: 16,
        },
      },
    },
    // https://github.com/mui/material-ui/blob/master/packages/mui-material/src/IconButton/IconButton.js
    MuiIconButton: {
      defaultProps: {
        size: "small",
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 4,
          padding: 4,
          ":focus": {
            outline: "2px solid var(--stratakit-color-border-accent-strong)",
            outlineOffset: 1,
          },
          "&:hover": {
            borderColor: `color-mix(in oklch,var(--stratakit-color-border-shadow-base)100.0%,var(--stratakit-color-glow-hue)var(--stratakit-color-border-glow-base-hover-\\%))`,
            backgroundColor: "var(--stratakit-color-bg-glow-on-surface-neutral-hover)",
          },
          "&.Mui-disabled": {
            backgroundColor: "var(--stratakit-color-bg-glow-on-surface-disabled)",

            "& .MuiSvgIcon-root": {
              color: "var(--stratakit-color-text-neutral-disabled)",
            },
          },

          "& .MuiSvgIcon-root": {
            color: "var(--stratakit-color-icon-neutral-base)",
          },
        },
      },
    },
    // https://github.com/mui/mui-x/blob/5d0f1592426741b7ad9fa7ac9087527f31f36454/packages/x-tree-view/src/TreeItem/TreeItem.tsx#L42
    MuiRichTreeView: {
      styleOverrides: {
        root: {
          "--SkTreeView-firstChildIndentation": "var(--stratakit-space-x2)",
          "--SkTreeView-itemChildrenIndentation": "calc(var(--stratakit-space-x1) + var(--stratakit-space-x05))",

          "& .MuiTreeItem-content": {
            padding: 0,
            paddingLeft: "calc(var(--SkTreeView-firstChildIndentation) + var(--SkTreeView-itemChildrenIndentation) * var(--TreeView-itemDepth))",
            paddingRight: 4,
            minBlockSize: 28,

            "&:has(.MuiTreeItem-sublabel)": {
              minBlockSize: 44,
            },
          },

          "& .MuiCollapse-root": {
            transition: "none",
          },

          "& .MuiTreeItem-label": {
            textAlign: "start",
          },

          "& .MuiTreeItem-iconContainer": {
            minBlockSize: 24,
            minInlineSize: 24,
            alignItems: "center",
          },
        },
      },
    },
  },
});

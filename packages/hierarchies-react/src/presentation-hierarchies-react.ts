/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

export type {
  GenericErrorInfo,
  TreeNode,
  ErrorInfo,
  ResultSetTooLargeErrorInfo,
} from "./presentation-hierarchies-react/TreeNode.js";
export { useTree, useUnifiedSelectionTree } from "./presentation-hierarchies-react/UseTree.js";
export { useNodeHighlighting } from "./presentation-hierarchies-react/UseNodeHighlighting.js";
export type { HierarchyLevelDetails, TreeRendererProps } from "./presentation-hierarchies-react/Renderers.js";
export { useIModelTree, useIModelUnifiedSelectionTree } from "./presentation-hierarchies-react/UseIModelTree.js";

export { LOCALIZATION_NAMESPACES } from "./presentation-hierarchies-react/internal/LocalizedStrings.js";
export type { FlatTreeItem } from "./presentation-hierarchies-react/FlatTreeNode.js";
export { useFlatTreeItems, useErrorNodes } from "./presentation-hierarchies-react/FlatTreeNode.js";
export { LocalizationContextProvider } from "./presentation-hierarchies-react/LocalizationContext.js";

export type { HierarchyProvider } from "@itwin/presentation-hierarchies";
export { GenericInstanceFilter, HierarchyNode, getLogger, setLogger } from "@itwin/presentation-hierarchies";
export type { SelectionStorage } from "@itwin/unified-selection";

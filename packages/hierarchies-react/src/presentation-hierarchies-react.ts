/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// Explicit namespace import to ensure stable API Extractor alias
// This import is not used directly but ensures react/jsx-runtime gets a consistent alias in API reports

import type * as ReactJsxRuntime from "react/jsx-runtime";

/**
 * @internal
 * Do not use - this export exists only to ensure deterministic API Extractor import aliases
 */
export type { ReactJsxRuntime };

export type { GenericErrorInfo, TreeNode, ErrorInfo, ResultSetTooLargeErrorInfo } from "./presentation-hierarchies-react/TreeNode.js";
export { useTree, useUnifiedSelectionTree } from "./presentation-hierarchies-react/UseTree.js";
export { useNodeHighlighting } from "./presentation-hierarchies-react/UseNodeHighlighting.js";
export type { HierarchyLevelDetails, TreeRendererProps } from "./presentation-hierarchies-react/Renderers.js";
export { useIModelTree, useIModelUnifiedSelectionTree } from "./presentation-hierarchies-react/UseIModelTree.js";
export type { TreeActionBaseAttributes } from "./presentation-hierarchies-react/stratakit/TreeAction.js";
export { TreeActionBase } from "./presentation-hierarchies-react/stratakit/TreeAction.js";
export { TreeNodeFilterAction } from "./presentation-hierarchies-react/stratakit/TreeNodeFilterAction.js";
export { TreeNodeRenameAction } from "./presentation-hierarchies-react/stratakit/TreeNodeRenameAction.js";
export type { StrataKitTreeRendererAttributes } from "./presentation-hierarchies-react/stratakit/TreeRenderer.js";
export { StrataKitTreeRenderer } from "./presentation-hierarchies-react/stratakit/TreeRenderer.js";
export { StrataKitRootErrorRenderer } from "./presentation-hierarchies-react/stratakit/RootErrorRenderer.js";
export { TreeErrorRenderer } from "./presentation-hierarchies-react/stratakit/TreeErrorRenderer.js";
export { ErrorItemRenderer } from "./presentation-hierarchies-react/stratakit/ErrorItemRenderer.js";
export type { FlatTreeItem } from "./presentation-hierarchies-react/stratakit/FlatTreeNode.js";
export { useFlatTreeItems, useErrorNodes } from "./presentation-hierarchies-react/stratakit/FlatTreeNode.js";
export { LocalizationContextProvider } from "./presentation-hierarchies-react/stratakit/LocalizationContext.js";

export type { HierarchyProvider } from "@itwin/presentation-hierarchies";
export { GenericInstanceFilter, HierarchyNode, getLogger, setLogger } from "@itwin/presentation-hierarchies";
export type { SelectionStorage } from "@itwin/unified-selection";
